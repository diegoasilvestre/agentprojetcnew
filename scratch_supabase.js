import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkTables() {
  const tables = ['lojas', 'produtos_agente', 'pedidos_agente', 'conversas_agente', 'rag_documentos', 'rag_chunks'];
  for (const t of tables) {
    const { data, error } = await db.from(t).select('*').limit(1);
    if (error && error.code === 'PGRST205') {
      console.log(`❌ MISSING: ${t}`);
    } else if (error) {
      console.log(`⚠️ ERROR on ${t}:`, error.message);
    } else {
      console.log(`✅ OK: ${t}`);
    }
  }
}
checkTables();
