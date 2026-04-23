# PROMPT — Remap Arquitetural: Node.js + Python FastAPI (Híbrido Multi-Tenant)

## CONTEXTO DO PROJETO ATUAL

Tenho um chatbot de vendas WhatsApp multi-tenant funcionando em produção no Railway. Stack atual:

**Node.js (src/):**
- `app.js` — Express, todas as rotas, CORS, auth JWT Supabase via JWKS
- `database.js` — Supabase client (service_role), todas as queries
- `whatsapp.js` — Baileys multi-tenant (WaInstance + Manager), Groq LLaMA 3, RAG básico

**Supabase (tabelas existentes):**
```
lojas          → id(uuid), nome, wa_id, ativa(bool), config(jsonb), prompt_base, instrucoes_extras, senha_cliente, bot_ativo, cor_marca
produtos       → id(uuid), loja_id(FK), nome, preco(numeric), descricao, sabor, preco_venda, quantidade, ativo, link
conversas      → id(uuid), loja_id(uuid), numero_cliente, nome_cliente, role(user/assistant), content, tipo, created_at
config_lojas   → loja_id(PK,text), nome_loja, system_prompt, status_conexao, created_at
pedidos_agente → id(uuid), loja_id, numero_cliente, nome_cliente, itens(jsonb), total, pagamento, status(Pendente/Confirmado/Cancelado/Entregue)
rag_documentos → id(uuid), loja_id, tipo(url/pdf/planilha/texto/imagem), titulo, conteudo(text), fonte, ativo, criado_em, atualizado_em
```

**Fluxo atual (tudo em Node):**
```
WhatsApp msg → WaInstance._processar() → getLojaPorWaId() → buildSystem() → chamarGroq() → salvarMensagem() → enviarTexto()
```

**O que já funciona e NÃO pode quebrar:**
- Conexão multi-tenant via pairing code (sem QR): `POST /wa/connect { loja_id, numero }`
- Reconexão automática no boot: `instanceManager.reconectarSessoes()`
- Sessões em `./auth/session_{lojaId}/` (volume persistente no Railway)
- CORS `*`, auth JWT via `Authorization: Bearer <supabase_token>`
- Rotas: `/status`, `/wa/connect`, `/wa/status/:id`, `/wa/disconnect/:id`, `/wa/instances`, `/simulate`, `/admin/lojas`, `/admin/produtos`, `/admin/pedidos`, `/admin/conversas/*`

---

## ARQUITETURA ALVO

```
┌─────────────────────────────────────────┐
│  WhatsApp (Node.js — Railway, porta 3000)│
│  Baileys multi-tenant                   │
│  Só recebe/envia mensagens              │
│  Chama Python via HTTP interno          │
└──────────────┬──────────────────────────┘
               │ POST /chat { loja_id, numero_cliente, mensagem, tipo, img_b64? }
               ▼
┌─────────────────────────────────────────┐
│  AI Engine (Python FastAPI — porta 8000) │
│  LangChain + Groq LLaMA 3               │
│  RAG: Supabase pgvector                 │
│  Scraping: BeautifulSoup/Playwright     │
│  Retorna: { resposta, pedido? }         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Supabase (compartilhado)               │
│  Node lê/escreve: lojas, conversas      │
│  Python lê/escreve: rag_documentos,     │
│  conversas (histórico para RAG)         │
└─────────────────────────────────────────┘
```

---

## O QUE PRECISO QUE VOCÊ GERE

### 1. Node.js — whatsapp.js modificado

**Mudança cirúrgica:** substituir apenas a função `chamarGroq()` e o import do Groq.

```javascript
// ANTES (dentro de whatsapp.js):
async function chamarGroq(loja, numeroCliente, mensagem, tipo, imgB64) {
  // ... Groq SDK direto ...
}

// DEPOIS:
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
```

**Manter intacto:** toda a classe WaInstance (conectar, _processar, _enfileirar, _dedup, _rate_ok, desconectar), Manager, reconectarSessoes, exports.

**Remover do whatsapp.js:** imports Groq, buildSystem, extrairPedido, chamarGroq.

**Adicionar ao whatsapp.js:** import nativo `fetch` (Node 18+ tem nativo, sem necessidade de node-fetch).

### 2. Python FastAPI — `ai_engine/main.py`

