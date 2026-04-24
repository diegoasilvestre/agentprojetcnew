/**
 * whatsapp.js â€” Motor Multi-Tenant Baileys
 * Cada loja â†’ socket prÃ³prio + sessÃ£o em ./auth/session_{lojaId}
 */
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import path from 'path'
import fs from 'fs'
import sharp from 'sharp'
import {
  getLojaPorWaId, criarPedido, salvarMensagem, getHistorico
} from './database.js'

const logger = pino({ level: 'silent' })
const BOOT_TIME = Math.floor(Date.now() / 1000)
const delay = (ms) => new Promise(r => setTimeout(r, ms))

// â”€â”€ Utils â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function normalizarNumero(s = '') {
  return s.split('@')[0].split(':')[0].replace(/\D/g, '')
}
function authDir(lojaId) {
  const dir = path.join(process.cwd(), 'auth', `session_${lojaId}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
function dividirMensagem(texto, maxLen = 1000) {
  if (texto.length <= maxLen) return [texto]
  const blocos = []
  let atual = ''
  for (const p of texto.split('\n\n')) {
    if ((atual + p).length > maxLen && atual) { blocos.push(atual.trim()); atual = p }
    else atual += (atual ? '\n\n' : '') + p
  }
  if (atual.trim()) blocos.push(atual.trim())
  return blocos
}

async function chamarIA(loja, numeroCliente, mensagem, tipo, imgB64) {
  const PYTHON_URL = process.env.PYTHON_AI_URL || 'http://localhost:8000'
  const resp = await fetch(`${PYTHON_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loja_id: loja.id,
      numero_cliente: numeroCliente,
      mensagem,
      tipo,
      img_b64: imgB64 || null,
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!resp.ok) throw new Error(`AI Engine: ${resp.status}`)
  return await resp.json() // { texto, pedido }
}

// â”€â”€ InstÃ¢ncia por loja â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class WaInstance {
  constructor(lojaId) {
    this.lojaId = lojaId
    this.sock = null
    this.status = 'aguardando'
    this.pairingCode = null
    this.numero = null
    this.erro = null
    this.tentativas = 0
    this._pairingSolicitado = false
    this._filas = new Map()
    this._ids = new Set()
    this._rate = []
  }

  state() {
    return {
      lojaId: this.lojaId, status: this.status,
      pairingCode: this.pairingCode, numero: this.numero, erro: this.erro
    }
  }

  _enfileirar(jid, fn) {
    const prev = this._filas.get(jid) ?? Promise.resolve()
    const next = prev.then(fn).catch(e => console.error(`[FILA][${this.lojaId}]`, e.message))
    this._filas.set(jid, next)
    next.finally(() => { if (this._filas.get(jid) === next) this._filas.delete(jid) })
  }

  _dedup(id) {
    if (!id || this._ids.has(id)) return true
    this._ids.add(id)
    if (this._ids.size > 500) this._ids.delete(this._ids.values().next().value)
    return false
  }

  _rate_ok() {
    const now = Date.now()
    while (this._rate.length && now - this._rate[0] > 60000) this._rate.shift()
    if (this._rate.length >= 20) return false
    this._rate.push(now); return true
  }

  async conectar(numero = null) {
    // 1. Se já existe um socket, encerra ele completamente antes de começar
    if (this.sock) {
      console.log(`[WA][${this.lojaId}] Fechando conexão anterior para novo pareamento...`)
      try {
        this.sock.ev.removeAllListeners()
        this.sock.terminate()
      } catch (e) {}
      this.sock = null
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir(this.lojaId))
    let version = [2, 3000, 1015901307]
    try { const r = await fetchLatestBaileysVersion(); if (r?.version) version = r.version } catch { }

    this._pairingSolicitado = false
    this.pairingCode = null
    this.erro = null
    this.status = 'conectando'

    this.sock = makeWASocket({
      version, auth: state, logger,
      printQRInTerminal: false,
      browser: ['Mac OS', 'Safari', '17.0'],
      markOnlineOnConnect: true, syncFullHistory: false,
      connectTimeoutMs: 60000, defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 25000,
      getMessage: async () => ({ conversation: '' }),
    })

    this.sock.ev.on('connection.update', async (upd) => {
      const { connection, lastDisconnect } = upd

      // Pairing code â€” solicitar uma vez quando socket abrir
      if (numero && !this._pairingSolicitado && !this.sock.authState?.creds?.registered) {
        this._pairingSolicitado = true
        try {
          await delay(2000)
          const code = await this.sock.requestPairingCode(numero.replace(/\D/g, ''))
          this.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code
          this.status = 'pairing_code'
          console.log(`[WA][${this.lojaId}] ðŸ”‘ Pairing code: ${this.pairingCode}`)
        } catch (err) {
          console.error(`[WA][${this.lojaId}] Erro pairing:`, err.message)
          this.erro = err.message
          this._pairingSolicitado = false
        }
      }

      if (connection === 'open') {
        this.tentativas = 0
        this.status = 'conectado'
        this.numero = normalizarNumero(this.sock.user?.id || '')
        this.pairingCode = null
        this.erro = null
        console.log(`[WA][${this.lojaId}] âœ… Conectado! NÃºmero: ${this.numero}`)
      }

      if (connection === 'close') {
        const cod = lastDisconnect?.error?.output?.statusCode
        const reconectar = (lastDisconnect?.error instanceof Boom)
          ? cod !== DisconnectReason.loggedOut : true
        this.status = 'desconectado'; this.numero = null
        if (reconectar) {
          this.tentativas++
          const t = Math.min(5000 * this.tentativas, 30000) + Math.random() * 2000
          console.log(`[WA][${this.lojaId}] Reconectando em ${(t / 1000).toFixed(1)}s...`)
          setTimeout(() => this.conectar(null), t)
        } else {
          this.status = 'erro'
          console.log(`[WA][${this.lojaId}] Logout. Reconecte pelo painel.`)
        }
      }
    })

    this.sock.ev.on('creds.update', saveCreds)

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      for (const msg of messages) {
        if (msg.key.fromMe) continue
        if (msg.key.remoteJid?.includes('@g.us')) continue
        if (!msg.message) continue
        const ts = Number(msg.messageTimestamp || 0)
        if (ts > 0 && ts < BOOT_TIME) continue
        if (this._dedup(msg.key.id)) continue
        if (!this._rate_ok()) continue
        const jid = msg.key.remoteJid
        console.log(`[WA][${this.lojaId}] ðŸ“© ${jid}`)
        this._enfileirar(jid, () => this._processar(msg))
      }
    })

    return this.sock
  }

  async _processar(msg) {
    const jid = msg.key.remoteJid
    const numeroCliente = normalizarNumero(jid)
    const nomeCliente = msg.pushName || numeroCliente
    const mc = msg.message

    let tipo = 'texto', texto = '', imgB64 = null

    if (mc?.conversation) texto = mc.conversation
    else if (mc?.extendedTextMessage?.text) texto = mc.extendedTextMessage.text
    else if (mc?.imageMessage) {
      tipo = 'imagem'
      texto = mc.imageMessage.caption || 'O cliente enviou uma imagem.'
      try {
        const buf = await downloadMediaMessage(msg, 'buffer', {})
        if (buf) imgB64 = (await sharp(buf).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()).toString('base64')
      } catch { }
    } else if (mc?.audioMessage || mc?.pttMessage) {
      tipo = 'audio'; texto = '[O cliente enviou um Ã¡udio]'
    } else if (mc?.stickerMessage || mc?.reactionMessage || mc?.protocolMessage) {
      return
    }

    if (!texto) return

    const meuNumero = normalizarNumero(this.sock.user?.id || '')
    const loja = await getLojaPorWaId(meuNumero)
    if (!loja) { console.warn(`[WA][${this.lojaId}] Loja nÃ£o encontrada para ${meuNumero}`); return }

    try { await this.sock.readMessages([msg.key]) } catch { }
    await delay(1200 + Math.random() * 2000)

    await salvarMensagem({ lojaId: loja.id, numeroCliente, nomeCliente, role: 'user', content: texto, tipo })

    await this.sock.sendPresenceUpdate('composing', jid)
    let resposta = '', pedido = null
    try {
      const r = await chamarIA(loja, numeroCliente, texto, tipo, imgB64)
      resposta = r.texto; pedido = r.pedido
    } catch (err) {
      console.error(`[WA][${this.lojaId}] AI Engine erro:`, err.message)
      resposta = 'Oi! Tive uma instabilidade. Pode repetir? ðŸ˜Š'
    }

    await salvarMensagem({ lojaId: loja.id, numeroCliente, nomeCliente, role: 'assistant', content: resposta, tipo: 'texto' })

    if (pedido?.itens?.length > 0) {
      await criarPedido({
        loja_id: loja.id, numero_cliente: numeroCliente,
        nome_cliente: pedido.nome_cliente || nomeCliente,
        itens: JSON.stringify(pedido.itens), total: pedido.total || 0,
        pagamento: pedido.pagamento || 'a combinar', status: 'Pendente',
      }).catch(e => console.error(`[WA][${this.lojaId}] Pedido erro:`, e.message))
    }

    await this.sock.sendPresenceUpdate('paused', jid)
    for (const bloco of dividirMensagem(resposta)) {
      await this.enviarTexto(jid, bloco)
    }
    console.log(`[WA][${this.lojaId}] âœ… Resposta enviada a ${numeroCliente}`)
  }

  async enviarTexto(jid, texto) {
    if (!this.sock) throw new Error('Socket nÃ£o conectado')
    const t = Math.min(texto.length * 40 + Math.random() * 1500, 5000)
    await this.sock.sendPresenceUpdate('composing', jid)
    await delay(t)
    await this.sock.sendPresenceUpdate('paused', jid)
    await this.sock.sendMessage(jid, { text: texto })
  }

  async desconectar(deletarSessao = true) {
    try { if (this.sock) { await this.sock.logout().catch(() => { }); this.sock = null } } catch { }
    if (deletarSessao) {
      const dir = path.join(process.cwd(), 'auth', `session_${this.lojaId}`)
      if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); console.log(`[WA] ðŸ—‘ SessÃ£o deletada: ${dir}`) }
    }
    this.status = 'aguardando'; this.pairingCode = null; this.numero = null
    this.erro = null; this.tentativas = 0; this._pairingSolicitado = false
  }
}

