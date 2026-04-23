# WavePod Agent — Guia Completo

## Arquitetura atual (preservada)

```
src/
├── app.js          ← Express: todas as rotas
├── database.js     ← Supabase client + todas as queries
└── whatsapp.js     ← Baileys multi-tenant + Groq (RAG + respostas)

auth/
└── session_{lojaId}/   ← sessões Baileys, uma por loja
```

### Fluxo que já funciona e NÃO muda
```
Cliente envia msg WhatsApp
  → Baileys recebe (whatsapp.js → WaInstance._processar)
  → Identifica loja pelo wa_id
  → Busca histórico + produtos no Supabase (database.js)
  → Monta system prompt com catálogo (buildSystem)
  → Chama Groq LLaMA 3 (chamarGroq)
  → Salva resposta no Supabase
  → Envia resposta pelo WhatsApp
```

---

## Problema crítico identificado no database.js

A função `getDadosParaRAG` está DENTRO do corpo de `getStats` — JavaScript nunca vai conseguir exportá-la. Fix na Parte 2.

Além disso: `whatsapp.js` usa `getProdutosDaLoja` que busca da tabela `produtos_agente`, mas nas fotos sua tabela se chama `produtos`. Precisamos alinhar isso na Parte 2.

---

## Tabelas — estado atual vs. necessário

| Tabela | Estado | Ação |
|---|---|---|
| `lojas` | Existe | Adicionar: `senha_cliente`, `bot_ativo`, `cor_marca` |
| `produtos` | Existe (nome diferente) | Adicionar: `sabor`, `preco_venda`, `quantidade`, `ativo` |
| `conversas` | Existe ✅ | Nada |
| `config_lojas` | Existe | Nada |
| `pedidos_agente` | Não existe | Criar |
| `rag_documentos` | Não existe | Criar (RAG) |

---

## Execute este SQL agora no Supabase → SQL Editor

Cole o conteúdo do arquivo `schema.sql` e clique Run.

---

## Partes da entrega

### ✅ Parte 1 — SQL + README (agora)
### 🔜 Parte 2 — database.js corrigido + funções RAG
### 🔜 Parte 3 — whatsapp.js com RAG no buildSystem
### 🔜 Parte 4 — app.js com rotas RAG + portal cliente
### 🔜 Parte 5 — Painel admin HTML completo
### 🔜 Parte 6 — Portal cliente HTML

---

## Como o RAG vai funcionar

### Alimentação (admin no painel)
```
Aba "Base de Conhecimento" → escolhe o tipo:
  URL  → backend faz fetch + extrai texto com cheerio
  PDF  → backend extrai texto com pdf-parse
  XLSX → backend converte para texto com xlsx
  Texto → salva direto
```

### Uso no agente (automático)
```
buildSystem(loja) → busca produtos + busca rag_documentos
  → monta:
    ## Catálogo
    [produtos]

    ## Base de Conhecimento
    [textos do RAG]
  → Groq responde com tudo isso no contexto
```

### Pacotes a instalar
```bash
npm install pdf-parse xlsx multer cheerio
```

---

## Portal do cliente

Login simples: `wa_id` + `senha_cliente` (campo que você define pelo painel).

Funcionalidades do portal:
- Ver se o bot está ativo
- Ligar/desligar bot
- Ver histórico de conversas
- Sem acesso a prompts ou configurações do sistema

---

## Volume persistente no Railway (IMPORTANTE)

Sem isso as sessões do WhatsApp somem em cada redeploy:

1. Railway → seu projeto → serviço
2. **Settings** → **Volumes**
3. Mount path: `/app/auth`

Suas sessões ficam em `auth/session_{lojaId}/` — o volume garante que sobrevivam.

---

## Checklist

- [FEITO] Executar `schema.sql` no Supabase
- [FEITO] `npm install pdf-parse xlsx multer cheerio` no projeto
- [FEITO/PRECISOU SER ALTERADO PARA STATUS] Volume `/app/auth` no Railway
- [você arrumou] Receber Parte 2 (database.js)
- [você arrumou]] Receber Parte 3 (whatsapp.js)
- [você arrumou ] Receber Parte 4 (app.js)

Aqui é a parte do HTML. (ele está em um repositório a parte no github, e hospedado no cloudflare pages, assim estou fazendo para manter online a página para o painel admin.)
Vou te enviar fotos de referência para criarmos o HTML seja ele estático ou react, só preciso rodando uma ferramenta que realmente funcione.

Hoje a ferramenta para cadastro de usuários funciona vou te enviar junto o html.
- [ ] Receber Parte 5 (painel admin)
- [ ] Receber Parte 6 (portal cliente)
