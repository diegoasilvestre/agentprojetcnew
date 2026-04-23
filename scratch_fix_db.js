import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
  const { data } = await db.from('lojas').select('nome, config, llm_model');
  console.log('Rows:', data);
}
check();
