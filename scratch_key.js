import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: 'AIzaSyASFR1Tv-1OE4_MP5u1zhGEaunhfnzXI1Q' });

async function test() {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Say hello'
    });
    console.log('Gemini OK:', res.text);
  } catch(e) {
    console.error('Gemini ERROR:', e);
  }

  try {
    const embed = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: 'test'
    });
    console.log('Embed OK:', embed.embeddings[0].values.length);
  } catch(e) {
    console.error('Embed ERROR:', e);
  }
}
test();