// â”€â”€ Manager Singleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class Manager {
  constructor() { this._map = new Map() }

  _get(id) { return this._map.get(id) }
  _getOrCreate(id) {
    if (!this._map.has(id)) this._map.set(id, new WaInstance(id))
    return this._map.get(id)
  }

  allStates() { return Array.from(this._map.values()).map(i => i.state()) }

  async conectar(lojaId, numero) {
    const inst = this._getOrCreate(lojaId)
    if (inst.status === 'conectado') return { status: 'ja_conectado', numero: inst.numero }

    inst.conectar(numero).catch(err => { inst.erro = err.message })

    for (let i = 0; i < 30; i++) {
      await delay(500)
      if (inst.pairingCode || inst.status === 'conectado' || inst.erro) break
    }
    return inst.state()
  }

  async desconectar(lojaId, deletarSessao = true) {
    const inst = this._map.get(lojaId)
    if (inst) { await inst.desconectar(deletarSessao); return }
    if (deletarSessao) {
      const dir = path.join(process.cwd(), 'auth', `session_${lojaId}`)
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    }
  }

  stateOf(lojaId) {
    return this._map.get(lojaId)?.state() ?? { lojaId, status: 'aguardando', pairingCode: null, numero: null, erro: null }
  }


  /** Reconecta no boot todas as sessÃµes salvas */
  async reconectarSessoes() {
    const base = path.join(process.cwd(), 'auth')
    if (!fs.existsSync(base)) return
    const dirs = fs.readdirSync(base).filter(d => d.startsWith('session_'))
    if (!dirs.length) { console.log('[Manager] Nenhuma sessÃ£o salva.'); return }
    console.log(`[Manager] Reconectando ${dirs.length} sessÃ£o(Ãµes)...`)
    for (const dir of dirs) {
      const lojaId = dir.replace('session_', '')
      this._getOrCreate(lojaId).conectar(null)
        .catch(e => console.error(`[Manager] ReconexÃ£o ${lojaId}:`, e.message))
    }
  }
}

/**
 * responderAgente â€” FunÃ§Ã£o usada pela rota /simulate para testar a IA
 */
export async function responderAgente(loja_id, numeroCliente, texto) {
  try {
    // 1. Procurar a loja no banco para pegar o prompt
    const { getLojaPorId } = await import('./database.js');
    const loja = await getLojaPorId(loja_id);

    if (!loja) throw new Error('Loja nÃ£o encontrada');

    // 2. Chamar a IA (substituindo chamarLLM)
    const resultado = await chamarIA(loja, numeroCliente, texto, 'texto', null);

    return resultado.texto; // Retorna apenas o texto da resposta
  } catch (err) {
    console.error("[whatsapp.js] Erro em responderAgente:", err.message);
    return "Erro ao processar simulaÃ§Ã£o: " + err.message;
  }
}

export const instanceManager = new Manager()

