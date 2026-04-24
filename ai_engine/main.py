from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
import os
import json
import logging

import database as db
from rag import router as rag_router

app = FastAPI()
app.include_router(rag_router)

class ChatRequest(BaseModel):
    loja_id: str
    numero_cliente: str
    mensagem: str
    tipo: str = "texto"
    img_b64: Optional[str] = None

def build_system(loja: dict, produtos: list, rag_docs: list) -> str:
    catalogo = '\n'.join([
        f"• {p['nome']}"
        + (f" - {p['sabor']}" if p.get('sabor') else '')
        + (f" | R$ {float(p.get('preco_venda') or p.get('preco') or 0):.2f}".replace('.', ','))
        + (f" | {p['quantidade']} un." if p.get('quantidade') is not None else '')
        + (f" | {p['descricao']}" if p.get('descricao') else '')
        for p in produtos
    ]) or 'Nenhum produto cadastrado.'

    rag_context = ''
    if rag_docs:
        textos = [f"[{d.get('titulo','Documento')}]\n{d['conteudo']}" for d in rag_docs]
        rag_context = '\n\n## Base de Conhecimento\n' + '\n\n---\n'.join(textos)[:4000]

    return f"""{loja.get('prompt_base') or f'Você é atendente da loja "{loja["nome"]}".'}

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

def extrair_pedido(raw: str):
    import re
    m = re.search(r'PEDIDO_JSON:(\{[\s\S]*?\})', raw)
    if not m:
        return raw.strip(), None
    try:
        pedido = json.loads(m.group(1))
        texto = re.sub(r'PEDIDO_JSON:[\s\S]*?(\n|$)', '', raw).strip()
        return texto, pedido
    except:
        return raw.strip(), None

@app.post("/chat")
async def chat(req: ChatRequest):
    loja = db.get_loja(req.loja_id)
    if not loja:
        raise HTTPException(status_code=404, detail="Loja não encontrada")
    
    # Verifica se a loja está ativa (aceita tanto 'ativa' quanto 'bot_ativo')
    is_active = loja.get("ativa", True) and loja.get("bot_ativo", True)
    if not is_active:
        return {"texto": "Bot inativo para esta loja.", "pedido": None}

    produtos = db.get_produtos(req.loja_id)
    historico = db.get_historico(req.loja_id, req.numero_cliente, limite=15)
    rag_docs = db.get_rag_docs(req.loja_id)
    
    system_prompt = build_system(loja, produtos, rag_docs)
    
    messages = [SystemMessage(content=system_prompt)]
    for h in historico:
        if h["role"] == "user":
            messages.append(HumanMessage(content=h["content"]))
        else:
            messages.append(AIMessage(content=h["content"]))
            
    # Add current message
    if req.tipo == "imagem" and req.img_b64:
        messages.append(HumanMessage(content=f"[Imagem Recebida] {req.mensagem}"))
    else:
        messages.append(HumanMessage(content=req.mensagem))

    config = loja.get("config", {})
    model_name = config.get("llm_model", "llama-3.3-70b-versatile")
    temperature = config.get("llm_temperature", 0.7)
    
    try:
        if "gemini" in model_name.lower():
            # Motor Google
            llm = ChatGoogleGenerativeAI(
                model=model_name,
                temperature=temperature,
                google_api_key=os.environ.get("GEMINI_API_KEY", "")
            )
        else:
            # Motor Groq
            llm = ChatGroq(
                model_name=model_name,
                temperature=temperature,
                api_key=os.environ.get("GROQ_API_KEY", "")
            )
            
        response = llm.invoke(messages)
        content = response.content
    except Exception as e:
        print(f"Erro na IA ({model_name}): {e}")
        content = "Desculpe, tive um problema técnico momentâneo. Pode tentar novamente? 😊"

    texto, pedido = extrair_pedido(content)
    
    # Save messages
    db.salvar_mensagem(req.loja_id, req.numero_cliente, "Cliente", "user", req.mensagem, req.tipo)
    db.salvar_mensagem(req.loja_id, req.numero_cliente, "Agente", "assistant", content, "texto")
    
    return {"texto": texto, "pedido": pedido}
