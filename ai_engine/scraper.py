import httpx
from bs4 import BeautifulSoup
import pdfplumber
import pandas as pd
import io

async def scrape_url(url: str) -> str:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    soup = BeautifulSoup(r.text, 'html.parser')
    for tag in soup(['script','style','nav','footer','header']):
        tag.decompose()
    return ' '.join(soup.get_text(separator=' ', strip=True).split())[:8000]

def extract_pdf(file_bytes: bytes) -> str:
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        return '\n'.join(p.extract_text() or '' for p in pdf.pages)[:8000]

def extract_xlsx(file_bytes: bytes, filename: str) -> str:
    if filename.endswith('.csv'):
        df = pd.read_csv(io.BytesIO(file_bytes))
    else:
        df = pd.read_excel(io.BytesIO(file_bytes))
    return df.to_string(index=False)[:8000]