**Estrutura de arquivos:**
```
ai_engine/
├── main.py          ← FastAPI app, rota /chat e /rag
├── rag.py           ← LangChain + Supabase pgvector
├── scraper.py       ← extração de URL/PDF/XLSX
├── database.py      ← supabase-py client
├── requirements.txt
└── .env             ← mesmas vars do Node + OPENAI_API_KEY se usar embeddings
```

**`main.py` — rota principal:**
```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import os

app = FastAPI()

class ChatRequest(BaseModel):
    loja_id: str
    numero_cliente: str
    mensagem: str
    tipo: str = "texto"
    img_b64: Optional[str] = None

@app.post("/chat")
async def chat(req: ChatRequest):
    # 1. Busca loja no Supabase
    # 2. Verifica bot_ativo
    # 3. Busca histórico (últimas 20 msgs)
    # 4. Busca produtos ativos da loja
    # 5. Busca RAG docs relevantes (rag_documentos WHERE loja_id = X AND ativo = true)
    # 6. Monta system prompt
    # 7. Chama Groq via LangChain
    # 8. Extrai pedido se houver PEDIDO_JSON:{}
    # 9. Salva mensagem user + assistant em conversas
    # 10. Retorna { texto, pedido }
    pass
```

**`rag.py` — rotas de alimentação:**
```
POST /rag/url     → { loja_id, url }         → scraping → embed → salva em rag_documentos
POST /rag/texto   → { loja_id, titulo, texto } → embed → salva
POST /rag/pdf     → multipart/form-data       → extract → embed → salva
POST /rag/xlsx    → multipart/form-data       → pandas → texto → embed → salva
GET  /rag/:loja_id → lista documentos RAG da loja
DELETE /rag/:id   → desativa documento
```

**RAG strategy (sem pgvector por ora — texto simples):**

Não usar embeddings vetoriais na primeira versão. Usar **full-text search simples**: concatenar todos os `conteudo` dos `rag_documentos` ativos da loja e incluir no system prompt. Limite: 4000 tokens de RAG. Se ultrapassar, truncar os mais antigos.

Isso evita precisar de pgvector/OpenAI embeddings e já funciona muito bem para catálogos de produtos, FAQs e tabelas de preço.

**`scraper.py`:**
```python
# URL → texto limpo
import httpx
from bs4 import BeautifulSoup

async def scrape_url(url: str) -> str:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    soup = BeautifulSoup(r.text, 'html.parser')
    for tag in soup(['script','style','nav','footer','header']):
        tag.decompose()
    return ' '.join(soup.get_text(separator=' ', strip=True).split())[:8000]

# PDF → texto
import pdfplumber
def extract_pdf(file_bytes: bytes) -> str:
    import io
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        return '\n'.join(p.extract_text() or '' for p in pdf.pages)[:8000]

# XLSX/CSV → texto
import pandas as pd
import io
def extract_xlsx(file_bytes: bytes, filename: str) -> str:
    if filename.endswith('.csv'):
        df = pd.read_csv(io.BytesIO(file_bytes))
    else:
        df = pd.read_excel(io.BytesIO(file_bytes))
    return df.to_string(index=False)[:8000]
```

**`database.py`:**
```python
from supabase import create_client
import os

sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

async def get_loja(loja_id: str): ...
async def get_produtos(loja_id: str): ...
async def get_historico(loja_id: str, numero: str, limite=20): ...
async def get_rag_docs(loja_id: str): ...
async def salvar_mensagem(...): ...
async def salvar_rag_doc(...): ...
```

**`requirements.txt`:**
```
fastapi==0.111.0
uvicorn==0.29.0
langchain==0.2.0
langchain-groq==0.1.3
supabase==2.4.0
httpx==0.27.0
beautifulsoup4==4.12.3
pdfplumber==0.11.0
pandas==2.2.2
openpyxl==3.1.2
python-multipart==0.0.9
pydantic==2.7.1
python-dotenv==1.0.1
```

### 3. System prompt do agente (buildSystem em Python)

