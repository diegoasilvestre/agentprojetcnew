const fetch = require('node-fetch');

/**
 * magicDreamProvider.js — Handler exclusivo para Ateliê Magic Dream
 * Busca produtos e variações diretamente do Supabase do projeto específico.
 */

async function fetchMagicDreamData(termo) {
    if (!termo || termo.length < 3) return null;
    
    const url = `${process.env.MAGIC_DREAM_SUPABASE_URL}/rest/v1/products?select=id,name,short_description,product_variations(name,price)&name=ilike.*${encodeURIComponent(termo)}*`;

    try {
        console.log(`[MAGIC_DREAM] 🔍 Buscando por: "${termo}"`);
        const res = await fetch(url, {
            headers: {
                'apikey': process.env.MAGIC_DREAM_SUPABASE_KEY,
                'Authorization': `Bearer ${process.env.MAGIC_DREAM_SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            console.error(`[MAGIC_DREAM] ❌ Erro API: ${res.status}`);
            return null;
        }

        const data = await res.json();
        if (!data || data.length === 0) {
            console.log(`[MAGIC_DREAM] ⚠️ Nenhum produto encontrado para o termo.`);
            return null;
        }

        // Processamento para consolidar menor preço e gerar links corretos
        return data.map(p => {
            const prices = p.product_variations?.map(v => parseFloat(v.price)).filter(p => !isNaN(p)) || [];
            const minPrice = prices.length > 0 ? Math.min(...prices) : null;
            
            return {
                id: p.id,
                nome: p.name,
                descricao: p.short_description || 'Sem descrição.',
                preco_partir: minPrice,
                link: `https://ateliemagicdream.com.br/produto/${p.id}`
            };
        });
    } catch (e) {
        console.error(`[MAGIC_DREAM] 💥 Erro crítico no fetch: ${e.message}`);
        return null;
    }
}

module.exports = { fetchMagicDreamData };
