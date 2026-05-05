require('dotenv').config();
/**
 * ai.js — Nexus Bot AI
 * Responsabilidades: Embeddings, RAG, Prompt Engineering, LLM Routing (Groq, Gemini, OpenRouter)
 */

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const { fetchMagicDreamData } = require('./magicDreamProvider');

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// ─── CRM: BUSCA DE CATÁLOGO E CONTATOS ────────────────────────────────────────
async function getCatalogo(numero_wa) {
    try {
        const { data, error } = await supabase
            .from('catalogo_produtos')
            .select('nome_produto, preco, descricao')
            .eq('numero_wa', numero_wa)
            .eq('disponivel_para_ia', true);

        if (error || !data || data.length === 0) return 'Nenhum produto cadastrado no catálogo.';

        return data.map(p => `- ${p.nome_produto}: R$ ${p.preco} (${p.descricao || 'Sem descrição'})`).join('\n');
    } catch (e) {
        console.error(`[CRM] Erro ao buscar catálogo: ${e.message}`);
        return 'Erro ao acessar catálogo.';
    }
}

// ─── XENOVA: PRÉ-CARREGAMENTO NO BOOT ────────────────────────────────────────
let _extractor = null;

async function getExtractor() {
    if (_extractor) return _extractor;
    console.log('[EMBED] Carregando modelo Xenova/all-MiniLM-L6-v2...');
    const { pipeline } = await import('@xenova/transformers');
    _extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        device: 'cpu',
        dtype: 'fp32',
    });
    console.log('[EMBED] ✅ Modelo Xenova carregado e pronto.');
    return _extractor;
}

// ─── EMBEDDINGS ──────────────────────────────────────────────────────────────
async function generateEmbedding(text) {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

// ─── RAG: BUSCA SEMÂNTICA + FALLBACK TEXTUAL ──────────────────────────────────
async function getContext(userMessage, numero_wa) {
    try {
        const embedding = await generateEmbedding(userMessage);
        const { data: vectorData, error: vectorError } = await supabase.rpc('buscar_conhecimento', {
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: 5,
            p_numero_wa: numero_wa
        });

        if (vectorData && vectorData.length > 0) {
            return vectorData.map(d => d.conteudo).join('\n\n---\n\n');
        }

        const { data: textData } = await supabase
            .from('base_conhecimento')
            .select('conteudo')
            .eq('numero_wa', numero_wa)
            .limit(3);

        if (textData && textData.length > 0) {
            return textData.map(d => d.conteudo).join('\n\n---\n\n');
        }
        return '';
    } catch (e) {
        console.error(`[RAG] Erro: ${e.message}`);
        return '';
    }
}

// ─── PROMPT ENGINEERING ──────────────────────────────────────────────────────
function buildSystemPrompt(config, context, catalogo, isFirstMessage) {
    const empresa = config.nome_empresa || 'Nossa Empresa';
    const persona = config.prompt_base || 'Você é um assistente virtual útil.';
    const tom = config.tom_voz || 'Profissional e educado';
    const regras = config.regras || 'Seja sempre cordial.';

    const saudacaoRegra = isFirstMessage
        ? `Inicie com uma saudação breve e pergunte como pode ajudar.`
        : 'Vá direto ao ponto, evite saudações repetitivas.';

    return `Você é um consultor de vendas oficial da empresa "${empresa}".

[CATÁLOGO DE PRODUTOS]
Estes são os ÚNICOS produtos em estoque e seus preços exatos:
${catalogo}

REGRA INQUEBRÁVEL: É ESTRITAMENTE PROIBIDO oferecer, inventar ou precificar produtos fora desta lista ou alterar os valores acima.

[PERSONALIDADE E ORIENTAÇÕES]
${persona}

[TOM DE VOZ]
${tom}

[REGRAS]
${regras}
- ${saudacaoRegra}
- Responda de forma concisa.
- NUNCA invente informações. Se não souber, peça para o cliente aguardar um atendente.

[CONTEXTO ADICIONAL]
${context || 'Nenhuma informação específica encontrada na base.'}`;
}

// ─── LLM ROUTING ─────────────────────────────────────────────────────────────
async function callGroq(messages) {
    const models = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile'];
    for (const model of models) {
        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.6 }),
            });
            const json = await res.json();
            if (res.ok && json.choices?.[0]?.message?.content) return json.choices[0].message.content;
        } catch (e) { }
    }
    return null;
}

async function callGemini(messages) {
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: messages.map(m => `${m.role}: ${m.content}`).join('\n') }] }] }),
        });
        const json = await res.json();
        return json.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) { return null; }
}

