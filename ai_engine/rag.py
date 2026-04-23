from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional
from .scraper import scrape_url, extract_pdf, extract_xlsx
from . import database as db

router = APIRouter()

class RagUrlRequest(BaseModel):
    loja_id: str
    url: str

@router.post("/rag/url")
async def add_rag_url(req: RagUrlRequest):
    try:
        texto = await scrape_url(req.url)
        if not texto:
            raise HTTPException(status_code=400, detail="Não foi possível extrair conteúdo")
        doc = db.salvar_rag_doc(req.loja_id, req.url, texto, "url", req.url)
        return doc
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RagTextRequest(BaseModel):
    loja_id: str
    titulo: str
    texto: str

@router.post("/rag/texto")
async def add_rag_texto(req: RagTextRequest):
    doc = db.salvar_rag_doc(req.loja_id, req.titulo, req.texto, "texto", "manual")
    return doc

@router.post("/rag/pdf")
async def add_rag_pdf(loja_id: str = Form(...), file: UploadFile = File(...)):
    try:
        content = await file.read()
        texto = extract_pdf(content)
        doc = db.salvar_rag_doc(loja_id, file.filename, texto, "pdf", "upload")
        return doc
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rag/xlsx")
async def add_rag_xlsx(loja_id: str = Form(...), file: UploadFile = File(...)):
    try:
        content = await file.read()
        texto = extract_xlsx(content, file.filename)
        doc = db.salvar_rag_doc(loja_id, file.filename, texto, "xlsx", "upload")
        return doc
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/rag/{loja_id}")
async def get_rag_docs(loja_id: str):
    return db.get_rag_docs(loja_id)

@router.delete("/rag/{doc_id}")
async def delete_rag_doc(doc_id: str):
    db.deletar_rag_doc(doc_id)
    return {"ok": True}
