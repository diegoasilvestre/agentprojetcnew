import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkSchema() {
  const { data, error } = await db.from('lojas').select('*').limit(1);
  if (error) {
    console.error('Error fetching lojas:', error.message);
  } else {
    console.log('Lojas data:', data);
    if (data && data.length > 0) {
      console.log('Columns:', Object.keys(data[0]));
    }
  }
}

checkSchema();
