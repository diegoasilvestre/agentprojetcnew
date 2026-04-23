const API_KEY = 'AIzaSyASFR1Tv-1OE4_MP5u1zhGEaunhfnzXI1Q';

async function test() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
  const data = await res.json();
  const names = data.models.map(m => m.name);
  console.log('Gemini:', names.filter(n => n.includes('gemini-2') || n.includes('gemini-3')).join(', '));
  console.log('Embedding:', names.filter(n => n.includes('embed')).join(', '));
}
test();
