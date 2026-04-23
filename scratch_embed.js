import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  try {
    const res = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: 'Hello, world!'
    });
    console.log(res.embeddings[0].values.length); // Should print 768
  } catch(e) {
    console.error(e);
  }
}
test();
