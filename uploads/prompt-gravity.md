# DIRETRIZ CRÍTICA DE SEGURANÇA (PASSO 0 - OBRIGATÓRIO)
Antes de alterar qualquer linha de código, deletar arquivos ou iniciar a refatoração, você DEVE realizar um commit completo do estado atual do projeto. 
Mensagem do commit: "BACKUP: Pre-Migration Node+Python to Unified Node". 
Eu preciso desse backup de segurança. Apenas prossiga após confirmar que este commit foi realizado.

# CONTEXTO E OBJETIVO (MIGRAÇÃO RAILWAY -> ORACLE VM)
A arquitetura anterior utilizava 2 serviços hospedados no Railway (Node.js para WhatsApp + Python para IA). Isso gerava dessincronização de banco, custos duplos e falhas de comunicação (`PYTHON_AI_URL`). 
Vamos abandonar completamente o Railway e o Python. O novo deploy será feito em apenas 1 servidor (Oracle VM). 
Portanto, a pasta `ai_engine` (Python) será deletada. O backend será 100% unificado em Node.js. Este único serviço será responsável por gerenciar as rotas, o Baileys (WhatsApp multi-tenant) e as chamadas diretas para IAs (Groq + Gemini).

# NOVO SCHEMA DO BANCO DE DADOS (SUPABASE)
Todas as tabelas antigas (`conversas_agente`, `lojas`, etc.) foram destruídas. O backend deve agora se conectar ao novo schema multi-tenant:
1. `clients`: (id, name, whatsapp_status, created_at)
2. `whatsapp_sessions`: (id, client_id, session_data) - Para manter o bot logado via Baileys.
3. `conversations`: (id, client_id, contact_number, role, content) - Histórico e contexto.
4. `knowledge_base`: (id, client_id, content, embedding, source_url) - Base para o RAG no Node.
5. `usage_logs`: (id, client_id, ai_model_used, tokens_used, action_type)

# PLANO DE EXECUÇÃO STEP-BY-STEP

**Fase 1: Limpeza da Estrutura e Infraestrutura**
- Delete a pasta `ai_engine` inteira. Não precisamos mais de `main.py`, `rag.py` ou arquivos de configuração do Railway (como `railway.toml` ou `Procfile`, se houverem). Tudo rodará em um único `package.json` no Node.

**Fase 2: Reescrever `src/database.js`**
- Remova todas as referências às tabelas antigas.
- Crie os métodos do Supabase client apontando exclusivamente para as novas tabelas informadas acima.

**Fase 3: Reescrever `src/whatsapp.js` (O Coração do Sistema)**
- Remova as chamadas HTTP para o Python.
- Implemente o gerenciamento de instâncias do Baileys salvando as credenciais na tabela `whatsapp_sessions`.
- Construa a "AI Engine" nativa no Node: Implemente o fallback inteligente. O bot deve tentar buscar a resposta primeiro via Groq (LLaMA 3). Se ocorrer erro/rate limit, deve cair automaticamente para o Google Gemini via SDK do Node.
- Todo histórico de chat processado deve ser gravado na tabela `conversations`.

**Fase 4: Reescrever `src/app.js` (Rotas Express)**
- Ajuste as rotas do backend para refletir o novo fluxo unificado em um único servidor.
- Garanta que as rotas de RAG e administração chamem funções internas do Node, e não mais serviços externos.

**Fase 5: Frontend (`frontend/app.js`)**
- Atualize as rotas de fetch/axios do frontend estático (que irá para a Cloudflare) para consumir os novos endpoints do backend Node.js unificado.

Regra de ouro: Faça o Passo 0, confirme para mim, e depois me pergunte antes de iniciar a Fase 1. Trabalhe de forma modular.

Após isso vamos hospedar ele na minha VM no Oracle, o código precisa ser 100% moldular para caber nesse novo esquema, visto que a minha VM tem 12gb de ram de processamento, ela dá mais do que conta desse projeto completo.