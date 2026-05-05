require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const {
    generateResponse,
    warmupModel,
    supabase,
    runDiagnostics,
    scrapeAndSave,
    generateEmbedding
} = require('./ai');

const app = express();
app.use(express.json());

// ─── LOG DE AUDITORIA ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
    console.log(`[REQ] ${new Date().toLocaleTimeString()} | ${req.method} ${req.url}`);
    next();
});

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ─── SERVIR FRONTEND ──────────────────────────────────────────────────────────
app.use(express.static('frontend'));

const activeSessions = {};
const pendingSessions = {};
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ─── UTILITÁRIO: LIMPEZA DE PASTA DE AUTH ────────────────────────────────────
function clearAuthFolder(numero_wa) {
    const authFolder = path.resolve(`auth_info_${numero_wa}`);
    try {
        if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
            console.log(`[WA] 🗑️ Pasta de auth removida para ${numero_wa}`);
        }
    } catch (e) {
        console.error(`[WA] ❌ Erro ao remover pasta de auth: ${e.message}`);
    }
}

// ─── MOTOR DO WHATSAPP (REFORMULADO) ─────────────────────────────────────────
async function startWhatsApp(numero_wa, res = null) {
    if (activeSessions[numero_wa]) {
        if (res && !res.headersSent) res.json({ status: 'ja_conectado' });
        return;
    }

    console.log(`[WA] 🚀 Iniciando sessão para ${numero_wa}...`);
    const { state, saveCreds } = await useMultiFileAuthState(`auth_info_${numero_wa}`);

    let version = [2, 3000, 1015901307];
    try {
        const r = await fetchLatestBaileysVersion();
        if (r?.version) version = r.version;
    } catch { }

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Mac OS', 'Safari', '17.0'],
        auth: state,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
    });

    activeSessions[numero_wa] = sock;

    sock.ev.process(async (events) => {
        // 1. Atualização de Credenciais
        if (events['creds.update']) {
            await saveCreds();
        }

        // 2. Atualização de Conexão
        if (events['connection.update']) {
            const update = events['connection.update'];
            const { connection, lastDisconnect } = update;
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            if (connection === 'close') {
                console.log(`[WA] ⚠️ Conexão fechada (${numero_wa}). Status: ${statusCode}`);
                delete activeSessions[numero_wa];
                delete pendingSessions[numero_wa];

                const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
                if (isLoggedOut) {
                    console.log(`[WA] 🚨 Sessão encerrada permanentemente.`);
                    clearAuthFolder(numero_wa);
                } else {
                    console.log(`[WA] 🔄 Reconectando em 6s...`);
                    setTimeout(() => startWhatsApp(numero_wa), 6000);
                }
            }

            if (connection === 'open') {
                console.log(`[WA] ✅ ${numero_wa} CONECTADO!`);
                delete pendingSessions[numero_wa];
            }

            // Pairing Code
            if (!sock.authState.creds.registered && !pendingSessions[numero_wa]) {
                try {
                    await delay(3000);
                    const code = await sock.requestPairingCode(numero_wa);
                    const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    console.log(`[WA] 🔑 Pairing code para ${numero_wa}: ${formattedCode}`);
                    pendingSessions[numero_wa] = { pairingCode: formattedCode };
                    if (res && !res.headersSent) res.json({ success: true, pairingCode: formattedCode });
                } catch (e) {
                    console.error(`[WA] ❌ Erro ao gerar pairing code: ${e.message}`);
                }
            }
        }

        // 3. Recepção de Mensagens
        if (events['messages.upsert']) {
            const upsert = events['messages.upsert'];
            if (upsert.type !== 'notify') return;

            for (const msg of upsert.messages) {
                if (!msg.message || msg.key.fromMe) continue;

                const remoteJid = msg.key.remoteJid;
                if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;

                const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || null;
                if (!textMessage) continue;

                const telefoneCliente = remoteJid.split('@')[0].split(':')[0];
                console.log(`\n[WA] 📨 Mensagem de ${telefoneCliente}: "${textMessage}"`);

                try {
                    // 1. Busca Configurações do Tenant (Motor de IA)
                    const { data: config } = await supabase.from('agentes_config')
                        .select('delay_resposta_segundos, modo_operacao')
                        .eq('numero_wa', numero_wa)
                        .maybeSingle();

                    if (config?.modo_operacao === 'manual') {
                        console.log(`[WA] ⏸️ Modo manual ativo para ${numero_wa}. Ignorando IA.`);
                        continue;
                    }

                    // 2. Delay Dinâmico
                    const waitTime = (config?.delay_resposta_segundos || 5) * 1000;
                    await delay(waitTime);

                    // 3. Gestão de Contato CRM
                    let { data: contato, error: errContato } = await supabase.from('contatos_crm')
                        .select('id')
                        .eq('numero_wa', numero_wa)
                        .eq('telefone_cliente', telefoneCliente)
                        .maybeSingle();

                    if (!contato && !errContato) {
                        // Tenta fallback por telefone puro se ID der erro de tipo
                        const { data: fb } = await supabase.from('contatos_crm').select('id').eq('telefone_cliente', telefoneCliente).limit(1).maybeSingle();
                        if (fb) contato = fb;
                    }

                    if (errContato) console.error(`[DB] Erro ao buscar contato: ${errContato.message}`);

                    if (!contato) {
                        const { data: novo, error: errNovo } = await supabase.from('contatos_crm').insert([{
                            numero_wa,
                            telefone_cliente: telefoneCliente,
                            nome: msg.pushName || telefoneCliente,
                            status: 'Lead',
                            ultima_interacao: new Date()
                        }]).select().single();

                        if (errNovo) {
                            console.error(`[DB] Erro ao criar contato: ${errNovo.message}`);
                            continue; // Não podemos prosseguir sem contato
                        }
                        contato = novo;
                    } else {
                        await supabase.from('contatos_crm').update({ ultima_interacao: new Date() }).eq('id', contato.id);
                    }

                    // 4. Fluxo de Conversa
                    let { data: conversa, error: errConv } = await supabase.from('conversas')
                        .select('id, ia_ativa')
                        .eq('numero_wa', numero_wa)
                        .eq('contato_id', contato.id)
                        .maybeSingle();

                    if (errConv) console.error(`[DB] Erro ao buscar conversa: ${errConv.message}`);

                    if (!conversa) {
                        const { data: nova, error: errNova } = await supabase.from('conversas').insert([{
                            numero_wa,
                            contato_id: contato.id,
                            ia_ativa: true
                        }]).select().single();

                        if (errNova) {
                            console.error(`[DB] Erro ao criar conversa: ${errNova.message}`);
                            continue;
                        }
                        conversa = nova;
                    }

                    if (!conversa || !conversa.id) {
                        console.error(`[WA] Falha crítica: Conversa não disponível para ${telefoneCliente}`);
                        continue;
                    }

                    const { error: errMsg } = await supabase.from('mensagens').insert([{
                        conversa_id: conversa.id,
                        remetente_tipo: 'user',
                        conteudo: textMessage
                    }]);
                    if (errMsg) console.error(`[DB] Erro ao salvar mensagem do usuário: ${errMsg.message}`);

                    if (conversa.ia_ativa) {
                        console.log(`[AI] 🧠 Gerando resposta para ${telefoneCliente}...`);

                        try {
                            const aiReply = await generateResponse(textMessage, numero_wa, remoteJid, conversa.id);

                            // Limpeza de tags
                            const handoffTriggered = aiReply.includes('[CHAMAR_HUMANO]');
                            const mensagemLimpa = aiReply.replace(/\[CHAMAR_HUMANO\]/g, '').trim();

                            console.log(`[AI] ✨ Resposta gerada: "${mensagemLimpa.substring(0, 30)}..."`);

                            // Envio para o WhatsApp
                            try {
                                await sock.sendMessage(remoteJid, { text: mensagemLimpa });
                                console.log(`[WA] ✅ Mensagem enviada para ${telefoneCliente}`);
                            } catch (sendError) {
                                console.error(`[WA] ❌ FALHA ao enviar mensagem: ${sendError.message}`);
                            }

                            // Registro no banco
                            await supabase.from('mensagens').insert([{
                                conversa_id: conversa.id,
                                remetente_tipo: 'humano',
                                conteudo: mensagemLimpa
                            }]);

                            if (handoffTriggered) {
                                console.log(`[WA] ✋ Handoff detectado. Pausando IA para ${telefoneCliente}`);
                                await supabase.from('conversas').update({ ia_ativa: false }).eq('id', conversa.id);
                            }
                        } catch (aiError) {
                            console.error(`[AI] ❌ Erro no processamento da IA: ${aiError.message}`);
                        }
                    } else {
                        console.log(`[AI] ⏸️ IA desativada para ${telefoneCliente}.`);
                    }
                } catch (err) {
                    console.error(`[WA] ❌ Erro no fluxo:`, err.message);
                }
            }
        }
    });

    return sock;
}

