import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import * as dotenv from 'dotenv';
dotenv.config();

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function runAll() {
  console.log('\n===== ENVIRONMENT =====');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅' : '❌ MISSING');
  console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅' : '❌ MISSING');
  console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅' : '❌ MISSING');
  console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? '✅' : '❌ MISSING');
  
  console.log('\n===== TABLES =====');
  const tables = ['lojas', 'conversas', 'conversas_agente', 'produtos_agente', 'pedidos_agente', 'rag_documentos', 'rag_chunks'];
  for (const t of tables) {
    const { data, error } = await db.from(t).select('*').limit(1);
    if (error?.code === 'PGRST205') console.log(`❌ MISSING: ${t}`);
    else if (error) console.log(`⚠️ ERROR ${t}: ${error.code} - ${error.message}`);
    else console.log(`✅ OK: ${t} (${data?.length} rows sampled)`);
  }
  
  console.log('\n===== LOJAS =====');
  const { data: lojas } = await db.from('lojas').select('id, nome, wa_id, config, ativa');
  console.log(lojas);
  
  console.log('\n===== RAG DOCS =====');
  const { data: docs } = await db.from('rag_documentos').select('id, loja_id, titulo, tipo, criado_em');
  console.log(docs);
  
  console.log('\n===== RAG CHUNKS =====');
  const { data: chunks, count } = await db.from('rag_chunks').select('id, loja_id', { count: 'exact' }).limit(5);
  console.log(`Chunks found: ${chunks?.length}`, chunks?.map(c => c.loja_id));
  
  console.log('\n===== GEMINI EMBEDDING =====');
  try {
    const res = await gemini.models.embedContent({ model: 'gemini-embedding-2', contents: 'test' });
    console.log('✅ Embedding size:', res.embeddings[0].values.length);
  } catch(e) { console.log('❌ Embedding error:', e.message); }
  
  console.log('\n===== GROQ MODELS =====');
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Say hi' }],
      max_tokens: 5
    });
    console.log('✅ Groq llama-3.3-70b-versatile OK');
  } catch(e) { console.log('❌ Groq error:', e.message); }

  console.log('\n===== MATCH_RAG_CHUNKS RPC =====');
  if (lojas && lojas.length > 0) {
    const testEmbed = await gemini.models.embedContent({ model: 'gemini-embedding-2', contents: 'pod' });
    const { data: rpcData, error: rpcErr } = await db.rpc('match_rag_chunks', {
      query_embedding: testEmbed.embeddings[0].values,
      match_threshold: 0.1,
      match_count: 5,
      p_loja_id: lojas[0].id
    });
    if (rpcErr) console.log('❌ RPC error:', rpcErr.message);
    else console.log('✅ RPC OK, results:', rpcData?.length);
  }
}

runAll();
