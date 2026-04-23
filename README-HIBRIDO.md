# 🚀 Arquitetura Híbrida: Node.js + Python (FastAPI)

Este guia explica como configurar e subir a nova arquitetura do seu bot. Agora o projeto é dividido em **dois serviços**, trazendo muito mais robustez e velocidade para as inteligências artificiais.

---

## 🛠 Como Funciona?

1. **Node.js (WhatsApp Engine)**: Fica responsável apenas por manter a conexão com o WhatsApp (Baileys) e receber/enviar as mensagens.
2. **Python (AI Engine)**: Um servidor ultra rápido (FastAPI) que processa as mensagens, lê o Supabase, gera as respostas (LangChain + Groq) e extrai textos de links, planilhas e PDFs com altíssima precisão.

Sempre que o Node.js recebe uma mensagem, ele faz um "HTTP POST" transparente para a API Python, que faz todo o trabalho pesado.

---

## 🔑 1. Configurando as Variáveis de Ambiente (.env)

Você precisará garantir que as chaves estejam configuradas nos dois serviços.

### No Node.js (Serviço atual do Railway)
Vá nas configurações do serviço Node.js no Railway e garanta que estas variáveis existam:
```env
# URL gerada pelo seu NOVO serviço Python no Railway
PYTHON_AI_URL=https://seu-python-service.railway.app
```
*(Você não precisa mais do `GROQ_API_KEY` ou `GEMINI_API_KEY` no Node.js, mas pode deixá-las lá sem problemas).*

### No Python (Novo serviço FastAPI)
Quando você criar o serviço Python no Railway, adicione TODAS estas chaves (as mesmas do Node.js, mais a do Groq):
```env
SUPABASE_URL=sua-url-do-supabase-aqui
SUPABASE_SERVICE_KEY=sua-chave-secreta-service-role-aqui
GROQ_API_KEY=sua-chave-do-groq-aqui
```

---

## 🚀 2. Como Fazer o Deploy no Railway

Como agora temos uma pasta `ai_engine` dentro do seu projeto, você criará dois serviços diferentes apontando para o MESMO repositório GitHub.

### Serviço 1: O Node.js (Você já tem)
- Continue usando o seu repositório principal.
- Root Directory: `/` (raiz do projeto)
- Comando de start: `npm start` (já está configurado)

### Serviço 2: O Python FastAPI (Novo)
No Railway:
1. Clique em **New** > **GitHub Repo**.
2. Selecione o MESMO repositório do seu bot.
3. Vá em **Settings** > **Build**.
4. Mude o **Root Directory** para: `/ai_engine`
5. O Railway vai detectar o `railway.toml` automaticamente e usar o Nixpacks para instalar o Python e os pacotes do `requirements.txt`.
6. Após o build, o Railway vai te dar uma URL pública (ex: `https://ai-engine-producao.up.railway.app`).
7. Copie essa URL e coloque na variável `PYTHON_AI_URL` do seu serviço Node.js.

*(Dica PRO: Se você manja de "Private Networking" no Railway, pode usar a URL interna como `http://ai-engine.railway.internal:8000` para não cobrar tráfego externo).*

---

## 🗄 3. Supabase (Comandos SQL)

Na arquitetura Python, o RAG inicial foi simplificado para fazer uma **Busca Textual Direta**, embutindo os textos da base diretamente no Prompt de Sistema. Isso significa que **você NÃO precisa se preocupar com os "embeddings" (vetores de 3072) no momento**.

Se as tabelas atuais `rag_documentos` e `lojas` já existem, o Python vai ler os textos diretamente delas!

Caso precise recriar a tabela `rag_documentos` do zero para suportar links e PDFs:

```sql
CREATE TABLE rag_documentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id) on delete cascade,
  tipo text,
  titulo text,
  conteudo text,
  fonte text,
  ativo boolean default true,
  criado_em timestamp with time zone default now(),
  atualizado_em timestamp with time zone default now()
);
```

Pronto! Ao enviar links ou PDFs na aba **Base de Conhecimento** do seu painel HTML, o Node.js passará os dados para o Python (via `/rag/url` ou `/rag/pdf`), o Python fará o scraping limpo (removendo tags HTML do site) e salvará o texto cru na tabela `rag_documentos`. Quando o cliente chamar o WhatsApp, a IA lerá esse documento instantaneamente!