// ─── ROTAS ────────────────────────────────────────────────────────────────────

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const isAdmin = ['admin@robotibr.com.br', 'diegossilvestre@live.com', 'diegoasilvestre@live.com'].includes(email);

        // 1. Tenta buscar na nova tabela de usuários
        const { data: user, error: userError } = await supabase
            .from('usuarios')
            .select('*, agentes_config(nome_empresa)')
            .eq('email', email)
            .maybeSingle();

        if (user) {
            const match = await bcrypt.compare(password, user.senha);
            if (match) {
                // Atualiza último login (sem travar se der erro)
                supabase.from('usuarios').update({ ultimo_login: new Date() }).eq('id', user.id).then();

                return res.json({
                    user: {
                        email,
                        nome: user.nome,
                        numero_wa: user.loja_id,
                        role: user.role,
                        loja_nome: user.agentes_config?.nome_empresa
                    },
                    is_admin: isAdmin
                });
            }
        }

        // 2. Fallback para Supabase Auth (retrocompatibilidade)
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (!authError && authData.user) {
            const { data: loja } = await supabase.from('agentes_config').select('*').eq('email_dono', email).maybeSingle();
            return res.json({ user: { email, nome: loja?.nome_empresa || email, numero_wa: loja?.numero_wa, role: isAdmin ? 'admin' : 'owner' }, is_admin: isAdmin });
        }

        // 3. Fallback para senha direta (apenas se configurado)
        const { data: loja } = await supabase.from('agentes_config').select('*').eq('email_dono', email).maybeSingle();
        if (loja && loja.senha_cliente === password) {
            return res.json({ user: { email, nome: loja.nome_empresa, numero_wa: loja.numero_wa, role: isAdmin ? 'admin' : 'owner' }, is_admin: isAdmin });
        }

        res.status(401).json({ erro: 'Credenciais inválidas' });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── ROTAS DE EQUIPE (USER MANAGEMENT) ────────────────────────────────────────

