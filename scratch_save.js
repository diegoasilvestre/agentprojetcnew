import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  const docId = 'c6a8d217-0043-4796-b647-e1ac5179b93a';
  const lojaId = '79320865-3792-4551-95d4-1f50ff918e3d';
  
  const res = await gemini.models.embedContent({
    model: 'gemini-embedding-2',
    contents: 'Teste de chunk'
  });
  const embedding = res.embeddings[0].values;
  
  const { data, error } = await db.from('rag_chunks').insert({
    documento_id: docId,
    loja_id: lojaId,
    conteudo: 'Teste de chunk',
    embedding: embedding
  });
  
  console.log('Insert:', { data, error });
}
test();
