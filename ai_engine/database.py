import os
from supabase import create_client, Client

supabase_url = os.environ.get("SUPABASE_URL", "")
supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "")

# supabase-py uses sync API by default
sb: Client = create_client(supabase_url, supabase_key)

def get_loja(loja_id: str):
    res = sb.table("lojas").select("*").eq("id", loja_id).execute()
    return res.data[0] if res.data else None

def get_produtos(loja_id: str):
    res = sb.table("produtos").select("*").eq("loja_id", loja_id).eq("ativo", True).execute()
    return res.data

def get_historico(loja_id: str, numero: str, limite: int = 20):
    res = sb.table("conversas").select("*").eq("loja_id", loja_id).eq("numero_cliente", numero).order("created_at", desc=True).limit(limite).execute()
    return list(reversed(res.data))

def get_rag_docs(loja_id: str):
    res = sb.table("rag_documentos").select("*").eq("loja_id", loja_id).eq("ativo", True).execute()
    return res.data

def salvar_mensagem(loja_id: str, numero_cliente: str, nome_cliente: str, role: str, content: str, tipo: str = "texto"):
    sb.table("conversas").insert({
        "loja_id": loja_id,
        "numero_cliente": numero_cliente,
        "nome_cliente": nome_cliente,
        "role": role,
        "content": content,
        "tipo": tipo
    }).execute()

def salvar_rag_doc(loja_id: str, titulo: str, conteudo: str, tipo: str, fonte: str):
    res = sb.table("rag_documentos").insert({
        "loja_id": loja_id,
        "titulo": titulo,
        "conteudo": conteudo,
        "tipo": tipo,
        "fonte": fonte,
        "ativo": True
    }).execute()
    return res.data[0] if res.data else None

def deletar_rag_doc(doc_id: str):
    sb.table("rag_documentos").delete().eq("id", doc_id).execute()