```python
def build_system(loja: dict, produtos: list, rag_docs: list) -> str:
    catalogo = '\n'.join([
        f"• {p['nome']}"
        + (f" – {p['sabor']}" if p.get('sabor') else '')
        + (f" | R$ {float(p.get('preco_venda') or p.get('preco') or 0):.2f}".replace('.', ','))
        + (f" | {p['quantidade']} un." if p.get('quantidade') is not None else '')
        + (f" | {p['descricao']}" if p.get('descricao') else '')
        for p in produtos
    ]) or 'Nenhum produto cadastrado.'

    rag_context = ''
    if rag_docs:
        textos = [f"[{d.get('titulo','Documento')}]\n{d['conteudo']}" for d in rag_docs]
        rag_context = '\n\n## Base de Conhecimento\n' + '\n\n---\n'.join(textos)[:4000]

    return f"""{loja.get('prompt_base') or f'Você é atendente da loja "{loja["nome"]}".'

## Catálogo
{catalogo}
{rag_context}

## Regras
{loja.get('instrucoes_extras') or ''}
- Responda SOMENTE em português do Brasil.
- Máximo 3 parágrafos. É WhatsApp.
- Responda APENAS sobre produtos e informações acima. Nunca invente.
- Se não souber: "Posso chamar um atendente humano. Quer que eu chame?"
- Para fechar pedido colete: nome, endereço, itens, pagamento.
- Quando tiver todos os dados inclua ao FINAL:
  PEDIDO_JSON:{{"nome_cliente":"","itens":[{{"nome":"","qty":1,"preco":0}}],"total":0,"pagamento":"Pix"}}
- Nunca diga que é IA, a menos que perguntado.
- Nunca mencione "Base de Conhecimento" ou "Catálogo" explicitamente.""".strip()
```

### 4. Deploy (dois serviços no Railway)

**Serviço 1 — Node (existente):**
```
# Variável nova a adicionar:
PYTHON_AI_URL=https://seu-python-service.railway.app
```

**Serviço 2 — Python (novo):**
```
# railway.toml na raiz do ai_engine/
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"

# Variáveis (mesmas do Node):
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
GROQ_API_KEY=...
```

**Comunicação interna Railway:** os dois serviços se comunicam via URL pública. Para comunicação interna (mais rápida, sem cobrar egress), use Railway Private Networking: `http://ai-engine.railway.internal:8000`.

### 5. Painel Admin HTML (index.html) — nova aba RAG

**Adicionar à navegação existente:**
```html
<a href="#rag">📚 Base de Conhecimento</a>
```

**Seção RAG:**
```html
<section id="rag">
  <!-- Tabs: URL | Texto | PDF | Planilha -->
  <!-- Lista de documentos com toggle ativo/inativo e delete -->
  <!-- Para cada doc: título, tipo (badge), data, preview dos primeiros 200 chars -->
</section>
```

**JS — upload de URL:**
```javascript
async function addRagUrl(lojaId, url) {
  const r = await fetch(`${API}/rag/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ loja_id: lojaId, url })
  })
  return r.json() // { id, titulo, conteudo_preview }
}
```

**JS — upload de arquivo:**
```javascript
async function uploadRagFile(lojaId, file) {
  const fd = new FormData()
  fd.append('loja_id', lojaId)
  fd.append('file', file)
  const endpoint = file.name.endsWith('.pdf') ? 'pdf' : 'xlsx'
  const r = await fetch(`${API}/rag/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: fd
  })
  return r.json()
}
```

---

## INSTRUÇÕES PARA O AGENT

Gere os seguintes arquivos completos, nesta ordem:

1. `ai_engine/main.py` — FastAPI completo com /chat funcional (sem placeholder)
2. `ai_engine/rag.py` — rotas /rag/* completas com scraping real
3. `ai_engine/scraper.py` — funções scrape_url, extract_pdf, extract_xlsx completas
4. `ai_engine/database.py` — client Supabase async completo
5. `src/whatsapp.js` — arquivo completo com chamarGroq substituído por chamarIA (HTTP fetch), tudo mais intacto
6. `index.html` — painel admin completo com aba RAG funcional

**Restrições:**
- Não reescrever o que não precisa mudar
- Em whatsapp.js: só mudar chamarGroq → chamarIA e remover imports Groq/buildSystem/extrairPedido
- Todas as classes WaInstance e Manager permanecem byte-a-byte iguais
- Python deve usar async/await em todas as rotas FastAPI
- Supabase Python: usar `supabase-py` v2 (API síncrona via `.execute()`)
- Groq via LangChain: `from langchain_groq import ChatGroq`
- Sem autenticação no serviço Python (está atrás do Node, não exposto diretamente)
- Fallback no Node: se Python retornar erro HTTP, responder "Oi! Tive uma instabilidade. Pode repetir? 😊"

**Não incluir:**
- Explicações
- Comentários além do necessário
- Blocos de teste/mock
- TODO/FIXME
- Placeholders como `# implementar depois`
