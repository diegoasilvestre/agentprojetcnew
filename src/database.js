/**
 * database.js — Supabase client + todas as operações do banco
 *
 * Tabelas esperadas:
 *   lojas          → id, nome, wa_id, ativa, prompt_base, instrucoes_extras
 *   produtos_agente → id, loja_id, nome, sabor, preco_venda, quantidade, descricao, ativo
 *   conversas      → id, loja_id, numero_cliente, nome_cliente, role, content, tipo, created_at
 *   pedidos_agente → id, loja_id, numero_cliente, nome_cliente, itens, total, pagamento, status
 */

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados')
  process.exit(1)
}

export const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service_role bypassa RLS
)

// ── Cache de lojas (evita queries repetidas) ──────────────────────────────────
const _lojaCache = new Map()  // waId → { loja, ts }
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

// ── Lojas ─────────────────────────────────────────────────────────────────────

export async function getLojaPorWaId(waId) {
  const cached = _lojaCache.get(waId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.loja

  const { data, error } = await db
    .from('lojas')
    .select('*')
    .eq('wa_id', waId)
    .eq('ativa', true)
    .maybeSingle()

  if (error) { console.error('[DB] getLojaPorWaId:', error.message); return null }
  if (data) _lojaCache.set(waId, { loja: data, ts: Date.now() })
  return data
}

export function invalidarCacheLoja(waId) {
  _lojaCache.delete(waId)
}

export async function listarLojas() {
  const { data, error } = await db.from('lojas').select('*').order('nome')
  if (error) { console.error('[DB] listarLojas:', error.message); return [] }
  return data || []
}

export async function getLojaPorId(id) {
  const { data, error } = await db.from('lojas').select('*').eq('id', id).single()
  if (error) { console.error('[DB] getLojaPorId:', error.message); return null }
  return data
}

export async function criarLoja(payload) {
  const { data, error } = await db.from('lojas').insert(payload).select().single()
  if (error) throw new Error(`criarLoja: ${error.message}`)
  return data
}

export async function atualizarLoja(id, patch) {
  const { data, error } = await db.from('lojas').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`atualizarLoja: ${error.message}`)
  // Invalida cache para todos os wa_ids desta loja
  for (const [waId, entry] of _lojaCache.entries()) {
    if (entry.loja.id === id) _lojaCache.delete(waId)
  }
  return data
}

// ── Produtos (RAG dinâmico) ───────────────────────────────────────────────────

/**
 * Busca produtos ativos de uma loja — usado para montar o contexto do agente.
 * Esta é a query central do RAG: a cada mensagem, o agente recebe o catálogo
 * atualizado diretamente do banco.
 */
export async function getProdutosDaLoja(lojaId) {
  const { data, error } = await db
    .from('produtos_agente')
    .select('*')
    .eq('loja_id', lojaId)
    .eq('ativo', true)
    .order('nome')

  if (error) { console.error('[DB] getProdutosDaLoja:', error.message); return [] }
  return data || []
}

export async function criarProduto(payload) {
  const { data, error } = await db
    .from('produtos_agente').insert({ ...payload, ativo: true }).select().single()
  if (error) throw new Error(`criarProduto: ${error.message}`)
  return data
}

export async function atualizarProduto(id, patch) {
  const { data, error } = await db
    .from('produtos_agente').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`atualizarProduto: ${error.message}`)
  return data
}

// ── Histórico de conversas ────────────────────────────────────────────────────

export async function getHistorico(lojaId, numeroCliente, limite = 20) {
  const { data, error } = await db
    .from('conversas')
    .select('role, content')
    .eq('loja_id', lojaId)
    .eq('numero_cliente', numeroCliente)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) { console.error('[DB] getHistorico:', error.message); return [] }
  return (data || []).reverse() // ordem cronológica
}

export async function salvarMensagem({ lojaId, numeroCliente, nomeCliente, role, content, tipo = 'texto' }) {
  const { error } = await db.from('conversas').insert({
    loja_id: lojaId,
    numero_cliente: numeroCliente,
    nome_cliente: nomeCliente,
    role,
    content,
    tipo,
  })
  if (error) console.error('[DB] salvarMensagem:', error.message)
}

