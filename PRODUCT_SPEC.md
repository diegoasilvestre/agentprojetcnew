# Especificação de Produto: RoboTI-BR (v22.0)

Este documento detalha o estado atual, funcionalidades e arquitetura da plataforma **RoboTI-BR Omnichat AI**.

---

## 1. Visão Geral
O RoboTI-BR é uma plataforma SaaS (Software as a Service) focada em atendimento automatizado via WhatsApp, integrando Inteligência Artificial Generativa com uma interface de atendimento híbrido (Omnichat). O sistema é multi-tenant, permitindo que múltiplas empresas operem de forma isolada na mesma infraestrutura.

---

## 2. Arquitetura do Backend (Motor de IA e WA)
*   **Integração WhatsApp**: Utiliza a biblioteca `@whiskeysockets/baileys` para emulação de WhatsApp Web, garantindo conexão estável via Pairing Code.
*   **Motor RAG (Retrieval-Augmented Generation)**: 
    *   Usa `Supabase` como banco de dados vetorial (`pgvector`).
    *   Embeddings processados localmente via `@xenova/transformers` (modelo `all-MiniLM-L6-v2`).
    *   Permite que a IA responda baseada em documentos específicos de cada cliente.
*   **Gestão de Sessões**: O sistema restaura automaticamente as sessões de WhatsApp após reinícios do servidor.
*   **Fallback de IA**: Lógica para alternar entre diferentes modelos de linguagem para garantir 100% de disponibilidade.

---

## 3. Dashboards e Funcionalidades do Front-end

### A. Dashboard de Diagnóstico (Monitoramento)
*   Visualização de status da conexão (Server, DB, WhatsApp).
*   Ferramenta de diagnóstico profundo para verificar integridade de prompts e chaves de API.

### B. Omnichat (Atendimento Híbrido)
*   **Inbox Estilo WA Web**: Lista de conversas ativas com busca.
*   **Controle Manual/IA**: Toggle para pausar a IA e permitir que um atendente humano assuma o chat sem interferência.
*   **Histórico de Mensagens**: Carregamento dinâmico de conversas anteriores.

### C. Gestão de Base de Conhecimento
*   **Web Scraper**: Extração automática de conteúdo de sites para treinar a IA.
*   **Importação Manual**: Upload de textos e regras de negócio específicas.
*   **Gestão de Documentos**: Visualização e deleção de fontes de conhecimento.

### D. CRM e Leads
*   **Captura Automática**: Cadastro instantâneo de novos contatos.
*   **Status de Funil**: Gestão de estados do lead (Lead, Em Atendimento, Concluído).
*   **Timeline**: Registro de última interação para acompanhamento de recompra.

### E. Catálogo de Produtos
*   Interface para cadastro de itens (Nome, Preço, SKU).
*   Controle de visibilidade para a IA (escolher quais produtos o bot pode vender).

---

## 4. Configurações de IA (Agente)
Cada Tenant (Loja) possui seu próprio "Agente" personalizável:
*   **Nicho e Tom de Voz**: Define se o bot será formal, amigável, técnico, etc.
*   **Regras de Ouro**: Instruções que a IA nunca pode violar.
*   **Prompt de Personalidade**: Contexto base para as respostas.

---

## 5. Diferenciais de Design (UI/UX)
*   **Estética Premium**: Tema Dark Mode baseado no Design System de empresas como Vercel e Shadcn/UI.
*   **Performance**: SPA (Single Page Application) construída em Vanilla JS para carregamento instantâneo.
*   **Responsividade**: Desktop otimizado (Mobile em implementação isolada).

---

## 6. Infraestrutura e Manutenção
*   **PM2 Management**: Processo gerenciado 24/7 com reinício automático no boot do servidor.
*   **Oracle Cloud Ready**: Otimizado para rodar no plano "Always Free" sem custos de infraestrutura.
*   **Safety Point**: Ponto de restauração master registrado para rollbacks rápidos.

---
**Status**: Versão 22.0 Estável.
**Última Atualização**: 30 de Abril de 2026.
