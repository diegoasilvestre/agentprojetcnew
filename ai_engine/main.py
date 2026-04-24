from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
import os
import json
import logging
import re

import database as db
from rag import router as rag_router

app = FastAPI(title="AI Engine")
app.include_router(rag_router)

class ChatRequest(BaseModel):
    loja_id: str
    numero_cliente: str
    mensagem: str
    tipo: str = "texto"
    img_b64: Optional[str] = None

def extrair_pedido(content: str):
    match = re.search(r"PEDIDO_JSON:(\{.*\})", content)
    if match:
        try:
            pedido_str = match.group(1)
            pedido = json.loads(pedido_str)
            texto = content.replace(match.group(0), "").strip()
            return texto, pedido
        except:
            return content, None
    return content, None

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

    prompt_base = loja.get('prompt_base') or f'Você é atendente da loja "{loja["nome"]}".'
    instrucoes = loja.get('instrucoes_extras') or ''

    return f"""{prompt_base}

## Catálogo
{catalogo}
{rag_context}

## Regras
{instrucoes}
- Responda SOMENTE em português do Brasil.
- Máximo 3 parágrafos. É WhatsApp.
- Responda APENAS sobre produtos e informações acima. Nunca invente.
- Se não souber: "Posso chamar um atendente humano. Quer que eu chame?"
- Para fechar pedido colete: nome, endereço, itens, pagamento.
- Quando tiver todos os dados inclua ao FINAL:
  PEDIDO_JSON:{{"nome_cliente":"","itens":[{{"nome":"","qty":1,"preco":0}}],"total":0,"pagamento":"Pix"}}
- Nunca diga que é IA, a menos que perguntado.
- Nunca mencione "Base de Conhecimento" ou "Catálogo" explicitamente.""".strip()

@app.post("/chat")
async def chat(req: ChatRequest):
    print(f"[DEBUG-PYTHON] Recebido: {req.mensagem} (Loja: {req.loja_id})")
    try:
        loja = db.get_loja(req.loja_id)
        if not loja:
            print(f"[DEBUG-PYTHON] Loja {req.loja_id} não encontrada")
            raise HTTPException(status_code=404, detail="Loja não encontrada")
        
        is_active = loja.get("ativa", True) and loja.get("bot_ativo", True)
        if not is_active:
            print(f"[DEBUG-PYTHON] Bot inativo para {loja.get('nome')}")
            return {"texto": "Bot inativo.", "pedido": None}

        produtos = db.get_produtos(req.loja_id)
        historico = db.get_historico(req.loja_id, req.numero_cliente)
        rag_docs = db.get_rag_docs(req.loja_id)

        system_prompt = build_system(loja, produtos, rag_docs)
        messages = [SystemMessage(content=system_prompt)]
        for m in historico:
            if m.get("role") == "user": messages.append(HumanMessage(content=m["content"]))
            else: messages.append(AIMessage(content=m["content"]))
        
        if req.tipo == "imagem" and req.img_b64:
            messages.append(HumanMessage(content=[
                {"type": "text", "text": req.mensagem},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{req.img_b64}"}}
            ]))
        else:
            messages.append(HumanMessage(content=req.mensagem))

        # Forçar Llama 3.3 70B
        model_name = "llama-3.3-70b-versatile"
        print(f"[DEBUG-PYTHON] Chamando LLM {model_name}...")
        
        llm = ChatGroq(
            model_name=model_name,
            temperature=0.7,
            api_key=os.environ.get("GROQ_API_KEY", "")
        )
        
        response = llm.invoke(messages)
        content = response.content
        texto, pedido = extrair_pedido(content)

        print(f"[DEBUG-PYTHON] Resposta gerada. Salvando no banco...")
        try:
            db.salvar_mensagem(
                loja_id=req.loja_id,
                numero_cliente=req.numero_cliente,
                nome_cliente=loja.get("nome", "Cliente"),
                role="assistant",
                content=texto
            )
        except Exception as db_err:
            print(f"[DEBUG-PYTHON] Erro ao salvar mensagem: {db_err}")

        return {"texto": texto, "pedido": pedido}
    except Exception as e:
        print(f"[DEBUG-PYTHON] Erro Geral: {e}")
        return {"texto": "Oi! Tive um problema técnico. Pode repetir? 😊", "pedido": None}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