app.get('/admin/equipe/:loja_id', async (req, res) => {
    const { loja_id } = req.params;
    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('loja_id', loja_id)
        .order('criado_em', { ascending: true });

    if (error) return res.status(500).json({ erro: error.message });

    // Mapeia 'role' para 'cargo' para o frontend
    const mapped = data.map(u => ({
        ...u,
        cargo: u.role.charAt(0).toUpperCase() + u.role.slice(1)
    }));
    res.json(mapped);
});

app.post('/admin/equipe/convidar', async (req, res) => {
    const { loja_id, email, senha, nome, cargo } = req.body;
    try {
        const role = cargo.toLowerCase();
        const hashed = await bcrypt.hash(senha, 10);
        const { data, error } = await supabase.from('usuarios').insert([{
            loja_id,
            email,
            senha: hashed,
            nome,
            role
        }]).select();

        if (error) throw error;
        res.json({ ok: true, user: data[0] });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/admin/equipe/update', async (req, res) => {
    const { id, nome, cargo } = req.body;
    try {
        const updateData = { nome };
        if (cargo) updateData.role = cargo.toLowerCase();

        const { error } = await supabase.from('usuarios').update(updateData).eq('id', id);
        if (error) throw error;
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.delete('/admin/equipe/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('usuarios').delete().eq('id', id);
    res.json({ ok: !error, erro: error?.message });
});

app.get('/admin/lojas', async (req, res) => {
    const { data, error } = await supabase.from('agentes_config').select('*');
    if (error) return res.status(500).json({ erro: error.message });
    res.json(data.map(c => ({ id: c.numero_wa, nome: c.nome_empresa, wa_id: c.numero_wa, ativa: c.ativo, prompt_base: c.prompt_base, config: { nicho: c.nicho, tom_voz: c.tom_voz, regras: c.regras, llm_model: c.llm_model } })));
});

app.post('/admin/lojas', async (req, res) => {
    const { nome, wa_id, prompt_base, email_admin, senha_admin } = req.body;
    try {
        // 1. Cria a loja
        const { error: lojaError } = await supabase.from('agentes_config').insert([{
            numero_wa: wa_id,
            nome_empresa: nome,
            prompt_base: prompt_base || '',
            ativo: true
        }]);
        if (lojaError) throw lojaError;

        // 2. Se enviou email/senha, cria o primeiro admin da equipe
        if (email_admin && senha_admin) {
            const hashed = await bcrypt.hash(senha_admin, 10);
            await supabase.from('usuarios').insert([{
                loja_id: wa_id,
                email: email_admin,
                senha: hashed,
                nome: 'Administrador ' + nome,
                role: 'admin'
            }]);
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

app.delete('/admin/lojas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Limpeza em cascata (Supabase pode ter isso via FK, mas garantimos aqui)
        await supabase.from('base_conhecimento').delete().eq('numero_wa', id);

        const { data: convs } = await supabase.from('conversas').select('id').eq('numero_wa', id);
        if (convs && convs.length > 0) {
            const ids = convs.map(c => c.id);
            await supabase.from('mensagens').delete().in('conversa_id', ids);
            await supabase.from('conversas').delete().in('id', ids);
        }
        await supabase.from('contatos_crm').delete().eq('numero_wa', id);

        const { error } = await supabase.from('agentes_config').delete().eq('numero_wa', id);
        if (error) throw error;

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

app.post('/admin/lojas/update', async (req, res) => {
    const { wa_id, ...updates } = req.body;
    if (updates.nome) { updates.nome_empresa = updates.nome; delete updates.nome; }
    const { error } = await supabase.from('agentes_config').update(updates).eq('numero_wa', wa_id);
    res.json({ ok: !error, erro: error?.message });
});

app.post('/wa/connect', async (req, res) => {
    const { numero } = req.body;
    try { await startWhatsApp(numero, res); } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/wa/status/:numero_wa', (req, res) => {
    const sock = activeSessions[req.params.numero_wa];
    res.json({ status: sock ? 'conectado' : 'desconectado', numero: req.params.numero_wa });
});

// ══ CATÁLOGO DE PRODUTOS ══════════════════════════════════════════════════
app.get('/cliente/catalogo/:numero_wa', async (req, res) => {
    try {
        const { data, error } = await supabase.from('catalogo_produtos')
            .select('*')
            .eq('numero_wa', req.params.numero_wa)
            .order('nome_produto', { ascending: true });
        if (error) throw error;
        res.json(data || []);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/cliente/catalogo', async (req, res) => {
    const { id, numero_wa, nome_produto, descricao, preco, sku, disponivel_para_ia } = req.body;
    try {
        const payload = { numero_wa, nome_produto, descricao, preco, sku, disponivel_para_ia };
        let error;
        if (id) {
            const resSup = await supabase.from('catalogo_produtos').update(payload).eq('id', id);
            error = resSup.error;
        } else {
            const resSup = await supabase.from('catalogo_produtos').insert([payload]);
            error = resSup.error;
        }
        if (error) throw error;
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.delete('/cliente/catalogo/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('catalogo_produtos').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/chat/contato/:numero_wa/:telefone', async (req, res) => {
    try {
        const { numero_wa, telefone } = req.params;
        const { data: contato, error } = await supabase
            .from('contatos_crm')
            .select('*')
            .eq('numero_wa', numero_wa)
            .eq('telefone_cliente', telefone)
            .maybeSingle();

        if (error) throw error;
        res.json(contato || {});
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

app.get('/chat/conversas/:numero_wa', async (req, res) => {
    try {
        const { data } = await supabase.from('conversas').select('id, ia_ativa, contato_id, contatos_crm(nome, telefone_cliente)').eq('numero_wa', req.params.numero_wa);
        res.json(data?.map(c => ({
            id: c.id,
            nome: c.contatos_crm?.nome || 'Cliente',
            numero_cliente: c.contatos_crm?.telefone_cliente || '',
            ia_ativa: c.ia_ativa
        })) || []);
    } catch (e) { res.json([]); }
});

app.get('/chat/mensagens/:numero_wa/:telefone', async (req, res) => {
    try {
        const { numero_wa, telefone } = req.params;
        const isUUID = /^[0-9a-fA-F-]{36}$/.test(telefone);

        let convId = null;

        if (isUUID) {
            convId = telefone;
        } else {
            // Busca o contato pelo telefone
            const { data: contato } = await supabase.from('contatos_crm').select('id').eq('numero_wa', numero_wa).eq('telefone_cliente', telefone).maybeSingle();
            if (contato) {
                const { data: conv } = await supabase.from('conversas').select('id').eq('numero_wa', numero_wa).eq('contato_id', contato.id).maybeSingle();
                if (conv) convId = conv.id;
            }
        }

        if (!convId) return res.json([]);

        const { data: msgs, error: msgsError } = await supabase.from('mensagens').select('*').eq('conversa_id', convId).order('criado_em', { ascending: true });
        if (msgsError) throw msgsError;
        res.json(msgs || []);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/admin/diagnostics/:numero_wa', async (req, res) => {
    try {
        console.log(`[DIAG] Executando diagnóstico para: ${req.params.numero_wa}`);
        const report = await runDiagnostics(req.params.numero_wa);
        res.json(report);
    } catch (e) {
        console.error(`[DIAG] Falha crítica na rota: ${e.message}`);
        res.status(500).json({ status: 'error', message: e.message });
    }
});

app.get('/admin/stats/:loja_id', async (req, res) => {
    try {
        console.log(`[STATS] Buscando métricas para: ${req.params.loja_id}`);
        const { loja_id } = req.params;
        // Busca conversas da loja
        const { data: convs } = await supabase.from('conversas').select('id').eq('numero_wa', loja_id);
        const convIds = (convs || []).map(c => c.id);

        if (convIds.length === 0) {
            return res.json({ total_msgs: 0, sent: 0, received: 0, tokens: 0, history: [] });
        }

        // Busca mensagens
        const { data: msgs } = await supabase
            .from('mensagens')
            .select('remetente_tipo, conteudo, criado_em')
            .in('conversa_id', convIds)
            .order('criado_em', { ascending: true });

        const received = msgs.filter(m => m.remetente_tipo === 'user').length;
        const sent = msgs.filter(m => m.remetente_tipo === 'humano' || m.remetente_tipo === 'bot').length;
        
        // Estimativa de tokens (char / 4)
        const tokens = msgs.reduce((acc, m) => acc + (m.conteudo?.length || 0), 0) / 4;

        // Histórico simplificado para o gráfico (últimos 7 dias)
        const history = []; // Logica de agrupamento por dia seria ideal aqui

        res.json({
            total_msgs: msgs.length,
            sent,
            received,
            tokens: Math.round(tokens),
            history
        });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

app.post('/cliente/scrape', async (req, res) => {
    const { url, numero_wa, loja_id, titulo } = req.body;
    const target_wa = numero_wa || loja_id;
    try {
        const result = await scrapeAndSave(url, target_wa, titulo);
        res.json({ ok: true, titulo: result.title, chunks: result.chunks });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/cliente/rag/:numero_wa', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('base_conhecimento')
            .select('id, titulo_fonte, url_fonte, tipo_fonte, criado_em')
            .eq('numero_wa', req.params.numero_wa)
            .order('criado_em', { ascending: false });

        if (error) throw error;

        // Mapeia para o formato esperado pelo frontend (titulo, tipo)
        const docs = data.map(d => ({
            id: d.id,
            titulo: d.titulo_fonte,
            url_fonte: d.url_fonte,
            tipo: d.tipo_fonte,
            criado_em: d.criado_em
        }));

        res.json(docs);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.delete('/cliente/rag/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('base_conhecimento')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/cliente/importar-texto', async (req, res) => {
    const { titulo, conteudo, loja_id } = req.body;
    try {
        const embedding = await generateEmbedding(conteudo);
        const { error } = await supabase.from('base_conhecimento').insert([{
            numero_wa: loja_id,
            tipo_fonte: 'manual',
            titulo_fonte: titulo,
            conteudo,
            embedding
        }]);
        if (error) throw error;
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/chat/toggle-ia', async (req, res) => {
    const { loja_id, numero_cliente, ia_ativa } = req.body;
    try {
        const isUUID = /^[0-9a-fA-F-]{36}$/.test(numero_cliente);
        let convId = isUUID ? numero_cliente : null;

        if (!convId) {
            const { data: contato } = await supabase.from('contatos_crm').select('id').eq('numero_wa', loja_id).eq('telefone_cliente', numero_cliente).maybeSingle();
            if (contato) {
                const { data: conv } = await supabase.from('conversas').select('id').eq('numero_wa', loja_id).eq('contato_id', contato.id).maybeSingle();
                if (conv) convId = conv.id;
            }
        }

        if (convId) {
            await supabase.from('conversas').update({ ia_ativa }).eq('id', convId);
            console.log(`[CHAT] 🤖 IA ${ia_ativa ? 'ATIVADA' : 'DESATIVADA'} para conversa ${convId}`);
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

async function resolveChatData(idOrPhone, numero_wa) {
    const isUUID = /^[0-9a-fA-F-]{36}$/.test(idOrPhone);
    let convId = null;
    let telefoneReal = null;

    if (isUUID) {
        const { data: conv } = await supabase.from("conversas")
            .select("id, contatos_crm(telefone_cliente)")
            .eq("id", idOrPhone)
            .maybeSingle();
        if (conv) {
            convId = conv.id;
            telefoneReal = conv.contatos_crm?.telefone_cliente;
        }
    } else {
        const { data: contato } = await supabase.from("contatos_crm").select("id, telefone_cliente").eq("numero_wa", numero_wa).eq("telefone_cliente", idOrPhone).maybeSingle();
        if (contato) {
            telefoneReal = contato.telefone_cliente;
            const { data: conv } = await supabase.from("conversas").select("id").eq("numero_wa", numero_wa).eq("contato_id", contato.id).maybeSingle();
            if (conv) convId = conv.id;
        }
    }
    if (!telefoneReal) return null;
    const clean = String(telefoneReal).replace(/\D/g, "");
    const jid = clean.length > 13 ? `${clean}@lid` : `${clean}@s.whatsapp.net`;
    return { convId, telefoneReal, jid, clean };
}

app.post("/chat/send-manual", async (req, res) => {
    const { numero_wa, telefone_cliente, mensagem } = req.body;
    try {
        const sock = activeSessions[numero_wa];
        if (!sock) return res.status(400).json({ erro: "WhatsApp não conectado." });

        const chat = await resolveChatData(telefone_cliente, numero_wa);
        if (!chat) return res.status(404).json({ erro: "Contato não encontrado." });

        console.log(`[CHAT] 🚀 Enviando para ${chat.telefoneReal} (JID: ${chat.jid})`);

        try {
            await sock.sendMessage(chat.jid, { text: mensagem });
        } catch (err) {
            const fallbackJid = chat.jid.endsWith("@lid") ? `${chat.clean}@s.whatsapp.net` : `${chat.clean}@lid`;
            await sock.sendMessage(fallbackJid, { text: mensagem });
        }

        if (chat.convId) {
            await supabase.from("conversas").update({ ia_ativa: false }).eq("id", chat.convId);
            await supabase.from("mensagens").insert([{
                conversa_id: chat.convId,
                remetente_tipo: "humano",
                conteudo: mensagem
            }]);
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.post('/wa/disconnect', async (req, res) => {
    const { numero } = req.body;
    try {
        const sock = activeSessions[numero];
        if (sock) {
            await sock.logout();
            delete activeSessions[numero];
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

async function autoLoadSessions() {
    try {
        const files = fs.readdirSync("./");
        const sessionFolders = files.filter(f => f.startsWith("auth_info_") && fs.lstatSync(f).isDirectory());
        for (const folder of sessionFolders) {
            const numero = folder.replace("auth_info_", "");
            if (numero && numero.length >= 10) {
                console.log("[BOOT] Restaurando sessao: " + numero);
                startWhatsApp(numero).catch(e => console.error("[BOOT] Erro na restauracao: " + e.message));
            }
        }
    } catch (e) { console.error("[BOOT] Erro ao listar sessoes: " + e.message); }
}

app.listen(PORT, '0.0.0.0', async () => {
    console.log("Servidor rodando na porta " + PORT);
    await warmupModel();
    await autoLoadSessions();
});
// Version: MASTER - PONTO APICE - Thu Apr 30 12:56:41 AM GMT 2026

