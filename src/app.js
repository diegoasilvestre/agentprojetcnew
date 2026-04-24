import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import multer from 'multer'
import fs from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pdf = require('pdf-parse')
const xlsx = require('xlsx')
import axios from 'axios'

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
  getStats,
  salvarDocumentoRAG,
  listarDocumentosRAG,
  deletarDocumentoRAG
} from './database.js'

import { instanceManager, responderAgente } from './whatsapp.js'

const app = express()
const PORT = process.env.PORT || 3000
const upload = multer({ dest: 'uploads/' })

app.use(cors({ origin: '*' }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Auth Middleware ──────────────────────────────────────────────────────────
const jwks = jwksClient({ jwksUri: `${process.env.SUPABASE_URL}/auth/v1/keys` })
function getKey(header, cb) { jwks.getSigningKey(header.kid, (err, key) => cb(null, key?.getPublicKey())) }
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  jwt.verify(token, getKey, {}, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid Token' })
    req.user = decoded; next()
  })
}

// ── Rotas ────────────────────────────────────────────────────────────────────
app.get('/', (_, res) => res.json({ status: 'online', api: 'Agents Intelligence v3' }))

app.get('/status', (_, res) => {
  res.json({
    servidor: 'online',
    uptime: Math.floor(process.uptime()) + 's',
    instancias: instanceManager.allStates(),
    timestamp: new Date().toISOString(),
  })
})

// WhatsApp
app.post('/wa/connect', async (req, res) => {
  const { loja_id, numero } = req.body
  if (!loja_id || !numero) return res.status(400).json({ erro: 'loja_id e numero obrigatórios' })
  res.json(await instanceManager.conectar(loja_id, numero))
})
app.get('/wa/status/:lojaId', (req, res) => res.json(instanceManager.stateOf(req.params.lojaId)))
app.post('/wa/disconnect/:lojaId', async (req, res) => {
  await instanceManager.desconectar(req.params.lojaId, req.body?.deletar_sessao !== false)
  res.json({ ok: true })
})
app.get('/wa/instances', (_, res) => res.json(instanceManager.allStates()))

// Simulador
app.post('/simulate', async (req, res) => {
  const { phone, text, loja_id } = req.body
  if (!phone || !text || !loja_id) return res.status(400).json({ erro: 'Dados incompletos' })
  res.json({ reply: await responderAgente(loja_id, phone, text) })
})

// Admin
app.get('/admin/lojas', async (_, res) => res.json(await listarLojas()))
app.get('/admin/lojas/:id', async (req, res) => res.json(await getLojaPorId(req.params.id)))
app.post('/admin/lojas', async (req, res) => res.status(201).json(await criarLoja(req.body)))
app.patch('/admin/lojas/:id', async (req, res) => res.json(await atualizarLoja(req.params.id, req.body)))
app.delete('/admin/lojas/:id', async (req, res) => {
  const { error } = await db.from('lojas').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ erro: error.message })
  res.json({ ok: true })
})
app.get('/admin/lojas/:id/stats', async (req, res) => res.json(await getStats(req.params.id)))

// Produtos
app.get('/admin/produtos', async (req, res) => res.json(await getProdutosDaLoja(req.query.loja_id)))
app.post('/admin/produtos', async (req, res) => res.status(201).json(await criarProduto(req.body)))
app.patch('/admin/produtos/:id', async (req, res) => res.json(await atualizarProduto(req.params.id, req.body)))

// RAG
app.post('/cliente/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file; let conteudo = ''
    if (file.mimetype === 'application/pdf') conteudo = (await pdf(fs.readFileSync(file.path))).text
    else if (file.mimetype.includes('sheet')) conteudo = JSON.stringify(xlsx.readFile(file.path).Sheets)
    fs.unlinkSync(file.path)
    await salvarDocumentoRAG({ loja_id: req.body.loja_id, tipo: 'arquivo', titulo: file.originalname, conteudo })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ erro: err.message }) }
})

app.post('/cliente/importar-link', async (req, res) => {
  try {
    const { url, loja_id } = req.body
    const response = await axios.get('https://r.jina.ai/' + url, { headers: { 'Accept': 'text/plain' }, timeout: 30000 })
    await salvarDocumentoRAG({ loja_id, tipo: 'link', titulo: url, conteudo: response.data, fonte: url })
    res.json({ ok: true, chars: response.data.length })
  } catch (err) { res.status(500).json({ erro: err.message }) }
})

app.post('/cliente/importar-texto', async (req, res) => {
  try {
    await salvarDocumentoRAG({ ...req.body, tipo: 'texto' })
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ erro: err.message }) }
})

app.get('/cliente/rag/:loja_id', async (req, res) => res.json(await listarDocumentosRAG(req.params.loja_id)))
app.delete('/cliente/rag/:id', async (req, res) => { await deletarDocumentoRAG(req.params.id); res.json({ ok: true }) })

// Conversas
app.get('/admin/conversas/:lojaId/contatos', async (req, res) => res.json(await listarContatos(req.params.lojaId)))
app.get('/admin/conversas/:lojaId/recentes', async (req, res) => {
  const { data } = await db.from('conversas_agente').select('role, content, numero_cliente, nome_cliente, created_at').eq('loja_id', req.params.lojaId).order('created_at', { ascending: false }).limit(20)
  res.json((data || []).reverse())
})

app.get('/admin/conversas/:lojaId/:numero', async (req, res) => res.json(await getConversa(req.params.lojaId, req.params.numero)))
app.delete('/admin/conversas/:lojaId/:numero', async (req, res) => {
  await deletarConversa(req.params.lojaId, req.params.numero); res.json({ ok: true })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server on port ${PORT}`)
  instanceManager.reconectarSessoes()
})