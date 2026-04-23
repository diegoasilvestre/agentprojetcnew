/**
 * app.js — Servidor Express
 * Ponto de entrada da aplicação. Todas as rotas em um único arquivo.
 */
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import {
  db,
  listarLojas, 
  getLojaPorId, 
  criarLoja, 
  atualizarLoja,
  getProdutosDaLoja, 
  criarProduto, 
  atualizarProduto,
  listarPedidos, 
  atualizarPedido,
  listarContatos, 
  getConversa, 
  deletarConversa, 
  contagemMensagensHoje,
  getStats
} 
from './database.js'; // Removi o responderAgente daqui, ele não pertence ao banco.

import { instanceManager, responderAgente } from './whatsapp.js'; // Centralizei tudo do Zap aqui.

const app  = express()
const PORT = process.env.PORT || 3000

// ── Groq para /simulate ───────────────────────────────────────────────────────
import Groq from 'groq-sdk'
import { getProdutosDaLoja as _getPrds, getHistorico } from './database.js'
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Auth: valida JWT Supabase via JWKS ───────────────────────────────────────
const jwks = jwksClient({
  jwksUri: `${process.env.SUPABASE_URL}/auth/v1/keys`,
})
function getKey(header, cb) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return cb(err)
    cb(null, key.getPublicKey())
  })
}
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Token não enviado' })
  jwt.verify(token, getKey, {}, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Token inválido: ' + err.message })
    req.user = decoded
    next()
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// ROTAS PÚBLICAS
// ══════════════════════════════════════════════════════════════════════════════

app.get('/', (_, res) => res.json({ nome: 'Agents Intelligence API', versao: '3.0.0' }))

// Status geral do servidor e todas as instâncias
app.get('/status', (_, res) => {
  res.json({
    servidor: 'online',
    uptime: Math.floor(process.uptime()) + 's',
    instancias: instanceManager.allStates(),
    timestamp: new Date().toISOString(),
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// ROTAS PROTEGIDAS
// ══════════════════════════════════════════════════════════════════════════════

// ── WhatsApp: multi-instância ─────────────────────────────────────────────────

/**
 * POST /wa/connect
 * Body: { loja_id, numero }
 * Conecta uma loja via pairing code. Retorna o código de 8 letras.
 */
app.post('/wa/connect', auth, async (req, res) => {
  const { loja_id, numero } = req.body
  if (!loja_id || !numero) {
    return res.status(400).json({ erro: 'loja_id e numero são obrigatórios' })
  }
  try {
    const state = await instanceManager.conectar(loja_id, numero)
    res.json(state)
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

/**
 * GET /wa/status/:lojaId
 * Estado atual de uma instância específica.
 */
app.get('/wa/status/:lojaId', auth, (req, res) => {
  res.json(instanceManager.stateOf(req.params.lojaId))
})

/**
 * POST /wa/disconnect/:lojaId
 * Desconecta e deleta a sessão da loja.
 * Body: { deletar_sessao: true } (opcional, default true)
 */
app.post('/wa/disconnect/:lojaId', auth, async (req, res) => {
  const { lojaId } = req.params
  const deletar = req.body?.deletar_sessao !== false
  try {
    await instanceManager.desconectar(lojaId, deletar)
    res.json({ ok: true, mensagem: `Loja ${lojaId} desconectada. Sessão ${deletar ? 'deletada' : 'mantida'}.` })
  } catch (err) {
    res.status(500).json({ erro: err.message })
  }
})

/**
 * GET /wa/instances
 * Lista todas as instâncias ativas e seus estados.
 */
app.get('/wa/instances', auth, (_, res) => {
  res.json(instanceManager.allStates())
})

// ── Simulate — testa o agente sem WhatsApp ────────────────────────────────────
app.post('/simulate', auth, async (req, res) => {
  const { phone, text, loja_id } = req.body
  if (!phone || !text || !loja_id) {
    return res.status(400).json({ erro: 'phone, text e loja_id são obrigatórios' })
  }
  try {
    const loja = await getLojaPorId(loja_id)
    if (!loja) return res.status(404).json({ erro: 'Loja não encontrada' })

    const produtos = await _getPrds(loja_id)
    const historico = await getHistorico(loja_id, phone, 10)

    const catalogo = produtos.length
      ? produtos.map(p => `• ${p.nome}${p.sabor ? ' – ' + p.sabor : ''} | R$ ${Number(p.preco_venda || 0).toFixed(2).replace('.', ',')}${p.quantidade != null ? ` | ${p.quantidade} un.` : ''}`).join('\n')
      : 'Nenhum produto cadastrado.'

    const system = `${loja.prompt_base || `Você é atendente da "${loja.nome}".`}

## Catálogo
${catalogo}

${loja.instrucoes_extras || ''}
- Responda em português. Máximo 3 parágrafos.
- Responda SOMENTE sobre produtos listados. Nunca invente.`.trim()

    const messages = [
      { role: 'system', content: system },
      ...historico.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: text },
    ]

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.7,
      max_tokens: 512,
    })

    const reply = completion.choices[0]?.message?.content
      ?.replace(/PEDIDO_JSON:[\s\S]*?(\n|$)/, '').trim()
      || 'Sem resposta'

    res.json({ reply })
  } catch (err) {
    console.error('[Simulate]', err.message)
    res.status(500).json({ erro: err.message })
  }
})

// ── Lojas ─────────────────────────────────────────────────────────────────────
app.get('/admin/lojas', auth, async (_, res) => {
  res.json(await listarLojas())
})

app.post('/admin/lojas', auth, async (req, res) => {
  const { nome, wa_id, prompt_base, instrucoes_extras } = req.body
  if (!nome || !wa_id) return res.status(400).json({ erro: 'nome e wa_id são obrigatórios' })
  try {
    const loja = await criarLoja({ nome, wa_id, prompt_base: prompt_base || '', instrucoes_extras: instrucoes_extras || '', ativa: true })
    res.status(201).json(loja)
  } catch (err) { res.status(500).json({ erro: err.message }) }
})

app.patch('/admin/lojas/:id', auth, async (req, res) => {
  try {
    const loja = await atualizarLoja(req.params.id, req.body)
    res.json(loja)
  } catch (err) { res.status(500).json({ erro: err.message }) }
})

// Stats de uma loja
app.get('/admin/lojas/:id/stats', auth, async (req, res) => {
  res.json(await getStats(req.params.id))
})

// ── Produtos ──────────────────────────────────────────────────────────────────
app.get('/admin/produtos', auth, async (req, res) => {
  const { loja_id } = req.query
  if (!loja_id) return res.status(400).json({ erro: 'loja_id obrigatório' })
  res.json(await getProdutosDaLoja(loja_id))
})

app.post('/admin/produtos', auth, async (req, res) => {
  const { loja_id, nome } = req.body
  if (!loja_id || !nome) return res.status(400).json({ erro: 'loja_id e nome são obrigatórios' })
  try {
    const prod = await criarProduto(req.body)
    res.status(201).json(prod)
  } catch (err) { res.status(500).json({ erro: err.message }) }
})

app.patch('/admin/produtos/:id', auth, async (req, res) => {
  try {
    const prod = await atualizarProduto(req.params.id, req.body)
    res.json(prod)
  } catch (err) { res.status(500).json({ erro: err.message }) }
})

// ── Pedidos ───────────────────────────────────────────────────────────────────
app.get('/admin/pedidos', auth, async (req, res) => {
  const { loja_id, status } = req.query
  if (!loja_id) return res.status(400).json({ erro: 'loja_id obrigatório' })
  res.json(await listarPedidos(loja_id, status || null))
})

app.patch('/admin/pedidos/:id', auth, async (req, res) => {
  try {
    const ped = await atualizarPedido(req.params.id, req.body)
    res.json(ped)
  } catch (err) { res.status(500).json({ erro: err.message }) }
})

// ── Conversas ─────────────────────────────────────────────────────────────────
app.get('/admin/conversas/:lojaId/contatos', auth, async (req, res) => {
  res.json(await listarContatos(req.params.lojaId))
})

app.get('/admin/conversas/:lojaId/stats/hoje', auth, async (req, res) => {
  const total = await contagemMensagensHoje(req.params.lojaId)
  res.json({ total })
})

app.get('/admin/conversas/:lojaId/recentes', auth, async (req, res) => {
  const { data } = await db
    .from('conversas')
    .select('role, content, numero_cliente, nome_cliente, created_at')
    .eq('loja_id', req.params.lojaId)
    .order('created_at', { ascending: false })
    .limit(20)
  res.json((data || []).reverse())
})

app.get('/admin/conversas/:lojaId/:numero', auth, async (req, res) => {
  res.json(await getConversa(req.params.lojaId, req.params.numero))
})

app.delete('/admin/conversas/:lojaId/:numero', auth, async (req, res) => {
  await deletarConversa(req.params.lojaId, req.params.numero)
  res.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════
app.listen(PORT, async () => {
  console.log(`\n🚀 Agents Intelligence API v3 — http://localhost:${PORT}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  POST /wa/connect       → conecta loja (pairing code)')
  console.log('  GET  /wa/status/:id    → estado de uma loja')
  console.log('  POST /wa/disconnect/:id → desconecta loja')
  console.log('  GET  /wa/instances     → todas as instâncias')
  console.log('  POST /simulate         → testa o agente')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  console.log("URL do Supabase carregada:", process.env.SUPABASE_URL ? "Sim ✅" : "Não ❌");

  // Reconecta lojas com sessão salva no boot
  await instanceManager.reconectarSessoes()
})
