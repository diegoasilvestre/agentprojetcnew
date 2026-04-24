import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import 'dotenv/config'

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('âŒ SUPABASE_URL ou SUPABASE_SERVICE_KEY nÃ£o configurados')
  process.exit(1)
}

export const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const _lojaCache = new Map()
const CACHE_TTL = 5 * 60 * 1000

export async function getLojaPorWaId(waId) {
  const cached = _lojaCache.get(waId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.loja
  const { data, error } = await db.from('lojas').select('*').eq('wa_id', waId).eq('ativa', true).maybeSingle()
  if (error) return null
  if (data) _lojaCache.set(waId, { loja: data, ts: Date.now() })
  return data
}

export function invalidarCacheLoja(waId) { _lojaCache.delete(waId) }

export async function listarLojas() {
  const { data, error } = await db.from('lojas').select('*').order('nome')
  return data || []
}

export async function getLojaPorId(id) {
  const { data, error } = await db.from('lojas').select('*').eq('id', id).single()
  return data || null
}

export async function criarLoja(payload) {
  const { data, error } = await db.from('lojas').insert(payload).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function atualizarLoja(id, patch) {
  const { data, error } = await db.from('lojas').update(patch).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  for (const [waId, entry] of _lojaCache.entries()) { if (entry.loja.id === id) _lojaCache.delete(waId) }
  return data
}

export async function getProdutosDaLoja(lojaId) {
  const { data, error } = await db.from('produtos').select('*').eq('loja_id', lojaId).eq('ativo', true).order('nome')
  return data || []
}

export async function criarProduto(payload) {
  const { data, error } = await db.from('produtos').insert({ ...payload, ativo: true }).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function atualizarProduto(id, patch) {
  const { data, error } = await db.from('produtos').update(patch).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function getHistorico(lojaId, numeroCliente, limite = 20) {
  const { data, error } = await db.from('conversas').select('role, content').eq('loja_id', lojaId).eq('numero_cliente', numeroCliente).order('created_at', { ascending: false }).limit(limite)
  if (error) return []
  return (data || []).reverse()
}

export async function salvarMensagem({ lojaId, numeroCliente, nomeCliente, role, content, tipo = 'texto' }) {
  await db.from('conversas').insert({ loja_id: lojaId, numero_cliente: numeroCliente, nome_cliente: nomeCliente, role, content, tipo })
}

export async function listarContatos(lojaId) {
  const { data } = await db.from('conversas').select('numero_cliente, nome_cliente, content, created_at, role').eq('loja_id', lojaId).order('created_at', { ascending: false }).limit(500)
  const map = new Map()
  for (const row of data || []) {
    if (!map.has(row.numero_cliente)) {
      map.set(row.numero_cliente, { numero: row.numero_cliente, nome: row.nome_cliente || row.numero_cliente, ultima: row.content, role: row.role })
    }
  }
  return Array.from(map.values())
}

export async function getConversa(lojaId, numero, limite = 100) {
  const { data } = await db.from('conversas').select('role, content, tipo, created_at').eq('loja_id', lojaId).eq('numero_cliente', numero).order('created_at', { ascending: true }).limit(limite)
  return data || []
}

export async function deletarConversa(lojaId, numero) {
  await db.from('conversas').delete().eq('loja_id', lojaId).eq('numero_cliente', numero)
}

export async function contagemMensagensHoje(lojaId) {
  const desde = new Date(Date.now() - 86400000).toISOString()
  const { count } = await db.from('conversas').select('*', { count: 'exact', head: true }).eq('loja_id', lojaId).eq('role', 'user').gte('created_at', desde)
  return count || 0
}

export async function criarPedido(payload) {
  const { data, error } = await db.from('pedidos').insert(payload).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function listarPedidos(lojaId, status = null) {
  let q = db.from('pedidos').select('*').eq('loja_id', lojaId).order('created_at', { ascending: false }).limit(100)
  if (status) q = q.eq('status', status)
  const { data } = await q
  return data || []
}

export async function atualizarPedido(id, patch) {
  const { data, error } = await db.from('pedidos').update(patch).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function getStats(lojaId) {
  const [conv, pend, docs] = await Promise.all([
    contagemMensagensHoje(lojaId),
    db.from('pedidos').select('id', { count: 'exact', head: true }).eq('loja_id', lojaId).eq('status', 'Pendente'),
    db.from('rag_documentos').select('id', { count: 'exact', head: true }).eq('loja_id', lojaId).eq('ativo', true),
  ])
  return { conversasHoje: conv, pedidosPendentes: pend.count || 0, totalDocs: docs.count || 0 }
}

// â”€â”€ RAG DOCUMENTOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function dividirTextoEmChunks(texto, tamanhoAprox = 1000) {
  const textoLimpo = texto.replace(/\s+/g, ' ').trim()
  if (textoLimpo.length <= tamanhoAprox) return [textoLimpo]
  const chunks = []
  for (let i = 0; i < textoLimpo.length; i += tamanhoAprox) {
    chunks.push(textoLimpo.substring(i, i + tamanhoAprox))
  }
  return chunks
}

async function gerarEmbedding(texto) {
  try {
    const key = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY
    if (!key) { console.error('[RAG] Nenhuma chave de API (GEMINI/GROQ) encontrada para embeddings.'); return null }
    
    // Garantindo que usamos a chave correta
    const geminiEmbed = new GoogleGenAI({ apiKey: key })
    const model = geminiEmbed.getGenerativeModel({ model: 'text-embedding-004' }) // text-embedding-004 Ã© o sucessor estÃ¡vel que gera 768 ou 3072
    
    // Vamos usar gemini-embedding-2 que Ã© o que combinamos (3072)
    const res = await gemini.models.embedContent({ 
      model: 'gemini-embedding-2', 
      contents: texto 
    })
    const vec = res.embeddings?.[0]?.values || null
    if (vec) console.log(`[RAG] Embedding gerado com sucesso. DimensÃµes: ${vec.length}`)
    else console.warn('[RAG] Resposta de embedding vazia.')
    return vec
  } catch (err) {
    console.error('[RAG] Erro ao gerar embedding:', err.message)
    return null
  }
}

export async function salvarDocumentoRAG({ loja_id, tipo, titulo, conteudo, fonte }) {
  console.log(`[RAG][IngestÃ£o] Iniciando: "${titulo}" para loja ${loja_id}`)
  const { data, error } = await db.from('rag_documentos').insert({
    loja_id, tipo, titulo, conteudo, fonte: fonte || 'manual', ativo: true
  }).select().single()
  if (error) { console.error('[RAG] Erro ao salvar documento:', error.message); throw new Error(error.message) }

  const chunks = dividirTextoEmChunks(conteudo)
  console.log(`[RAG] Texto dividido em ${chunks.length} chunks. Processando...`)
  
  let sucessos = 0
  for (const chunk of chunks) {
    const embedding = await gerarEmbedding(chunk)
    if (embedding) {
      const { error: errIns } = await db.from('rag_chunks').insert({ documento_id: data.id, loja_id, conteudo: chunk, embedding })
      if (!errIns) sucessos++
      else console.error('[RAG] Erro ao inserir chunk no banco:', errIns.message)
    }
  }
  console.log(`[RAG] ConcluÃ­do: ${sucessos}/${chunks.length} chunks salvos.`)
  return data
}

export async function buscarRAGRelevante(lojaId, pergunta) {
  if (!pergunta || pergunta.length < 3) return []
  console.log(`[RAG][Busca] Procurando por: "${pergunta.substring(0, 50)}..."`)
  
  const embedding = await gerarEmbedding(pergunta)
  if (!embedding) return []
  
  const { data, error } = await db.rpc('match_rag_chunks', { 
    query_embedding: embedding, 
    match_threshold: 0.1, 
    match_count: 5, 
    p_loja_id: lojaId 
  })
  
  if (error) { console.error('[RAG] Erro na busca (match_rag_chunks):', error.message); return [] }
  console.log(`[RAG] Resultados encontrados: ${data?.length || 0}`)
  return data || []
}

export async function listarDocumentosRAG(loja_id) {
  const { data } = await db.from('rag_documentos').select('*').eq('loja_id', loja_id).eq('ativo', true).order('criado_em', { ascending: false })
  return data || []
}

export async function deletarDocumentoRAG(id) {
  await db.from('rag_documentos').delete().eq('id', id)
}
