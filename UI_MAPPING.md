# MAPEAMENTO DE INTERFACE (DOM & EVENTOS) - app.js

Este documento contém a extração cirúrgica das funções de interface do arquivo `app.js`, organizadas por blocos funcionais conforme solicitado.

---

# 1. NAVEGAÇÃO E LAYOUT

```javascript
function toggleMobileMenu() {
    const sidebar = document.getElementById('mobileSidebar');
    const overlay = document.getElementById('mobileOverlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

function navigate(page) {
    // Para timers antigos antes de mudar de página
    if (ocRefreshTimer) { clearInterval(ocRefreshTimer); ocRefreshTimer = null; }
    if (ocListTimer) { clearInterval(ocListTimer); ocListTimer = null; }

    // Verifica permissão antes de navegar
    const role = state.user?.role?.toLowerCase() || 'vendedor';
    const isAdmin = state.admin?.isSuperAdmin === true;
    const userPermissions = isAdmin ? PERMISSIONS.superadmin : (PERMISSIONS[role] || PERMISSIONS.vendedor);

    if (!userPermissions.includes(page)) {
        toast('Acesso restrito ao seu cargo.', 'error');
        if (page !== 'dashboard') navigate('dashboard');
        return;
    }

    if (waPolling && page !== 'whatsapp') { clearInterval(waPolling); waPolling = null; }

    state.page = page;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));

    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = TITLES[page] || page;

    const content = document.getElementById('pageContent');
    if (content) content.innerHTML = '<div class="spinner"></div>';

    if (PAGES[page]) PAGES[page]();

    // Se entrar no chat, inicia o polling
    if (page === 'conversas') {
        ocListTimer = setInterval(ocLoadContacts, 5000);
        ocRefreshTimer = setInterval(() => {
            if (state.selectedChat) ocLoadMessages(state.selectedChat);
        }, 3000);
    }

    if (window.innerWidth <= 992) {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.remove('active');
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

function toggleField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isHidden = el.style.display === 'none';
    if (isHidden) {
        document.getElementById('agRegrasContainer').style.display = 'none';
        document.getElementById('agPromptContainer').style.display = 'none';
    }
    el.style.display = isHidden ? 'block' : 'none';
    if (isHidden) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
```

---

# 2. SELETORES DE DOM (CRÍTICO)

Estes são os IDs e classes mapeados no HTML através do `app.js`:

*   `loginEmail`, `loginPassword`, `loginBtn`, `loginError`
*   `loginScreen`, `appScreen`
*   `sidebarUserEmail`, `sidebarUserRole`, `sidebarUserAvatar`
*   `mobileSidebar`, `mobileOverlay`
*   `toastContainer`
*   `modalContent`, `modalOverlay`
*   `lojaSelect`, `lojaNameTopbar`
*   `nav-${page}` (IDs dinâmicos de navegação)
*   `pageTitle`, `pageContent`
*   `serverDot`, `serverStatusText`, `serverDotSidebar`, `serverStatusTextSidebar`
*   `ocBadge`, `ocSearch`, `ocContactList`, `ocChatPanel`, `ocCrmPanel`
*   `ocIaBtn_${id}`, `ocIaLabel_${id}`, `ocMsgs_${id}`, `ocInput_${id}`, `ocSendBtn_${id}`
*   `waStatusCard`, `waNumero`, `pairingCodeBox`, `pairingCodeValue`, `btnWA`, `btnDesconectar`
*   `searchClientes`, `clientesListBody`, `searchEquipe`, `equipeListBody`

---

# 3. OMNICHAT (CRÍTICO)

```javascript
async function renderConversas() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }

    c.innerHTML = `
    <div class="omnichat-layout" id="omnichatLayout">
        <!-- Coluna 1: Contatos -->
        <div class="oc-sidebar-panel">
            <div class="oc-panel-header">
                <span class="oc-panel-title">Caixa de Conversas</span>
                <div style="display:flex;align-items:center;gap:8px">
                    <span class="oc-counter" id="ocBadge">0</span>
                    <button class="sidebar-logout-btn" style="padding:4px" onclick="ocLoadContacts()" title="Atualizar">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>
            <div class="oc-search-bar">
                <input class="oc-search-input" type="text" id="ocSearch" placeholder="Buscar por nome ou número..." oninput="ocFilterContacts(this.value)">
            </div>
            <div class="oc-contact-list" id="ocContactList">
                <div class="spinner" style="margin:24px auto"></div>
            </div>
        </div>

        <!-- Coluna 2: Chat -->
        <div class="oc-chat-panel" id="ocChatPanel">
            <!-- Renderização dinâmica via ocSelectContact -->
        </div>

        <!-- Coluna 3: CRM Profile -->
        <div class="oc-crm-panel" id="ocCrmPanel">
            <!-- Renderização dinâmica via ocRenderCrmProfile -->
        </div>
    </div>`;

    _ocActiveId = null;
    await ocLoadContacts();
}

function ocRenderContactList(list) {
    const el = document.getElementById('ocContactList');
    if (!el) return;
    // ... lógica de mapeamento do list.map ...
    el.innerHTML = list.map(c => {
        // Retorna template literal de cada item de contato com onclick="ocSelectContact"
    }).join('');
}

async function ocSelectContact(id) {
    _ocActiveId = id;
    ocRenderContactList(_ocContacts);
    const layout = document.getElementById('omnichatLayout');
    if (layout) layout.classList.add('chat-open');

    const panel = document.getElementById('ocChatPanel');
    if (!panel) return;
    // ... Inserção do HTML do Header do Chat, Área de Mensagens e Composer ...
    panel.innerHTML = `...`; // Inclui textarea ocInput_${id} e botões de ação
}

async function ocSendMessage(id) {
    const inp = document.getElementById('ocInput_' + id);
    if (!inp || !inp.value.trim()) return;
    const text = inp.value.trim();
    inp.value = '';
    // Adiciona bolha temporária no DOM antes da resposta da API
    const msgsArea = document.getElementById('ocMsgs_' + id);
    if (msgsArea) {
        msgsArea.innerHTML += renderBubble({...});
        msgsArea.scrollTop = msgsArea.scrollHeight;
    }
}

function renderBubble(m) {
    // Retorna a estrutura HTML da bolha (oc-msg-row, oc-bubble) dependendo do remetente
}
```