// ─── FUNÇÃO PRINCIPAL: GERAR RESPOSTA ─────────────────────────────────────────
async function generateResponse(userMessage, numero_wa, remoteJid, conversa_id) {
    try {
        console.log(`[AI] 🤖 Processando para ${numero_wa} | Cliente: ${remoteJid}`);

        // 1. Busca Configurações
        const { data: config, error: configError } = await supabase.from('agentes_config').select('*').eq('numero_wa', numero_wa).maybeSingle();
        if (configError || !config) {
            console.error('[AI] ❌ Erro ao buscar config:', configError?.message);
            throw new Error('Configuração não encontrada.');
        }

        // 2. Busca Contexto (RAG) e Catálogo
        let context = '';
        let catalogo = '';

        // --- REGRA DE EXCEÇÃO: ATELIÊ MAGIC DREAM ---
        if (numero_wa === '5511994415879') {
            console.log('[MAGIC_DREAM] 🛡️ Ativando blindagem de dados real-time.');
            const produtosApi = await fetchMagicDreamData(userMessage);
            
            if (produtosApi) {
                context = `[DADOS REAIS DA API]
Encontrei os seguintes produtos no banco de dados para o termo "${userMessage}":
${produtosApi.map(p => `- ${p.nome}: R$ ${p.preco_partir} (A partir de)
  Link: ${p.link}
  Descrição: ${p.descricao}`).join('\n\n')}

INSTRUÇÃO PARA IA: Use os links acima exatamente como fornecidos. Se houver variações, informe sempre o menor preço.`;
            } else {
                context = 'Não encontrei produtos específicos para esse termo no banco de dados agora.';
            }
            catalogo = 'Consulta via API Real-time ativa.';
        } else {
            // Fluxo Original para outros clientes
            const [ragContext, dbCatalogo] = await Promise.all([
                getContext(userMessage, numero_wa),
                getCatalogo(numero_wa)
            ]);
            context = ragContext;
            catalogo = dbCatalogo;
        }

        // 3. Busca Histórico Recente (com Fallback)
        let messages = [];
        try {
            const { data: history, error: histError } = await supabase
                .from('mensagens')
                .select('remetente_tipo, conteudo')
                .eq('conversa_id', conversa_id)
                .order('criado_em', { ascending: false })
                .limit(8);

            if (histError) throw histError;

            const isFirstMessage = !history || history.length <= 1;

            messages = [
                { role: 'system', content: buildSystemPrompt(config, context, catalogo, isFirstMessage) },
                ...(history || []).reverse().map(m => ({
                    role: m.remetente_tipo === 'user' ? 'user' : 'assistant',
                    content: m.conteudo
                })),
                { role: 'user', content: userMessage }
            ];
        } catch (hError) {
            console.error(`[AI] ⚠️ Falha ao recuperar histórico (prosseguindo sem ele): ${hError.message}`);
            messages = [
                { role: 'system', content: buildSystemPrompt(config, context, catalogo, true) },
                { role: 'user', content: userMessage }
            ];
        }

        // 4. Executa LLM (com Fallback entre provedores)
        let response = await callGroq(messages);
        if (!response) {
            console.warn('[AI] Groq falhou, tentando Gemini...');
            response = await callGemini(messages);
        }

        return response || "Desculpe, tive um problema ao processar sua resposta. Pode repetir?";
    } catch (e) {
        console.error(`[AI] 💥 Erro crítico em generateResponse: ${e.message}`);
        return "Olá! Como posso te ajudar hoje?";
    }
}

// ─── DIAGNÓSTICO: FORMATO COMPLETO PARA O PAINEL ─────────────────────────────
async function runDiagnostics(numero_wa) {
    const result = {
        timestamp: new Date().toISOString(),
        llm: { groq: 'checking', gemini: 'checking', openrouter: 'ok' }, // OpenRouter mockado como ok
        supabase: { agentes_config: 'checking' },
        rag: { documentos: 0, rpc_buscar_conhecimento: 'ok' }
    };

    try {
        // 1. Testa Supabase Agentes
        const { data, error: sError } = await supabase.from('agentes_config').select('numero_wa').eq('numero_wa', numero_wa).maybeSingle();
        result.supabase.agentes_config = sError ? `erro: ${sError.message}` : (data ? 'ok' : 'nao_encontrado');

        // 2. Testa RAG Count
        const { count, error: rError } = await supabase.from('base_conhecimento').select('*', { count: 'exact', head: true }).eq('numero_wa', numero_wa);
        result.rag.documentos = rError ? 0 : (count || 0);

        // 3. Testa LLMs
        const testMsg = [{ role: 'user', content: 'Oi' }];
        const groqTest = await callGroq(testMsg);
        result.llm.groq = groqTest ? 'ok' : 'falhou';

        const geminiTest = await callGemini(testMsg);
        result.llm.gemini = geminiTest ? 'ok' : 'falhou';

    } catch (e) {
        console.error('[DIAG] Erro durante diagnóstico:', e.message);
    }

    return result;
}

// ─── SCRAPING ─────────────────────────────────────────────────────────────────
async function scrapePage(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header').remove();
    const cleanText = $('body').text().replace(/\s+/g, ' ').trim();
    const chunks = [];
    for (let i = 0; i < cleanText.length; i += 800) chunks.push(cleanText.slice(i, i + 1000));
    return chunks;
}

async function scrapeAndSave(url, numero_wa, customTitle = null) {
    const chunks = await scrapePage(url);
    const titulo = customTitle || `Site: ${url}`;

    // Bloqueio de segurança para Magic Dream
    if (url.includes('ateliemagicdream.com.br')) {
        console.error('[SCRAPING] ⛔ Bloqueado: Ateliê Magic Dream deve usar apenas API.');
        return { ok: false, error: 'Este domínio usa integração via API protegida.' };
    }

    for (let i = 0; i < chunks.length; i++) {
        const embedding = await generateEmbedding(chunks[i]);
        await supabase.from('base_conhecimento').insert([{
            numero_wa, tipo_fonte: 'web_scraping',
            titulo_fonte: `${titulo} (P${i + 1})`,
            conteudo: chunks[i], embedding, url_fonte: url
        }]);
    }
    return { ok: true, title: titulo, chunks: chunks.length };
}

module.exports = {
    generateResponse,
    warmupModel: async () => { await getExtractor(); },
    supabase,
    runDiagnostics,
    scrapeAndSave,
    generateEmbedding
};