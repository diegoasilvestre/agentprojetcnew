IMPLEMENTAR GLOBAL SEARCH (BUSCA GLOBAL)

OBJETIVO:
Permitir navegação rápida por busca no sistema.

═══════════════════════════════
1. UI (TOPBAR)
═══════════════════════════════

Adicionar botão:

<button onclick="openGlobalSearch()" class="search-btn">
  🔍
</button>

═══════════════════════════════
2. MODAL DE BUSCA
═══════════════════════════════

Criar:

<div id="globalSearchModal" class="search-modal">
  <input type="text" id="globalSearchInput" placeholder="Buscar..." oninput="handleGlobalSearch(this.value)">
  <div id="globalSearchResults"></div>
</div>

═══════════════════════════════
3. ESTILO
═══════════════════════════════

.search-modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  z-index: 3000;
  padding: 20px;
}

.search-modal input {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  font-size: 16px;
}

═══════════════════════════════
4. LÓGICA
═══════════════════════════════

function openGlobalSearch() {
  document.getElementById('globalSearchModal').style.display = 'block';
}

function handleGlobalSearch(q) {
  const results = [];

  // páginas
  Object.keys(PAGES).forEach(p => {
    if (p.includes(q)) results.push({ type: 'page', value: p });
  });

  // contatos
  _ocContacts.forEach(c => {
    if (c.nome.includes(q)) results.push({ type: 'contact', value: c });
  });

  renderSearchResults(results);
}

═══════════════════════════════
VALIDAÇÃO
═══════════════════════════════

- busca abre instantaneamente
- resultados clicáveis
- navegação funciona