---

# 4. TOGGLE IA / HUMANO (SENSÍVEL)

```javascript
async function ocToggleIA(id) {
    _ocIaStates[id] = !_ocIaStates[id];
    const ia = _ocIaStates[id];
    const sw = document.querySelector(`#ocIaBtn_${id} .oc-switch`);
    const lbl = document.getElementById(`ocIaLabel_${id}`);
    const btn = document.getElementById(`ocIaBtn_${id}`);
    
    if (sw) sw.className = 'oc-switch' + (ia ? '' : ' off');
    if (lbl) lbl.textContent = ia ? 'IA ativa' : 'IA pausada';
    if (btn) btn.className = 'oc-ia-toggle-btn' + (ia ? '' : ' off');
    
    ocRenderContactList(_ocContacts);
    // ... chamada de API para atualizar no servidor ...
}

// Também ativado automaticamente ao enviar mensagem manual:
async function ocSendMessage(id) {
    // ...
    _ocIaStates[id] = false; // Pausa IA ao enviar manualmente
    const sw = document.querySelector(`#ocIaBtn_${id} .oc-switch`);
    if (sw) sw.className = 'oc-switch off';
    // ...
}
```

---

# 5. CRM / CONTATO LATERAL

```javascript
async function ocRenderCrmProfile(telefone) {
    const el = document.getElementById('ocCrmPanel');
    if (!el) return;
    el.innerHTML = '<div class="spinner" style="margin:40px auto"></div>';
    
    // ... busca dados e renderiza ...
    el.innerHTML = `
        <div class="crm-section">
            <div class="crm-label">Status do CRM</div>
            <div class="crm-value"><span class="crm-score-badge">${esc(crm.status)}</span></div>
        </div>
        ...
    `;
}

async function renderContatos() {
    // Renderiza a página principal do CRM (atualmente em integração)
}
```

---

# 6. DASHBOARD

```javascript
async function renderDashboard() {
    const c = document.getElementById('pageContent');
    // ... renderiza cards de estatísticas (stats-grid, stat-card) ...
    c.innerHTML = `...`;
}

async function checkServer() {
    const dot = document.getElementById('serverDot');
    const txt = document.getElementById('serverStatusText');
    const dotSb = document.getElementById('serverDotSidebar');
    const txtSb = document.getElementById('serverStatusTextSidebar');

    try {
        await api.get('/admin/lojas');
        if (dot) { dot.className = 'status-dot online'; }
        if (txt) { txt.textContent = 'Conectado'; }
        // ...
    } catch {
        if (dot) { dot.className = 'status-dot offline'; }
        // ...
    }
}
```

---

# 7. WHATSAPP / CONEXÃO (CRÍTICO)

```javascript
async function renderWhatsApp() {
    const c = document.getElementById('pageContent');
    c.innerHTML = `
        <div class="whatsapp-grid">
            <div class="card wa-status-card" id="waStatusCard"></div>
            ...
            <input class="form-input" id="waNumero" ...>
            <div id="pairingCodeBox" style="display:none">
                <div class="pairing-code" id="pairingCodeValue">----</div>
            </div>
            <button id="btnWA" onclick="conectarWA()">Gerar Código</button>
            <button id="btnDesconectar" onclick="desconectarWA()" style="display:none">Desconectar</button>
        </div>
    `;
    loadWAStatus();
}

async function loadWAStatus() {
    const card = document.getElementById('waStatusCard');
    const btnWA = document.getElementById('btnWA');
    const btnD = document.getElementById('btnDesconectar');
    const pairingBox = document.getElementById('pairingCodeBox');

    // ... lógica para mostrar/esconder botões e renderizar ícones de status (online/aguardando/offline) ...
}

async function conectarWA() {
    const numero = document.getElementById('waNumero').value;
    // ... gera código de pareamento e insere no pairingCodeValue ...
}
```

---
**Observação**: Todas as funções de renderização utilizam o `pageContent.innerHTML` para injeção dinâmica, o que exige que o arquivo `index.html` contenha apenas a estrutura base (Sidebar, Topbar e PageContent).