export async function listarContatos(lojaId) {
  const { data } = await db
    .from('conversas')
    .select('numero_cliente, nome_cliente, content, created_at, role')
    .eq('loja_id', lojaId)
    .order('created_at', { ascending: false })
    .limit(500)

  const map = new Map()
  for (const row of data || []) {
    if (!map.has(row.numero_cliente)) {
      map.set(row.numero_cliente, {
        numero: row.numero_cliente,
        nome: row.nome_cliente || row.numero_cliente,
        ultima: row.content,
        role: row.role,
      })
    }
  }
  return Array.from(map.values())
}

export async function getConversa(lojaId, numero, limite = 100) {
  const { data, error } = await db
    .from('conversas')
    .select('role, content, tipo, created_at')
    .eq('loja_id', lojaId)
    .eq('numero_cliente', numero)
    .order('created_at', { ascending: true })
    .limit(limite)

  if (error) return []
  return data || []
}

export async function deletarConversa(lojaId, numero) {
  await db.from('conversas')
    .delete()
    .eq('loja_id', lojaId)
    .eq('numero_cliente', numero)
}

export async function contagemMensagensHoje(lojaId) {
  const desde = new Date(Date.now() - 86400000).toISOString()
  const { count } = await db
    .from('conversas')
    .select('*', { count: 'exact', head: true })
    .eq('loja_id', lojaId)
    .eq('role', 'user')
    .gte('created_at', desde)
  return count || 0
}

// ── Pedidos ───────────────────────────────────────────────────────────────────

export async function criarPedido(payload) {
  const { data, error } = await db.from('pedidos_agente').insert(payload).select().single()
  if (error) throw new Error(`criarPedido: ${error.message}`)
  return data
}

export async function listarPedidos(lojaId, status = null) {
  let q = db
    .from('pedidos_agente')
    .select('*')
    .eq('loja_id', lojaId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) { console.error('[DB] listarPedidos:', error.message); return [] }
  return data || []
}

export async function atualizarPedido(id, patch) {
  const { data, error } = await db
    .from('pedidos_agente').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`atualizarPedido: ${error.message}`)
  return data
}

// ── Stats para dashboard ──────────────────────────────────────────────────────

export async function getStats(lojaId) {
  const [conv, pend, prod] = await Promise.all([
    contagemMensagensHoje(lojaId),
    db.from('pedidos_agente')
      .select('id', { count: 'exact', head: true })
      .eq('loja_id', lojaId).eq('status', 'Pendente'),
    db.from('produtos_agente')
      .select('id', { count: 'exact', head: true })
      .eq('loja_id', lojaId).eq('ativo', true),
  ])
  return {
    conversasHoje: conv,
    pedidosPendentes: pend.count || 0,
    totalProdutos: prod.count || 0,
  }
}
export async function getDadosParaRAG(waId) {
  const { data: loja, error: erroLoja } = await db
    .from('lojas')
    .select('id, nome, prompt_base, instrucoes_extras')
    .eq('wa_id', waId)
    .single();

  if (erroLoja || !loja) return null;

  const { data: produtos } = await db
    .from('produtos_agente')
    .select('nome, descricao, preco, link')
    .eq('loja_id', loja.id);

  return { loja, produtos };
}

// ── RAG DOCUMENTOS ─────────────────────────────

export async function salvarDocumentoRAG({ loja_id, tipo, titulo, conteudo, fonte }) {
  const { data, error } = await db
    .from('rag_documentos')
    .insert({
      loja_id,
      tipo,
      titulo,
      conteudo,
      fonte,
      ativo: true
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function listarDocumentosRAG(loja_id) {
  const { data, error } = await db
    .from('rag_documentos')
    .select('*')
    .eq('loja_id', loja_id)
    .eq('ativo', true)
    .order('criado_em', { ascending: false })

  if (error) return []
  return data || []
}

export async function deletarDocumentoRAG(id) {
  await db
    .from('rag_documentos')
    .update({ ativo: false })
    .eq('id', id)
}