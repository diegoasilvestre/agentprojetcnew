// ─────────────────────────────────────────────────────────────────────────────
//  RoboTI BR — app.js  (rebuild completo)
//  Versão: 4.0  |  Design System Dual-Theme · Gestão de Equipe
// ─────────────────────────────────────────────────────────────────────────────

const API = window.location.hostname === 'localhost' ? 'http://localhost:4000' : 'https://chatbot20agent-production.up.railway.app';

let state = {
    lojas: [],
    lojaId: null,
    loja: null,
    page: 'dashboard',
    admin: { email: '', logado: false, isSuperAdmin: false },
};

let waPolling = null;
let ocRefreshTimer = null;
let ocListTimer = null;


// ─── AUTENTICAÇÃO ────────────────────────────────────────────────────────────

async function doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const btn = document.getElementById('loginBtn');
    const errEl = document.getElementById('loginError');

    if (!email || !password) return toast('Preencha todos os campos', 'error');

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Autenticando...';
    btn.disabled = true;
    if (errEl) errEl.style.display = 'none';

    try {
        const data = await api.post('/auth/login', { email, password });

        state.admin.logado = true;
        state.admin.email = data.user.email;
        state.admin.isSuperAdmin = !!data.is_admin;
        state.user = data.user;

        localStorage.setItem('robotibr_session', JSON.stringify({
            admin: state.admin,
            user: state.user,
            lojaId: data.user.numero_wa
        }));

        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'flex';

        document.getElementById('sidebarUserEmail').textContent = data.user.email;
        document.getElementById('sidebarUserRole').textContent = data.is_admin ? 'Super Admin' : 'Dono da Loja';
        document.getElementById('sidebarUserAvatar').textContent = data.user.email.substring(0, 2).toUpperCase();

        toast('Bem-vindo ao RoboTI BR! ✨');
        await initLojas();
        applyPermissions();

        if (data.is_admin) {
            navigate('clientes');
        } else {
            state.lojaId = data.user.numero_wa;
            state.loja = state.lojas.find(l => l.id === state.lojaId);
            navigate('dashboard');
        }

    } catch (e) {
        if (errEl) {
            errEl.textContent = e.message;
            errEl.style.display = 'block';
        }
        toast(e.message, 'error');
    } finally {
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar no Painel';
        btn.disabled = false;
    }
}

function doLogout() {
    localStorage.removeItem('robotibr_session');
    window.location.reload();
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('mobileSidebar');
    const overlay = document.getElementById('mobileOverlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

// ─── CAMADA DE API ────────────────────────────────────────────────────────────

const api = {
    async get(path) {
        const r = await fetch(API + path);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    },
    async post(path, body) {
        const r = await fetch(API + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            const e = await r.json().catch(() => ({}));
            throw new Error(e.erro || e.error || 'HTTP ' + r.status);
        }
        return r.json();
    },
    async del(path) {
        const r = await fetch(API + path, { method: 'DELETE' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    },
};

// ─── HELPERS DE UI ────────────────────────────────────────────────────────────

function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    el.innerHTML = `<span style="margin-right:8px">${type === 'success' ? '✅' : '⚠️'}</span>${msg}`;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function openModal(html) {
    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalOverlay').classList.add('active');
}
function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(inputId + 'Icon');
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        if (icon) icon.className = 'fas fa-eye';
    }
}

function noLojaMsg() {
    return `<div class="page-wrapper">
        <div class="page-body" style="display:flex; align-items:center; justify-content:center; flex:1">
            <div class="empty-state">
                <div class="empty-icon" style="font-size:48px; margin-bottom:16px">🏢</div>
                <h3 style="margin-bottom:8px">Nenhum cliente selecionado</h3>
                <p style="color:var(--text-secondary); margin-bottom:24px">Selecione uma empresa no topo para gerenciar as configurações.</p>
                <button class="btn btn-primary" onclick="navigate('clientes')">Gestão de Clientes</button>
            </div>
        </div>
    </div>`;
}

function errMsg(e) {
    return `<div class="page-wrapper">
        <div class="page-body" style="display:flex; align-items:center; justify-content:center; flex:1">
            <div class="empty-state">
                <div class="empty-icon" style="font-size:48px; margin-bottom:16px">⚠️</div>
                <h3 style="margin-bottom:8px">Erro de Carregamento</h3>
                <p style="font-family:monospace; font-size:12px; background:var(--bg-secondary); padding:12px; border-radius:8px; margin-bottom:20px; border:1px solid var(--border-color)">${e.message}</p>
                <button class="btn btn-secondary" onclick="window.location.reload()">Recarregar Painel</button>
            </div>
        </div>
    </div>`;
}

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── SELETOR DE LOJA ──────────────────────────────────────────────────────────

function populateLojaSelect() {
    const s = document.getElementById('lojaSelect');
    if (!s) return;
    s.innerHTML = state.lojas.length
        ? state.lojas.map(l => `<option value="${l.id}" ${l.id === state.lojaId ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')
        : '<option value="">— Nenhum cliente —</option>';
}

function onLojaChange() {
    state.lojaId = document.getElementById('lojaSelect').value;
    state.loja = state.lojas.find(l => l.id === state.lojaId) || null;
    const topbar = document.getElementById('lojaNameTopbar');
    if (topbar) topbar.textContent = state.loja ? state.loja.nome : '';
    navigate(state.page === 'clientes' ? 'dashboard' : state.page);
}

// ─── ROTEADOR DE PÁGINAS ──────────────────────────────────────────────────────

const TITLES = {
    dashboard: 'Dashboard',
    agente: 'Agente & Prompt',
    rag: 'Cérebro (RAG)',
    scraping: 'Web Scraping',
    conversas: 'Caixa de Entrada',
    whatsapp: 'Conexão WhatsApp',
    clientes: 'Gestão de Clientes',
    equipe: 'Configurações da Equipe',
    diagnostics: 'Diagnóstico do Sistema',
    contatos: 'Gestão de Leads (CRM)',
    catalogo: 'Catálogo de Produtos',
    more: 'Mais',
};

const PAGES = {
    dashboard: renderDashboard,
    agente: renderAgente,
    rag: renderRAG,
    scraping: renderScraping,
    conversas: renderConversas,
    whatsapp: renderWhatsApp,
    clientes: renderClientes,
    equipe: renderEquipe,
    diagnostics: renderDiagnostics,
    contatos: renderContatos,
    catalogo: renderCatalogo,
    more: renderMore,
};

const PERMISSIONS = {
    superadmin: ['dashboard', 'agente', 'rag', 'scraping', 'conversas', 'whatsapp', 'clientes', 'equipe', 'diagnostics', 'contatos', 'catalogo', 'more'],
    admin: ['dashboard', 'agente', 'rag', 'scraping', 'conversas', 'equipe', 'contatos', 'catalogo', 'more'],
    vendedor: ['dashboard', 'agente', 'conversas', 'contatos', 'more'],
    suporte: ['dashboard', 'agente', 'conversas', 'more']
};

function applyPermissions() {
    const role = state.user?.role?.toLowerCase() || 'vendedor';
    const isAdmin = state.admin?.isSuperAdmin === true;

    const userPermissions = isAdmin ? PERMISSIONS.superadmin : (PERMISSIONS[role] || PERMISSIONS.vendedor);

    // Varre todos os itens de navegação
    Object.keys(TITLES).forEach(page => {
        const el = document.getElementById(`nav-${page}`);
        if (el) {
            if (userPermissions.includes(page)) {
                el.style.display = 'flex';
            } else {
                el.style.display = 'none';
            }
        }
    });

    // Trava o seletor de loja se não for superadmin
    const lojaSelect = document.getElementById('lojaSelect');
    if (lojaSelect) {
        if (isAdmin) {
            lojaSelect.disabled = false;
            lojaSelect.style.opacity = '1';
            lojaSelect.style.cursor = 'pointer';
        } else {
            lojaSelect.disabled = true;
            lojaSelect.style.opacity = '0.7';
            lojaSelect.style.cursor = 'not-allowed';
        }
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

    const topbarPage = document.getElementById('topbarCurrentPage');
    if (topbarPage) topbarPage.textContent = TITLES[page] || page;

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

// ─── STATUS DO SERVIDOR ───────────────────────────────────────────────────────

async function checkServer() {
    const dot = document.getElementById('serverDot');
    const txt = document.getElementById('serverStatusText');
    const dotSb = document.getElementById('serverDotSidebar');
    const txtSb = document.getElementById('serverStatusTextSidebar');

    try {
        await api.get('/admin/lojas');
        if (dot) { dot.className = 'status-dot online'; }
        if (txt) { txt.textContent = 'Conectado'; }
        if (dotSb) { dotSb.className = 'status-dot online'; }
        if (txtSb) { txtSb.textContent = 'Servidor Online'; }
    } catch {
        if (dot) { dot.className = 'status-dot offline'; }
        if (txt) { txt.textContent = 'Offline'; }
        if (dotSb) { dotSb.className = 'status-dot offline'; }
        if (txtSb) { txtSb.textContent = 'Servidor Offline'; }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

async function renderDashboard() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    try {
        const [wa, docs, stats] = await Promise.all([
            api.get('/wa/status/' + state.lojaId),
            api.get('/cliente/rag/' + state.lojaId),
            api.get('/admin/stats/' + state.lojaId)
        ]);

        const waStatus = wa.status === 'conectado'
            ? '<span style="color:var(--success); font-weight:700">● Conectado</span>'
            : '<span style="color:var(--danger); font-weight:700">○ Desconectado</span>';

        c.innerHTML = `
        <div class="page-wrapper">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Visão Geral</h1>
                    <p class="text-muted">Desempenho de IA e tráfego de mensagens para <strong>${state.loja?.nome || 'Cliente'}</strong></p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-secondary" onclick="renderDashboard()">
                        <i class="fas fa-sync-alt"></i> Sincronizar Dados
                    </button>
                </div>
            </div>
            
            <div class="page-body">
                <div class="stats-grid">
                    <div class="card">
                        <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px">Mensagens (Total)</div>
                        <div style="font-size:32px; font-weight:700; letter-spacing:-0.03em">${stats.total_msgs}</div>
                        <div style="font-size:12px; color:var(--success); margin-top:8px">
                            <i class="fas fa-arrow-up"></i> ${stats.received} recebidas / ${stats.sent} enviadas
                        </div>
                    </div>
                    <div class="card">
                        <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px">Uso de IA (Tokens)</div>
                        <div style="font-size:32px; font-weight:700; letter-spacing:-0.03em">${stats.tokens.toLocaleString()}</div>
                        <div style="font-size:12px; color:var(--accent); margin-top:8px">
                            <i class="fas fa-microchip"></i> Estimativa de processamento
                        </div>
                    </div>
                    <div class="card">
                        <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px">WhatsApp Service</div>
                        <div style="margin-top:8px">${waStatus}</div>
                        <div class="text-muted" style="font-size:12px; margin-top:12px">${wa.numero || 'Sem número vinculado'}</div>
                    </div>
                    <div class="card">
                        <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px">Base RAG</div>
                        <div style="font-size:32px; font-weight:700; letter-spacing:-0.03em">${docs.length}</div>
                        <div class="text-muted" style="font-size:12px; margin-top:8px">Documentos indexados</div>
                    </div>
                </div>

                <div class="analytics-grid">
                    <div class="card">
                        <h3 style="font-size:14px; font-weight:600; margin-bottom:20px">Tráfego de Mensagens</h3>
                        <div class="chart-container">
                            <canvas id="msgChart"></canvas>
                        </div>
                    </div>
                    <div class="card">
                        <h3 style="font-size:14px; font-weight:600; margin-bottom:20px">Distribuição de Tokens</h3>
                        <div class="chart-container">
                            <canvas id="tokenChart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        setTimeout(() => initDashboardCharts(stats), 100);
    } catch (e) { c.innerHTML = errMsg(e); }
}

function initDashboardCharts(stats) {
    const ctxMsg = document.getElementById('msgChart')?.getContext('2d');
    const ctxToken = document.getElementById('tokenChart')?.getContext('2d');

    if (ctxMsg) {
        new Chart(ctxMsg, {
            type: 'bar',
            data: {
                labels: ['Enviadas', 'Recebidas'],
                datasets: [{
                    label: 'Mensagens',
                    data: [stats.sent, stats.received],
                    backgroundColor: ['#ffd700', 'rgba(255,215,0,0.2)'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa' } },
                    x: { grid: { display: false }, ticks: { color: '#a1a1aa' } }
                }
            }
        });
    }

    if (ctxToken) {
        new Chart(ctxToken, {
            type: 'line',
            data: {
                labels: ['IA Processing'],
                datasets: [{
                    label: 'Tokens',
                    data: [stats.tokens],
                    borderColor: '#ffd700',
                    backgroundColor: 'rgba(255,215,0,0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a1a1aa' } },
                    x: { grid: { display: false }, ticks: { color: '#a1a1aa' } }
                }
            }
        });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  AGENTE & PROMPT
// ══════════════════════════════════════════════════════════════════════════════

async function renderAgente() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    try {
        const lojas = await api.get('/admin/lojas');
        const loja = lojas.find(l => l.id === state.lojaId) || {};
        const cfg = loja.config || {};

        c.innerHTML = `
        <div class="page-wrapper">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Personalidade da IA</h1>
                    <p class="text-muted">Defina como o seu assistente deve se comportar e interagir.</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-primary" id="btnSalvarAgente" onclick="salvarAgente()" style="height:44px; padding:0 24px">
                        <i class="fas fa-save"></i> Salvar Configurações
                    </button>
                </div>
            </div>
            <div class="page-body">
                <div class="stats-grid">
                    <div class="card">
                        <h2 style="font-size:16px; font-weight:600; margin-bottom:24px; display:flex; align-items:center; gap:8px">
                            <i class="fas fa-sliders-h" style="color:var(--accent)"></i> Ajustes de Identidade
                        </h2>
                        
                        <div class="form-group">
                            <label class="form-label">Nome Comercial</label>
                            <input class="form-input" id="agNome" value="${esc(loja.nome || '')}" placeholder="Ex: Clínica Sorriso">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Nicho de Atuação</label>
                            <input class="form-input" id="agNicho" value="${esc(cfg.nicho || '')}" placeholder="Ex: Odontologia, Vendas de Carros...">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Tom de Voz</label>
                            <select class="form-input form-select" id="agTom">
                                ${['Profissional e educado', 'Amigável e descontraído', 'Formal e objetivo', 'Entusiasmado e vendedor'].map(t =>
                                    `<option value="${t}" ${cfg.tom_voz === t ? 'selected' : ''}>${t}</option>`
                                ).join('')}
                            </select>
                        </div>

                        <div style="background:var(--bg-primary); padding:20px; border-radius:12px; margin-top:24px; border:1px dashed var(--border-color)">
                            <div style="font-weight:600; font-size:14px; margin-bottom:8px">💡 Dica de Ouro</div>
                            <p style="font-size:13px; color:var(--text-secondary); line-height:1.6">
                                IA com tons "Amigáveis" tendem a converter 30% mais leads em nichos de serviços locais.
                            </p>
                        </div>
                    </div>

                    <div class="card">
                        <h2 style="font-size:16px; font-weight:600; margin-bottom:24px; display:flex; align-items:center; gap:8px">
                            <i class="fas fa-brain" style="color:var(--accent)"></i> Instruções Avançadas
                        </h2>

                        <div class="form-group">
                            <label class="form-label">Prompt de Personalidade (O que ela é?)</label>
                            <textarea class="form-textarea" id="agPrompt" style="height:150px"
                                placeholder="Ex: Você é a atendente virtual da Clínica Sorriso, seu objetivo é agendar consultas...">${esc(loja.prompt_base || '')}</textarea>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Regras Estritas (O que ela NÃO pode fazer?)</label>
                            <textarea class="form-textarea" id="agRules" style="height:120px"
                                placeholder="Ex: Nunca dê descontos acima de 10%. Nunca mencione concorrentes.">${esc(cfg.regras || '')}</textarea>
                        </div>
                        
                        <div id="agenteStatus" style="font-size:12px; color:var(--text-secondary); margin-top:12px; text-align:right"></div>
                    </div>
                </div>
            </div>
        </div>`;
    } catch (e) { c.innerHTML = errMsg(e); }
}

async function salvarAgente() {
    const nome = document.getElementById('agNome').value.trim();
    const prompt_base = document.getElementById('agPrompt').value.trim();
    const nicho = document.getElementById('agNicho').value.trim();
    const tom_voz = document.getElementById('agTom').value;
    const regras = document.getElementById('agRules').value.trim();
    const btn = document.getElementById('btnSalvarAgente');
    const status = document.getElementById('agenteStatus');

    if (!nome) return toast('Nome da empresa é obrigatório', 'error');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;
    try {
        await api.post('/admin/lojas/update', { wa_id: state.lojaId, nome, prompt_base, nicho, tom_voz, regras });
        toast('Configurações do agente salvas!');
        if (status) status.textContent = 'Salvo em ' + new Date().toLocaleTimeString('pt-BR');
        await initLojas();
    } catch (e) { toast(e.message, 'error'); }
    finally { btn.innerHTML = '<i class="fas fa-save"></i> Salvar Configurações'; btn.disabled = false; }
}

// ══════════════════════════════════════════════════════════════════════════════
//  BASE DE CONHECIMENTO (RAG)
// ══════════════════════════════════════════════════════════════════════════════

async function renderRAG() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    c.innerHTML = `
    <div class="page-wrapper">
        <div class="page-header">
            <div>
                <h1 class="page-title">Base de Conhecimento</h1>
                <p class="text-muted">Treine sua IA com informações específicas do seu negócio.</p>
            </div>
            <div class="page-actions">
                <button class="btn btn-secondary" onclick="navigate('scraping')">
                    <i class="fas fa-globe"></i> Importar Website
                </button>
            </div>
        </div>
        <div class="page-body">
            <div class="stats-grid">
                <div class="card">
                    <h2 style="font-size:16px; font-weight:600; margin-bottom:20px; display:flex; align-items:center; gap:8px">
                        <i class="fas fa-edit" style="color:var(--accent)"></i> Adicionar Conhecimento
                    </h2>
                    <div class="form-group">
                        <label class="form-label">Título do Documento</label>
                        <input class="form-input" id="ragTitulo" placeholder="Ex: Política de Reembolso, Tabela de Preços...">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Conteúdo Detalhado</label>
                        <textarea class="form-textarea" id="ragConteudo" style="height:200px"
                            placeholder="Descreva aqui as informações que a IA deve saber..."></textarea>
                    </div>
                    <button class="btn btn-primary" id="btnSalvarRAG" onclick="salvarTextoRAG()" style="width:100%; justify-content:center; height:48px">
                        <i class="fas fa-brain"></i> Ensinar ao Assistente
                    </button>
                </div>
                <div class="card" style="display:flex; flex-direction:column">
                    <h2 style="font-size:16px; font-weight:600; margin-bottom:20px; display:flex; align-items:center; gap:8px">
                        <i class="fas fa-book" style="color:var(--accent)"></i> Biblioteca de Dados
                    </h2>
                    <div id="ragList" style="flex:1"><div class="spinner"></div></div>
                </div>
            </div>
        </div>
    </div>`;
    loadRAGDocs();
}

async function loadRAGDocs() {
    const el = document.getElementById('ragList');
    if (!el) return;
    try {
        const docs = await api.get('/cliente/rag/' + state.lojaId);
        if (!docs.length) {
            el.innerHTML = `<div style="text-align:center; padding:40px 20px">
                <div style="font-size:40px; opacity:0.1; margin-bottom:16px"><i class="fas fa-folder-open"></i></div>
                <p class="text-muted">Sua biblioteca está vazia.</p>
                <button class="btn btn-secondary" style="margin-top:16px" onclick="navigate('scraping')">Começar com um site</button>
            </div>`;
            return;
        }
        el.innerHTML = docs.map(d => `
        <div class="card" style="padding:16px; margin-bottom:12px; background:var(--bg-primary); border-radius:12px">
            <div style="display:flex; justify-content:space-between; align-items:start; gap:12px">
                <div style="flex:1; min-width:0">
                    <div style="font-weight:600; font-size:14px; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis" title="${esc(d.titulo)}">${esc(d.titulo)}</div>
                    <div style="display:flex; align-items:center; gap:8px">
                        <span style="font-size:10px; padding:2px 8px; border-radius:10px; background:var(--bg-secondary); color:var(--text-secondary); border:1px solid var(--border-color)">
                            ${d.tipo === 'web_scraping' ? '🌐 Website' : '✏️ Manual'}
                        </span>
                        <span style="font-size:11px; color:var(--text-secondary)">${new Date(d.criado_em).toLocaleDateString('pt-BR')}</span>
                    </div>
                </div>
                <button class="btn btn-ghost" style="color:var(--danger); padding:8px; width:32px; height:32px" onclick="deletarRAG('${d.id}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>`).join('');
    } catch (e) { el.innerHTML = errMsg(e); }
}

async function salvarTextoRAG() {
    const titulo = document.getElementById('ragTitulo').value.trim();
    const conteudo = document.getElementById('ragConteudo').value.trim();
    if (!titulo || !conteudo) return toast('Preencha título e conteúdo', 'error');
    const btn = document.getElementById('btnSalvarRAG');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;
    try {
        await api.post('/cliente/importar-texto', { titulo, conteudo, loja_id: state.lojaId });
        toast('Conhecimento salvo e vetorizado!');
        document.getElementById('ragTitulo').value = '';
        document.getElementById('ragConteudo').value = '';
        loadRAGDocs();
    } catch (e) { toast(e.message, 'error'); }
    finally { btn.innerHTML = '<i class="fas fa-save"></i> Salvar no Banco Vetorial'; btn.disabled = false; }
}

async function deletarRAG(id) {
    if (!confirm('Deseja excluir este documento da base de conhecimento?')) return;
    try {
        await api.del('/cliente/rag/' + id);
        toast('Documento removido.');
        loadRAGDocs();
    } catch (e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  WEB SCRAPING
// ══════════════════════════════════════════════════════════════════════════════

async function renderScraping() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    c.innerHTML = `
    <div class="page-wrapper">
        <div class="page-header">
            <h1 class="page-title">Importar Conhecimento (Web Scraping)</h1>
            <div class="page-actions">
                <button class="btn btn-ghost" onclick="navigate('rag')" style="font-size:13px">
                    <i class="fas fa-arrow-left"></i> Voltar ao Cérebro
                </button>
            </div>
        </div>
        <div class="page-body">
            <div class="card" style="margin-bottom:24px">
                <div class="card-title" style="margin-bottom:6px">🌐 Importar de Sites</div>
                <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px">
                    Cole a URL de qualquer página do site do cliente para extrair informações automaticamente.
                </p>
                <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end;margin-bottom:12px">
                    <div class="form-group" style="margin-bottom:0">
                        <label class="form-label">URL da Página</label>
                        <input class="form-input" id="scrapeUrl" placeholder="https://www.site.com.br/servicos" type="url">
                    </div>
                    <button class="btn btn-primary" onclick="executarScraping()" id="btnScrape" style="height:42px">
                        <i class="fas fa-download"></i> Importar
                    </button>
                </div>
                <div class="form-group">
                    <label class="form-label">Título personalizado (opcional)</label>
                    <input class="form-input" id="scrapeTitulo" placeholder="Ex: Página de Serviços">
                </div>
                <div id="scrapeResult"></div>
            </div>

            <div class="grid-2">
                <div class="card" style="background:var(--success-subtle);border-color:rgba(5,150,105,0.15)">
                    <div class="card-title" style="margin-bottom:8px;font-size:14px;color:var(--success)">✅ Alto valor</div>
                    <ul style="color:var(--text-secondary);line-height:2;padding-left:16px;font-size:13px">
                        <li>Serviços / produtos</li>
                        <li>Tabela de preços</li>
                        <li>Sobre a empresa</li>
                        <li>FAQ</li>
                        <li>Página de contato</li>
                    </ul>
                </div>
                <div class="card" style="background:var(--warning-subtle);border-color:rgba(217,119,6,0.15)">
                    <div class="card-title" style="margin-bottom:8px;font-size:14px;color:var(--warning)">⚠️ Geralmente desnecessário</div>
                    <ul style="color:var(--text-secondary);line-height:2;padding-left:16px;font-size:13px">
                        <li>Página inicial genérica</li>
                        <li>Blog / notícias antigas</li>
                        <li>Páginas de login</li>
                        <li>Política de privacidade</li>
                    </ul>
                </div>
            </div>

            <div class="card" style="margin-top:24px">
                <div class="card-title" style="margin-bottom:12px">📋 Documentação e Histórico</div>
                <div id="scrapingHistory">
                    <p style="font-size:13px;color:var(--text-secondary)">As páginas importadas aparecerão na Base de Conhecimento.</p>
                </div>
            </div>
        </div>
    </div>`;
    loadScrapeDocs();
}

async function loadScrapeDocs() {
    const el = document.getElementById('scrapeDocList');
    const countEl = document.getElementById('scrapeDocCount');
    if (!el) return;
    try {
        const docs = await api.get('/cliente/rag/' + state.lojaId);
        if (countEl) countEl.textContent = `${docs.length} documento${docs.length !== 1 ? 's' : ''}`;
        if (!docs.length) { el.innerHTML = '<p style="font-size:13px;color:var(--text-secondary)">Nenhum documento salvo ainda.</p>'; return; }
        el.innerHTML = docs.map(d => `
        <div style="padding:10px 12px;border:1px solid var(--border-color);border-radius:var(--radius);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.titulo)}</div>
                ${d.url_fonte ? `<div style="font-size:11px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.url_fonte)}</div>` : ''}
            </div>
            <span class="badge badge-default" style="flex-shrink:0">${d.tipo === 'web_scraping' ? '🌐 Site' : '✏️ Manual'}</span>
            <button class="btn btn-danger" style="padding:4px 10px;font-size:11px;flex-shrink:0" onclick="deletarRAGScrape('${d.id}')">✕</button>
        </div>`).join('');
    } catch (e) { el.innerHTML = errMsg(e); }
}

async function deletarRAGScrape(id) {
    if (!confirm('Remover este documento?')) return;
    try {
        await api.del('/cliente/rag/' + id);
        toast('Documento removido.');
        loadScrapeDocs();
    } catch (e) { toast(e.message, 'error'); }
}

async function executarScraping() {
    const url = document.getElementById('scrapeUrl').value.trim();
    const titulo = document.getElementById('scrapeTitulo').value.trim() || null;
    const resultEl = document.getElementById('scrapeResult');
    const btn = document.getElementById('btnScrape');

    if (!url) return toast('Cole uma URL válida', 'error');
    try { new URL(url); } catch { return toast('URL inválida — inclua https://', 'error'); }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...'; btn.disabled = true;
    resultEl.innerHTML = `
    <div style="padding:14px;background:var(--bg-secondary);border-radius:var(--radius);font-size:13px;color:var(--text-secondary);margin-top:12px">
        ⏳ Acessando <strong>${esc(url)}</strong>...<br>
        <small>Isso pode levar alguns segundos.</small>
    </div>`;
    try {
        const r = await api.post('/cliente/scrape', { url, loja_id: state.lojaId, titulo });
        if (r.ok) {
            resultEl.innerHTML = `
            <div style="padding:14px;background:var(--success-subtle);border:1px solid rgba(5,150,105,0.2);border-radius:var(--radius);font-size:13px;margin-top:12px">
                ✅ <strong>Importado com sucesso!</strong><br>
                Título: <em>${esc(r.titulo)}</em> — ${r.chunks} parte${r.chunks !== 1 ? 's' : ''} salva${r.chunks !== 1 ? 's' : ''}.
            </div>`;
            document.getElementById('scrapeUrl').value = '';
            document.getElementById('scrapeTitulo').value = '';
            loadScrapeDocs();
        } else {
            resultEl.innerHTML = `<div style="padding:14px;background:var(--destructive-subtle);border:1px solid rgba(220,38,38,0.2);border-radius:var(--radius);font-size:13px;margin-top:12px;color:var(--destructive)">❌ Erro: ${esc(r.errors?.join(', ') || 'Falha desconhecida')}</div>`;
        }
    } catch (e) {
        resultEl.innerHTML = `<div style="padding:14px;background:var(--destructive-subtle);border:1px solid rgba(220,38,38,0.2);border-radius:var(--radius);font-size:13px;margin-top:12px;color:var(--destructive)">❌ ${esc(e.message)}</div>`;
    } finally {
        btn.innerHTML = '<i class="fas fa-download"></i> Importar'; btn.disabled = false;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CAIXA DE ENTRADA — OMNICHAT
// ══════════════════════════════════════════════════════════════════════════════

let _ocContacts = [];
let _ocActiveId = null;
let _ocIaStates = {};

async function renderConversas() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }

    c.innerHTML = `
    <div class="page-wrapper">
        <div class="omnichat-layout view-contacts" id="omnichatLayout" style="height: calc(100vh - 72px)">
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
                    <input class="oc-search-input" type="text" id="ocSearch" placeholder="Buscar..." oninput="ocFilterContacts(this.value)">
                </div>
                <div class="oc-contact-list" id="ocContactList">
                    <div class="spinner" style="margin:24px auto"></div>
                </div>
            </div>

            <!-- Coluna 2: Chat -->
            <div class="oc-chat-panel" id="ocChatPanel">
                <div class="empty-state" style="height:100%; display:flex; flex-direction:column; justify-content:center">
                    <div style="font-size:48px; opacity:0.1; margin-bottom:16px"><i class="fas fa-comment-dots"></i></div>
                    <h3 style="font-size:16px; color:var(--text-secondary)">Selecione uma conversa</h3>
                    <p style="font-size:12px; color:var(--sidebar-muted)">Gerencie o atendimento em tempo real.</p>
                </div>
            </div>

            <!-- Coluna 3: CRM Profile -->
            <div class="oc-crm-panel" id="ocCrmPanel">
                <div style="text-align:center; padding-top:40px; color:var(--sidebar-muted)">
                    <i class="fas fa-user-circle" style="font-size:48px; opacity:0.1; margin-bottom:12px"></i>
                    <div style="font-size:12px">Informações do Cliente</div>
                </div>
            </div>
        </div>
    </div>`;

    _ocActiveId = null;
    await ocLoadContacts();

    if (ocRefreshTimer) clearInterval(ocRefreshTimer);
    ocRefreshTimer = setInterval(() => {
        if (state.page === 'conversas') ocLoadContacts();
    }, 3000); // Polling acelerado para 3s
}

function ocInitials(name) {
    return String(name || '?').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

async function ocLoadContacts() {
    try {
        const data = await api.get('/chat/conversas/' + state.lojaId);
        _ocContacts = Array.isArray(data) ? data : [];
        _ocContacts.forEach(c => {
            if (_ocIaStates[c.id] === undefined) _ocIaStates[c.id] = c.ia_ativa !== false;
        });
        const badge = document.getElementById('ocBadge');
        if (badge) badge.textContent = _ocContacts.length;
        ocRenderContactList(_ocContacts);
        if (_ocActiveId) ocSilentRefreshMessages(_ocActiveId);
    } catch (e) {
        const el = document.getElementById('ocContactList');
        if (el) el.innerHTML = `<div style="padding:20px;font-size:13px;color:var(--text-secondary);text-align:center">
            <div style="margin-bottom:8px">⚠️ Sem conversas ainda</div>
            <div style="font-size:12px">As conversas aparecerão aqui assim que clientes enviarem mensagens via WhatsApp.</div>
        </div>`;
    }
}

function ocRenderContactList(list) {
    const el = document.getElementById('ocContactList');
    if (!el) return;
    if (!list.length) {
        el.innerHTML = `<div style="padding:32px 16px;text-align:center;font-size:13px;color:var(--text-secondary)">
            Nenhuma conversa encontrada
        </div>`;
        return;
    }
    el.innerHTML = list.map(c => {
        const ia = _ocIaStates[c.id] !== false;
        const active = _ocActiveId === c.id;
        const when = c.atualizado_em
            ? new Date(c.atualizado_em).toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR')
                ? new Date(c.atualizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : 'Ontem'
            : '';

        const badgeHtml = ia
            ? `<span class="crm-score-badge" style="font-size:9px; padding:2px 6px">IA ATIVA</span>`
            : `<span class="crm-score-badge" style="font-size:9px; padding:2px 6px; background:var(--warning); color:#000">AGUARDANDO</span>`;

        return `<div class="oc-contact-item${active ? ' active' : ''}" onclick="ocSelectContact('${esc(c.id)}')">
            <div class="sidebar-user-avatar" style="width:40px; height:40px; border-radius:50%; background:#1f2937; color:#9ca3af; display:flex; align-items:center; justify-content:center; margin-right:12px">
                <svg viewBox="0 0 24 24" fill="currentColor" style="width:20px; height:20px"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </div>
            <div class="oc-contact-body">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px">
                    <div class="oc-contact-name">${esc(c.nome || c.numero_cliente)}</div>
                    <span class="oc-contact-time" style="font-size:10px">${when}</span>
                </div>
                <div class="oc-contact-preview" style="font-size:12px; margin-bottom:6px">${esc(c.ultima_msg || '—')}</div>
                ${badgeHtml}
            </div>
        </div>`;
    }).join('');
}

function ocFilterContacts(q) {
    const filtered = _ocContacts.filter(c =>
        (c.nome || '').toLowerCase().includes(q.toLowerCase()) ||
        (c.numero_cliente || '').includes(q)
    );
    ocRenderContactList(filtered);
}

async function ocSelectContact(id) {
    _ocActiveId = id;
    ocRenderContactList(_ocContacts);

    const layout = document.getElementById('omnichatLayout');
    if (layout) {
        layout.classList.remove('view-contacts', 'view-crm');
        layout.classList.add('view-chat');
    }

    const panel = document.getElementById('ocChatPanel');
    if (!panel) return;
    const contact = _ocContacts.find(c => c.id === id);
    if (!contact) return;
    const ia = _ocIaStates[id] !== false;

    panel.innerHTML = `
    <div class="oc-chat-header" style="background:var(--card-bg); border-bottom:1px solid var(--border-color); padding:12px 20px; display:flex; align-items:center; gap:12px">
        <button class="oc-back-btn" onclick="backToContacts()" style="background:transparent; border:none; color:var(--text-primary); cursor:pointer; display:none"><i class="fas fa-arrow-left"></i></button>
        <div class="sidebar-user-avatar" style="width:40px; height:40px; border-radius:50%; background:#1f2937; color:#9ca3af; display:flex; align-items:center; justify-content:center">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width:20px; height:20px"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        </div>
        <div style="flex:1">
            <div style="font-size:15px; font-weight:600; color:var(--text-primary); cursor:pointer" onclick="ocToggleCrmView()">${esc(contact.nome || contact.numero_cliente)} <i class="fas fa-chevron-right" style="font-size:10px; opacity:0.5; margin-left:4px"></i></div>
            <div style="font-size:11px; color:var(--text-secondary)">${esc(contact.numero_cliente)}</div>
        </div>
        <div class="oc-ia-toggle-btn${!ia ? ' off' : ''}" id="ocIaBtn_${esc(id)}" onclick="ocToggleIA('${esc(id)}')" style="cursor:pointer; display:flex; align-items:center; gap:8px; padding:6px 12px; border-radius:30px; border:1px solid var(--border-color)">
            <div class="oc-switch${!ia ? ' off' : ''}">
                <div class="oc-switch-dot"></div>
            </div>
            <span style="font-size:11px; font-weight:600" id="ocIaLabel_${esc(id)}">${ia ? 'IA ATIVA' : 'IA PAUSADA'}</span>
        </div>
    </div>

    <div class="oc-messages-area" id="ocMsgs_${esc(id)}" style="flex:1; overflow-y:auto; padding:20px; background:var(--bg-primary); background-image:radial-gradient(var(--border-color) 1px, transparent 1px); background-size:20px 20px">
        <div class="spinner" style="margin:40px auto"></div>
    </div>

    <div class="oc-quick-actions" style="padding:8px 16px; display:flex; gap:8px; overflow-x:auto; background:var(--bg-primary); border-top:1px solid var(--border-color)">
        <button class="btn btn-secondary" style="font-size:11px; padding:6px 12px; border-radius:20px; white-space:nowrap" onclick="ocSendQuick('Saudação', '${esc(id)}')">👋 Saudação</button>
        <button class="btn btn-secondary" style="font-size:11px; padding:6px 12px; border-radius:20px; white-space:nowrap" onclick="ocSendQuick('Catálogo', '${esc(id)}')">📂 Catálogo</button>
        <button class="btn btn-secondary" style="font-size:11px; padding:6px 12px; border-radius:20px; white-space:nowrap" onclick="ocSendQuick('Pix', '${esc(id)}')">💰 Pix</button>
        <button class="btn btn-secondary" style="font-size:11px; padding:6px 12px; border-radius:20px; white-space:nowrap" onclick="ocSendQuick('Aguardar Atendente', '${esc(id)}')">👨‍💻 Aguardar</button>
    </div>

    <div class="oc-composer" style="padding:16px 20px; background:var(--card-bg); border-top:1px solid var(--border-color); display:flex; gap:12px; align-items:end">
        <button class="btn-ghost" style="padding:10px; border-radius:50%; width:40px; height:40px" title="Anexar"><i class="fas fa-plus"></i></button>
        <textarea class="form-input" id="ocInput_${esc(id)}" 
            placeholder="Mensagem..." 
            style="min-height:40px; max-height:150px; border-radius:20px; resize:none; background:var(--bg-primary); padding:10px 16px"
            onkeydown="ocHandleKey(event,'${esc(id)}')"
            oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
        <button class="btn btn-primary" style="height:40px; width:40px; min-width:40px; border-radius:50%; padding:0" onclick="ocSendMessage('${esc(id)}')">
            <i class="fas fa-paper-plane" style="font-size:14px"></i>
        </button>
    </div>`;

    ocRenderCrmProfile(contact.numero_cliente);
    await ocLoadMessages(id);
}

function backToContacts() {
    const layout = document.getElementById('omnichatLayout');
    if (layout) {
        layout.classList.remove('view-chat', 'view-crm');
        layout.classList.add('view-contacts');
    }
    _ocActiveId = null;
}

function ocToggleCrmView() {
    const layout = document.getElementById('omnichatLayout');
    if (layout) layout.classList.toggle('view-crm');
}

async function ocRenderCrmProfile(telefone) {
    const el = document.getElementById('ocCrmPanel');
    if (!el) return;
    el.innerHTML = '<div class="spinner" style="margin:40px auto"></div>';

    try {
        const crm = await api.get(`/chat/contato/${state.lojaId}/${telefone}`);

        el.innerHTML = `
        <div class="oc-crm-header" style="display:flex; align-items:center; gap:12px; margin-bottom:24px">
            <button class="btn-ghost" onclick="ocToggleCrmView()" style="display:none" id="crmBackBtn"><i class="fas fa-arrow-left"></i></button>
            <span style="font-weight:700; font-size:14px">Perfil do Cliente</span>
        </div>
        <style>@media(max-width:768px){ #crmBackBtn{display:block !important;} }</style>
        <div class="crm-section" style="text-align:center; margin-bottom:32px">
            <div class="sidebar-user-avatar" style="width:80px; height:80px; border-radius:50%; background:#1f2937; color:#9ca3af; display:flex; align-items:center; justify-content:center; margin:0 auto 16px">
                <svg viewBox="0 0 24 24" fill="currentColor" style="width:40px; height:40px"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </div>
            <div style="font-size:18px; font-weight:700; color:var(--text-primary)">${esc(crm.nome || 'Lead s/ Nome')}</div>
            <div style="font-size:12px; color:var(--sidebar-muted)">${esc(telefone)}</div>
        </div>

        <div class="crm-section">
            <div class="crm-label">Status do CRM</div>
            <div class="crm-value"><span class="crm-score-badge">${esc(crm.status || 'Lead')}</span></div>
        </div>

        <div class="crm-section">
            <div class="crm-label">Intenção de Compra</div>
            <div class="crm-value" style="color:var(--accent)">Alta - Consultando Preço</div>
        </div>

        <div class="crm-section">
            <div class="crm-label">Lead Score</div>
            <div class="crm-value">🔥 ${crm.lead_score || 0} / 100</div>
        </div>

        <div class="crm-section">
            <div class="crm-label">Memória do Contato</div>
            <div class="crm-memory-box">
                ${esc(crm.memoria_ia || 'A IA ainda não gerou um resumo para este contato.')}
            </div>
        </div>

        <div style="margin-top:auto; padding-top:20px">
            <button class="btn btn-secondary" style="width:100%; justify-content:center; margin-bottom:10px" onclick="toast('Em breve: Editar dados CRM')">
                <i class="fas fa-edit" style="margin-right:8px"></i> Editar Perfil
            </button>
            <button class="btn btn-primary" style="width:100%; justify-content:center" onclick="ocToggleIA('${esc(telefone)}')">
                <i class="fas fa-hand-holding-hand" style="margin-right:8px"></i> Assumir Atendimento
            </button>
        </div>`;
    } catch (e) {
        el.innerHTML = `<div style="padding:20px; font-size:12px; color:var(--destructive)">Erro ao carregar CRM.</div>`;
    }
}

async function ocSendQuick(type, id) {
    const inp = document.getElementById('ocInput_' + id);
    if (!inp) return;
    let text = '';
    if (type === 'Saudação') text = 'Olá! Tudo bem? Como posso te ajudar hoje?';
    if (type === 'Catálogo') text = 'Vou te enviar nosso catálogo de produtos atualizado. Um momento...';
    if (type === 'Pix') text = 'Nossa chave Pix é o nosso CNPJ: 12.345.678/0001-90';
    if (type === 'Aguardar Atendente') text = 'Um de nossos especialistas já vai te atender. Por favor, aguarde um momento.';

    inp.value = text;
    inp.focus();
}

async function ocLoadMessages(id) {
    const el = document.getElementById('ocMsgs_' + id);
    if (!el) return;
    try {
        const msgs = await api.get(`/chat/mensagens/${state.lojaId}/${id}`);
        if (!msgs.length) {
            el.innerHTML = `<div style="text-align:center;padding:40px;font-size:13px;color:var(--text-secondary)">Nenhuma mensagem ainda.</div>`;
            return;
        }
        el.innerHTML = msgs.map(m => renderBubble(m)).join('');
        el.scrollTop = el.scrollHeight;
    } catch (e) {
        el.innerHTML = `<div style="padding:20px;font-size:13px;color:var(--text-secondary)">Erro: ${esc(e.message)}</div>`;
    }
}

async function ocSilentRefreshMessages(id) {
    const el = document.getElementById('ocMsgs_' + id);
    if (!el) return;
    try {
        const msgs = await api.get(`/chat/mensagens/${state.lojaId}/${id}`);
        if (!msgs.length) return;
        const wasAtBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 60;
        el.innerHTML = msgs.map(m => renderBubble(m)).join('');
        if (wasAtBottom) el.scrollTop = el.scrollHeight;
    } catch { }
}

function renderBubble(m) {
    const isUser = m.remetente_tipo === 'user';
    const isAI = m.remetente_tipo === 'assistant' || m.remetente_tipo === 'bot';
    
    let bgColor = isUser ? 'var(--bg-secondary)' : (isAI ? 'rgba(255, 215, 0, 0.15)' : 'var(--accent)');
    let textColor = (isUser || isAI) ? 'var(--text-primary)' : 'var(--bg-primary)';
    let align = isUser ? 'flex-start' : 'flex-end';
    let label = isUser ? 'Cliente' : (isAI ? 'IA Assistente' : 'Você');
    let radius = isUser ? '4px 16px 16px 16px' : '16px 4px 16px 16px';
    let borderColor = isAI ? 'rgba(255,215,0,0.3)' : 'var(--border-color)';

    return `
    <div style="display:flex; flex-direction:column; align-items:${align}; margin-bottom:16px; width:100%; animation: fadeIn 0.2s ease">
        <div style="max-width:85%; padding:12px 16px; border-radius:${radius}; background:${bgColor}; border:1px solid ${borderColor}; position:relative; box-shadow:var(--shadow-sm)">
            <div style="font-size:10px; font-weight:800; margin-bottom:4px; opacity:0.6; color:${isUser ? 'var(--text-secondary)' : (isAI ? 'var(--accent)' : 'rgba(0,0,0,0.6)')}; text-transform:uppercase; letter-spacing:0.05em">
                ${label}
            </div>
            <div style="font-size:14px; color:${textColor}; line-height:1.5; word-break:break-word">
                ${esc(m.conteudo).replace(/\n/g, '<br>')}
            </div>
            <div style="font-size:9px; opacity:0.5; margin-top:6px; text-align:right; color:${textColor}">
                ${new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>
    </div>`;
}

async function ocToggleIA(id) {
    _ocIaStates[id] = !_ocIaStates[id];
    const ia = _ocIaStates[id];
    const sw = document.querySelector(`#ocIaBtn_${id} .oc-switch`);
    const lbl = document.getElementById(`ocIaLabel_${id}`);
    const btn = document.getElementById(`ocIaBtn_${id}`);
    const banner = document.getElementById(`ocBanner_${id}`);
    if (sw) sw.className = 'oc-switch' + (ia ? '' : ' off');
    if (lbl) lbl.textContent = ia ? 'IA ativa' : 'IA pausada';
    if (btn) btn.className = 'oc-ia-toggle-btn' + (ia ? '' : ' off');
    if (banner) banner.className = 'oc-handoff-banner' + (ia ? '' : ' visible');
    ocRenderContactList(_ocContacts);
    try {
        await api.post('/chat/toggle-ia', { loja_id: state.lojaId, numero_cliente: id, ia_ativa: ia });
        toast(ia ? '✅ IA reativada para este contato.' : '⏸️ IA pausada — modo manual ativo.');
    } catch (e) { toast(e.message, 'error'); }
}

function ocCloseChat() {
    const layout = document.getElementById('omnichatLayout');
    if (layout) layout.classList.remove('chat-open');
    _ocActiveId = null;
    ocRenderContactList(_ocContacts);
}

async function ocSendMessage(id) {
    const inp = document.getElementById('ocInput_' + id);
    const sendBtn = document.getElementById('ocSendBtn_' + id);
    if (!inp || !inp.value.trim()) return;
    const text = inp.value.trim();
    inp.value = '';
    inp.style.height = 'auto';

    _ocIaStates[id] = false;
    const sw = document.querySelector(`#ocIaBtn_${id} .oc-switch`);
    const lbl = document.getElementById(`ocIaLabel_${id}`);
    const btn = document.getElementById(`ocIaBtn_${id}`);
    const banner = document.getElementById(`ocBanner_${id}`);
    if (sw) sw.className = 'oc-switch off';
    if (lbl) lbl.textContent = 'IA pausada';
    if (btn) btn.className = 'oc-ia-toggle-btn off';
    if (banner) banner.className = 'oc-handoff-banner visible';

    const msgsArea = document.getElementById('ocMsgs_' + id);
    const tempId = 'temp-' + Date.now();
    if (msgsArea) {
        msgsArea.innerHTML += renderBubble({
            remetente_tipo: 'humano',
            conteudo: text,
            criado_em: new Date().toISOString(),
            _tempId: tempId
        });
        msgsArea.scrollTop = msgsArea.scrollHeight;
    }

    if (sendBtn) { sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; sendBtn.disabled = true; }
    try {
        await api.post('/chat/send-manual', {
            numero_wa: state.lojaId,
            telefone_cliente: id,
            mensagem: text,
        });

        const cont = _ocContacts.find(x => x.id === id);
        if (cont) { cont.ultima_msg = text; cont.atualizado_em = new Date().toISOString(); }
        ocRenderContactList(_ocContacts);
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
        inp.value = text;
    } finally {
        if (sendBtn) { sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>'; sendBtn.disabled = false; }
    }
}

function ocHandleKey(e, id) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ocSendMessage(id); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONEXÃO WHATSAPP
// ══════════════════════════════════════════════════════════════════════════════

async function renderWhatsApp() {
    const c = document.getElementById('pageContent');
    if (waPolling) { clearInterval(waPolling); waPolling = null; }

    c.innerHTML = `
    <div class="page-wrapper">
        <div class="page-header">
            <div>
                <h1 class="page-title">Instâncias de WhatsApp</h1>
                <p class="text-muted">Gerencie conexões e monitore o status de pareamento em tempo real.</p>
            </div>
            <div class="page-actions">
                <button class="btn btn-primary" onclick="openModalNovaLoja()">
                    <i class="fas fa-plus"></i> Nova Instância
                </button>
            </div>
        </div>
        <div class="page-body">
            <div id="instancesGrid" class="instance-grid">
                <div class="loading-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <div class="spinner" style="margin: 0 auto 20px;"></div>
                    <p>Sincronizando instâncias...</p>
                </div>
            </div>
        </div>
    </div>`;

    await loadWAInstances();
    waPolling = setInterval(loadWAInstances, 5000);

    if (state.pendingAutoConnect) {
        const idToConnect = state.pendingAutoConnect;
        state.pendingAutoConnect = null;
        setTimeout(() => conectarWA(idToConnect), 500);
    }
}

async function loadWAInstances() {
    try {
        const stores = await api.get('/admin/lojas');
        const grid = document.getElementById('instancesGrid');
        if (!grid) { clearInterval(waPolling); return; }

        const myStores = (state.role === 'master' || state.role === 'admin' || state.is_admin) 
            ? stores 
            : stores.filter(s => String(s.wa_id) === String(state.lojaId));

        if (myStores.length === 0) {
            grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1">
                <div class="empty-icon">🔌</div>
                <h2>Nenhuma instância configurada</h2>
                <p>Adicione um cliente ou configure seu ID para começar.</p>
            </div>`;
            return;
        }

        const statusPromises = myStores.map(s => api.get(`/wa/status/${s.wa_id}`).catch(() => ({ status: 'erro' })));
        const statuses = await Promise.all(statusPromises);

        let html = '';
        myStores.forEach((store, i) => {
            const wa = statuses[i];
            const isOnline = wa.status === 'conectado';
            const isWaiting = wa.status === 'aguardando';
            const isError = wa.status === 'erro';

            let statusBadge = `<span class="badge badge-danger"><span class="dot"></span> Desconectado</span>`;
            if (isOnline) statusBadge = `<span class="badge badge-success"><span class="dot"></span> Conectado</span>`;
            if (isWaiting) statusBadge = `<span class="badge badge-warning"><span class="dot"></span> Pareando</span>`;

            html += `
            <div class="card instance-card ${isOnline ? 'online' : ''}" id="card-${store.wa_id}">
                <div class="instance-header">
                    <div class="instance-info">
                        <h3 class="instance-name">${esc(store.nome)}</h3>
                        ${statusBadge}
                    </div>
                    <div class="instance-icon">
                        <i class="fab fa-whatsapp"></i>
                    </div>
                </div>

                <div class="instance-body">
                    <div class="instance-number">${formatPhone(store.wa_id)}</div>
                    
                    ${isWaiting && wa.pairingCode ? `
                        <div class="pairing-container">
                            <label>CÓDIGO DE PAREAMENTO</label>
                            <div class="pairing-code" onclick="copyText('${wa.pairingCode.replace(/-/g,'')}')">
                                ${wa.pairingCode}
                            </div>
                            <small>Digite este código no seu WhatsApp</small>
                        </div>
                    ` : ''}

                    ${isError ? `<p style="color:var(--danger); font-size:12px; margin-top:8px">Falha na API do servidor</p>` : ''}
                </div>

                <div class="instance-actions">
                    ${isOnline ? `
                        <button class="btn btn-secondary btn-sm" onclick="renderDiagnostics('${store.wa_id}')">
                            <i class="fas fa-stethoscope"></i> Diagnóstico
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="desconectarWA('${store.wa_id}')">
                            <i class="fas fa-unlink"></i> Desconectar
                        </button>
                    ` : `
                        <button class="btn btn-primary" style="width:100%; justify-content:center" onclick="conectarWA('${store.wa_id}')" id="btn-conn-${store.wa_id}">
                            <i class="fas fa-qrcode"></i> ${isWaiting ? 'Gerar Novo Código' : 'Gerar Código'}
                        </button>
                    `}
                </div>
            </div>`;
        });

        grid.innerHTML = html;
    } catch (e) {
        console.error("Erro ao carregar instâncias:", e);
    }
}

async function conectarWA(numero_wa) {
    const btn = document.getElementById(`btn-conn-${numero_wa}`);
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...'; btn.disabled = true; }
    
    try {
        await api.post('/wa/connect', { numero: numero_wa });
        toast('Comando enviado! Aguardando código...', 'info');
        await loadWAInstances();
    } catch (e) { 
        toast(e.message, 'error'); 
    } finally {
        if (btn) { btn.innerHTML = '<i class="fas fa-qrcode"></i> Gerar Código'; btn.disabled = false; }
    }
}

async function desconectarWA(numero_wa) {
    if (!confirm(`Deseja desconectar a instância ${numero_wa}?`)) return;
    try {
        await api.post('/wa/disconnect', { numero: numero_wa });
        toast('Instância desconectada com sucesso.');
        await loadWAInstances();
    } catch (e) { 
        toast(e.message, 'error'); 
    }
}

function formatPhone(num) {
    const s = String(num);
    if (s.length < 10) return s;
    return `+${s.slice(0, 2)} ${s.slice(2, 4)} ${s.slice(4, 9)}-${s.slice(9)}`;
}

function copyText(txt) {
    navigator.clipboard.writeText(txt);
    toast('Código copiado para a área de transferência!');
}

// ══════════════════════════════════════════════════════════════════════════════
//  GESTÃO DE CLIENTES
// ══════════════════════════════════════════════════════════════════════════════

async function renderClientes() {
    const c = document.getElementById('pageContent');
    c.innerHTML = `
    <div class="page-wrapper">
        <div class="page-header">
            <div>
                <h1 class="page-title">Gestão de Clientes</h1>
                <p class="text-muted">Gerencie as instâncias e contas conectadas ao sistema.</p>
            </div>
            <div class="page-actions">
                <button class="btn btn-primary" onclick="openModalNovaLoja()">
                    <i class="fas fa-plus"></i> Novo Cliente
                </button>
            </div>
        </div>
        <div class="page-body">
            <div id="clientesList"><div class="spinner"></div></div>
        </div>
    </div>`;
    loadClientes();
}

async function loadClientes() {
    const el = document.getElementById('clientesList');
    try {
        const lojas = await api.get('/admin/lojas');
        state.lojas = lojas;
        if (!lojas.length) {
            el.innerHTML = `<div style="text-align:center; padding:64px 20px">
                <div style="font-size:64px; opacity:0.1; margin-bottom:24px"><i class="fas fa-users-slash"></i></div>
                <h3 style="font-size:18px; font-weight:600; margin-bottom:12px">Nenhum cliente por aqui</h3>
                <p class="text-muted" style="margin-bottom:24px">Comece cadastrando sua primeira empresa ou parceiro.</p>
                <button class="btn btn-primary" onclick="openModalNovaLoja()">+ Adicionar Primeiro Cliente</button>
            </div>`;
            return;
        }
        el.innerHTML = `
        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-color)">
            <table class="client-table">
                <thead>
                    <tr>
                        <th>Empresa</th>
                        <th>ID Instância</th>
                        <th>Status</th>
                        <th>Criado em</th>
                        <th style="text-align:right">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${lojas.map(l => `
                    <tr>
                        <td>
                            <div style="display:flex; align-items:center; gap:12px">
                                <div class="client-avatar">${l.nome.substring(0, 1).toUpperCase()}</div>
                                <div>
                                    <div style="font-weight:600; font-size:14px">${esc(l.nome)}</div>
                                    <div style="font-size:11px; color:var(--text-secondary)">SaaS Partner</div>
                                </div>
                            </div>
                        </td>
                        <td><code class="mono-id">${esc(l.wa_id)}</code></td>
                        <td>
                            <span class="badge ${l.ativa ? 'badge-success' : 'badge-danger'}" style="font-size:9px">
                                ${l.ativa ? 'Ativo' : 'Inativo'}
                            </span>
                        </td>
                        <td><span style="font-size:13px; color:var(--text-secondary)">${new Date(l.criado_em).toLocaleDateString('pt-BR')}</span></td>
                        <td>
                            <div style="display:flex; justify-content:flex-end; gap:8px">
                                <button class="btn btn-secondary btn-sm" onclick="selecionarCliente('${esc(l.id)}')" title="Acessar Painel">
                                    <i class="fas fa-sign-in-alt"></i>
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="editarCliente('${esc(l.id)}')" title="Editar">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-ghost btn-sm" onclick="excluirCliente('${esc(l.id)}')" style="color:var(--danger)" title="Excluir">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    } catch (e) { el.innerHTML = errMsg(e); }
}

function selecionarCliente(id) {
    state.lojaId = id;
    state.loja = state.lojas.find(l => l.id === id) || null;
    const sel = document.getElementById('lojaSelect');
    if (sel) sel.value = id;
    const topbar = document.getElementById('lojaNameTopbar');
    if (topbar && state.loja) topbar.textContent = state.loja.nome;
    toast('✅ Cliente selecionado: ' + (state.loja?.nome || id));
    navigate('dashboard');
}

async function excluirCliente(id) {
    if (!confirm('⚠️ TEM CERTEZA? Isso excluirá permanentemente o cliente, conversas e a base de conhecimento.')) return;
    try {
        await api.del('/admin/lojas/' + id);
        toast('🗑️ Cliente excluído com sucesso!');
        await initLojas();
        loadClientes();
        if (state.lojaId === id) {
            state.lojaId = state.lojas.length ? state.lojas[0].id : null;
            state.loja = state.lojas.length ? state.lojas[0] : null;
            populateLojaSelect();
        }
    } catch (e) { toast(e.message, 'error'); }
}

function editarCliente(id) {
    const loja = state.lojas.find(l => l.id === id);
    if (!loja) return;
    openModal(`
    <div style="margin-bottom:24px">
        <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px">✏️ Editar Cliente</div>
        <div style="font-size:13px;color:var(--text-secondary)">Atualize os dados básicos da empresa.</div>
    </div>

    <div class="form-group">
        <label class="form-label">Nome da Empresa</label>
        <input class="form-input" id="eNome" value="${esc(loja.nome)}">
    </div>
    <div class="form-group">
        <label class="form-label">Número WhatsApp (ID)</label>
        <div style="display:flex;gap:8px">
            <input class="form-input" value="${esc(loja.wa_id)}" disabled style="background:var(--bg-secondary);font-family:'JetBrains Mono',monospace;flex:1">
            <div style="padding:10px;background:var(--bg-secondary);border-radius:6px;color:var(--text-secondary);font-size:14px;display:flex;align-items:center">
                <i class="fas fa-lock"></i>
            </div>
        </div>
        <small style="color:var(--text-secondary);margin-top:6px;display:block">O ID do WhatsApp não pode ser alterado após o cadastro.</small>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:32px">
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarEdicaoCliente('${esc(id)}')">
            <i class="fas fa-save"></i> Salvar Alterações
        </button>
    </div>`);
}

async function salvarEdicaoCliente(id) {
    const nome = document.getElementById('eNome').value.trim();
    if (!nome) return toast('Nome é obrigatório', 'error');
    try {
        await api.post('/admin/lojas/update', { wa_id: id, nome });
        toast('Cliente atualizado!');
        closeModal();
        await initLojas();
        loadClientes();
    } catch (e) { toast(e.message, 'error'); }
}

function openModalNovaLoja() {
    openModal(`
    <div style="margin-bottom:24px">
        <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px">🏢 Novo Cliente</div>
        <div style="font-size:13px;color:var(--text-secondary)">Cadastre uma nova empresa e configure o bot inicial.</div>
    </div>

    <div class="form-group">
        <label class="form-label">Nome da Empresa</label>
        <input class="form-input" id="mNome" placeholder="Ex: Clínica Sorriso">
    </div>
    <div class="form-group">
        <label class="form-label">Número do WhatsApp (ID)</label>
        <input class="form-input" id="mWaId" placeholder="5511999999999" style="font-family:'JetBrains Mono',monospace">
        <small style="color:var(--text-secondary);margin-top:6px;display:block">Use apenas números com DDD (ex: 5511...)</small>
    </div>
    <div class="form-group">
        <label class="form-label">Prompt inicial da IA</label>
        <textarea class="form-textarea" id="mPrompt" style="height:100px"
            placeholder="Ex: Você é a assistente virtual da Clínica Sorriso..."></textarea>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:32px">
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="btnCriarLoja" onclick="criarLoja()">
            <i class="fas fa-plus"></i> Criar Cliente
        </button>
    </div>`);
}

async function criarLoja() {
    const nome = document.getElementById('mNome').value.trim();
    const wa_id = document.getElementById('mWaId').value.trim().replace(/\D/g, '');
    const prompt_base = document.getElementById('mPrompt').value.trim();
    if (!nome || !wa_id) return toast('Nome e número WhatsApp são obrigatórios', 'error');
    const btn = document.getElementById('btnCriarLoja');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...'; btn.disabled = true;
    try {
        await api.post('/admin/lojas', { nome, wa_id, prompt_base });
        toast('✅ Cliente criado com sucesso!');
        closeModal();
        await initLojas();
        state.lojaId = wa_id;
        state.loja = state.lojas.find(l => l.id === wa_id) || null;
        populateLojaSelect();
        
        state.pendingAutoConnect = wa_id;
        navigate('whatsapp');
    } catch (e) { toast(e.message, 'error'); btn.innerHTML = '<i class="fas fa-plus"></i> Criar Cliente'; btn.disabled = false; }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIGURAÇÕES DA EQUIPE
// ══════════════════════════════════════════════════════════════════════════════

async function renderEquipe() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }

    // Dados mock enquanto a API não existe — serão substituídos pela resposta real
    const mockUsers = [
        { id: '1', nome: 'João Silva', email: 'joao@empresa.com', cargo: 'Admin', criado_em: new Date(Date.now() - 86400000 * 30).toISOString() },
        { id: '2', nome: 'Maria Santos', email: 'maria@empresa.com', cargo: 'Vendedor', criado_em: new Date(Date.now() - 86400000 * 15).toISOString() },
        { id: '3', nome: 'Carlos Oliveira', email: 'carlos@empresa.com', cargo: 'Suporte', criado_em: new Date(Date.now() - 86400000 * 7).toISOString() },
    ];

    let users = mockUsers;
    try {
        const data = await api.get('/admin/equipe/' + state.lojaId);
        if (Array.isArray(data) && data.length) users = data;
    } catch { /* usa mock */ }

    const cargoBadge = cargo => ({
        'Admin': 'badge-danger',
        'Vendedor': 'badge-warning',
        'Suporte': 'badge-default',
    }[cargo] || 'badge-default');

    function ocFilterGlobalList(inputId, targetBodyId, rowSelector) {
        const q = document.getElementById(inputId).value.toLowerCase();
        const rows = document.querySelectorAll(`#${targetBodyId} ${rowSelector}`);
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(q) ? '' : 'none';
        });
    }

    const cargoIcon = cargo => ({
        'Admin': '👑',
        'Vendedor': '💼',
        'Suporte': '🎧',
    }[cargo] || '👤');

    const admins = users.filter(u => u.cargo === 'Admin').length;
    const operators = users.filter(u => u.cargo !== 'Admin').length;

    c.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:24px">
        <div>
            <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.03em;color:var(--text-primary)">
                Configurações da Equipe
            </h2>
            <p style="font-size:13px;color:var(--text-secondary);margin-top:4px">
                Gerencie os membros, permissões e acessos ao painel.
            </p>
        </div>
        <button class="btn btn-primary" onclick="openModalConvidarUsuario()">
            <i class="fas fa-user-plus"></i> Convidar Usuário
        </button>
    </div>

    <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card">
            <div class="stat-label"><i class="fas fa-users" style="color:var(--accent)"></i> Total de Membros</div>
            <div class="stat-value">${users.length}</div>
            <div class="stat-trend">Equipe ativa</div>
        </div>
        <div class="stat-card">
            <div class="stat-label"><i class="fas fa-shield-alt" style="color:var(--accent)"></i> Administradores</div>
            <div class="stat-value">${admins}</div>
            <div class="stat-trend">Acesso total</div>
        </div>
        <div class="stat-card">
            <div class="stat-label"><i class="fas fa-headset" style="color:var(--accent)"></i> Operadores</div>
            <div class="stat-value">${operators}</div>
            <div class="stat-trend">Vendedores + Suporte</div>
        </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:18px 22px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
            <div class="card-title">Membros da Equipe</div>
            
            <!-- SEARCH ENGINE: EQUIPE -->
            <div style="position:relative; width:100%; max-width:300px">
                <i class="fas fa-search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-secondary); font-size:12px"></i>
                <input type="text" class="form-input" id="searchEquipe" 
                    placeholder="Buscar por nome ou e-mail..." 
                    style="padding-left:34px; border-radius:100px; background:var(--bg-secondary); height:36px; font-size:12px"
                    oninput="ocFilterGlobalList('searchEquipe', 'equipeListBody', 'tr')">
            </div>
        </div>
    <div id="equipeListBody" class="stats-grid">
        ${users.map(u => `
        <div class="card" style="display:flex; flex-direction:column; gap:16px; border:1px solid rgba(255,255,255,0.03); background:rgba(255,255,255,0.02); transition:transform 0.2s ease" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
            <div style="display:flex; justify-content:space-between; align-items:flex-start">
                <div style="display:flex; align-items:center; gap:12px">
                    <div style="width:44px; height:44px; border-radius:12px; background:linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(212, 175, 55, 0.05) 100%); border:1px solid rgba(255,215,0,0.15); color:var(--accent); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px">
                        ${(u.nome || 'U').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <div style="font-weight:700; font-size:15px">${esc(u.nome)}</div>
                        <div style="font-size:11px; color:var(--text-secondary)">${cargoIcon(u.cargo)} ${esc(u.cargo)}</div>
                    </div>
                </div>
                <div class="badge ${cargoBadge(u.cargo)}" style="font-size:9px; letter-spacing:0.05em">${u.cargo.toUpperCase()}</div>
            </div>
            
            <div style="background:var(--bg-primary); padding:12px; border-radius:10px; border:1px solid var(--border-color)">
                <div style="font-size:10px; color:var(--text-secondary); text-transform:uppercase; margin-bottom:4px">E-mail de Acesso</div>
                <div style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${esc(u.email)}</div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:auto; padding-top:12px; border-top:1px solid var(--border-color)">
                <div style="font-size:11px; color:var(--text-secondary)">Desde ${new Date(u.criado_em || Date.now()).toLocaleDateString('pt-BR')}</div>
                <div style="display:flex; gap:6px">
                    <button class="btn btn-ghost" style="width:32px; height:32px; padding:0" onclick="editarUsuarioEquipe('${esc(u.id)}','${esc(u.nome)}','${esc(u.email)}','${esc(u.cargo)}')" title="Editar">
                        <i class="fas fa-edit" style="font-size:12px"></i>
                    </button>
                    <button class="btn btn-ghost" style="width:32px; height:32px; padding:0; color:var(--danger)" onclick="removerUsuarioEquipe('${esc(u.id)}','${esc(u.nome)}')" title="Remover">
                        <i class="fas fa-trash-alt" style="font-size:12px"></i>
                    </button>
                </div>
            </div>
        </div>`).join('')}
    </div>
    </div>

    <div class="card" style="background:rgba(255, 215, 0, 0.1);border-color:rgba(197,160,89,0.2);margin-top:0">
        <div class="card-title" style="font-size:14px;margin-bottom:10px">🔐 Níveis de Permissão</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px">
            <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:14px">
                <div style="font-weight:700;font-size:13px;margin-bottom:6px">👑 Admin</div>
                <div style="font-size:12px;color:var(--text-secondary);line-height:1.7">Acesso total: configurações, equipe, clientes e relatórios.</div>
            </div>
            <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:14px">
                <div style="font-weight:700;font-size:13px;margin-bottom:6px">💼 Vendedor</div>
                <div style="font-size:12px;color:var(--text-secondary);line-height:1.7">Caixa de entrada, Base de Conhecimento e Dashboard.</div>
            </div>
            <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:14px">
                <div style="font-weight:700;font-size:13px;margin-bottom:6px">🎧 Suporte</div>
                <div style="font-size:12px;color:var(--text-secondary);line-height:1.7">Somente Caixa de Entrada — visualiza e responde conversas.</div>
            </div>
        </div>
    </div>`;
}

function openModalConvidarUsuario() {
    openModal(`
    <div style="margin-bottom:24px">
        <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px">Convidar Usuário</div>
        <div style="font-size:13px;color:var(--text-secondary)">Adicione um novo membro à equipe de atendimento.</div>
    </div>

    <div class="form-group">
        <label class="form-label">Nome Completo</label>
        <input class="form-input" id="euNome" placeholder="Ex: Ana Carvalho">
    </div>
    <div class="form-group">
        <label class="form-label">E-mail</label>
        <input class="form-input" id="euEmail" type="email" placeholder="ana@suaempresa.com">
    </div>
    <div class="form-group">
        <label class="form-label">Senha Inicial</label>
        <div class="input-with-toggle">
            <input class="form-input" id="euSenha" type="password" placeholder="Mínimo 8 caracteres">
            <button class="input-toggle-btn" type="button" onclick="togglePasswordVisibility('euSenha')">
                <i class="fas fa-eye" id="euSenhaIcon"></i>
            </button>
        </div>
    </div>
    <div class="form-group">
        <label class="form-label">Cargo / Permissão</label>
        <select class="form-input form-select" id="euCargo">
            <option value="Suporte">🎧 Suporte — Visualiza e responde conversas</option>
            <option value="Vendedor">💼 Vendedor — Gerencia leads e conversas</option>
            <option value="Admin">👑 Admin — Acesso total ao painel</option>
        </select>
    </div>

    <div style="background:rgba(255, 215, 0, 0.1);border:1px solid rgba(197,160,89,0.2);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:24px;font-size:12px;color:var(--text-secondary);line-height:1.7">
        <strong style="color:var(--text-primary)">ℹ️ Sobre as permissões:</strong><br>
        A senha inicial deve ser alterada pelo usuário no primeiro acesso.<br>
        Admins têm acesso irrestrito — conceda com critério.
    </div>

    <div style="display:flex;justify-content:flex-end;gap:12px">
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="btnConvidar" onclick="convidarUsuario()">
            <i class="fas fa-user-plus"></i> Convidar
        </button>
    </div>`);
}

async function convidarUsuario() {
    const nome = document.getElementById('euNome').value.trim();
    const email = document.getElementById('euEmail').value.trim();
    const senha = document.getElementById('euSenha').value;
    const cargo = document.getElementById('euCargo').value;

    if (!nome || !email || !senha) return toast('Preencha todos os campos', 'error');
    if (senha.length < 8) return toast('A senha deve ter ao menos 8 caracteres', 'error');

    const btn = document.getElementById('btnConvidar');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Convidando...'; btn.disabled = true;

    try {
        await api.post('/admin/equipe/convidar', { nome, email, senha, cargo, loja_id: state.lojaId });
        toast(`✅ ${nome} adicionado à equipe!`);
        closeModal();
        renderEquipe();
    } catch (e) {
        toast(e.message || 'Erro ao convidar usuário', 'error');
    } finally {
        if (btn) { btn.innerHTML = '<i class="fas fa-user-plus"></i> Convidar'; btn.disabled = false; }
    }
}

function editarUsuarioEquipe(id, nome, email, cargo) {
    openModal(`
    <div style="margin-bottom:24px">
        <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px">Editar Membro</div>
        <div style="font-size:13px;color:var(--text-secondary)">Atualize as informações e permissões de <strong>${esc(nome)}</strong>.</div>
    </div>

    <div class="form-group">
        <label class="form-label">Nome Completo</label>
        <input class="form-input" id="emNome" value="${esc(nome)}">
    </div>
    <div class="form-group">
        <label class="form-label">E-mail</label>
        <input class="form-input" id="emEmail" value="${esc(email)}" disabled style="background:var(--bg-secondary);opacity:0.7">
        <small style="color:var(--text-secondary);margin-top:4px;display:block">O e-mail não pode ser alterado.</small>
    </div>
    <div class="form-group">
        <label class="form-label">Cargo / Permissão</label>
        <select class="form-input form-select" id="emCargo">
            <option value="Suporte"  ${cargo === 'Suporte' ? 'selected' : ''}>🎧 Suporte</option>
            <option value="Vendedor" ${cargo === 'Vendedor' ? 'selected' : ''}>💼 Vendedor</option>
            <option value="Admin"    ${cargo === 'Admin' ? 'selected' : ''}>👑 Admin</option>
        </select>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:32px">
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarEdicaoUsuario('${esc(id)}')">
            <i class="fas fa-save"></i> Salvar Alterações
        </button>
    </div>`);
}

async function salvarEdicaoUsuario(id) {
    const nome = document.getElementById('emNome').value.trim();
    const cargo = document.getElementById('emCargo').value;
    if (!nome) return toast('Nome é obrigatório', 'error');
    try {
        await api.post('/admin/equipe/update', { id, nome, cargo, loja_id: state.lojaId });
        toast('Membro atualizado com sucesso!');
        closeModal();
        renderEquipe();
    } catch (e) {
        toast(e.message || 'Erro ao atualizar', 'error');
    }
}

async function removerUsuarioEquipe(id, nome) {
    if (!confirm(`Deseja remover ${nome} da equipe? Esta ação não pode ser desfeita.`)) return;
    try {
        await api.del('/admin/equipe/' + id);
        toast(`${nome} removido da equipe.`);
        renderEquipe();
    } catch (e) {
        toast(e.message || 'Erro ao remover membro', 'error');
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  DIAGNÓSTICO
// ══════════════════════════════════════════════════════════════════════════════

async function renderDiagnostics() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    
    c.innerHTML = `
    <div class="page-wrapper">
        <div class="page-header">
            <div>
                <h1 class="page-title">Saúde do Sistema</h1>
                <p class="text-muted">Verifique a conectividade com os LLMs, Banco de Dados e RAG em tempo real.</p>
            </div>
            <div class="page-actions">
                <button class="btn btn-primary" id="btnRunDiag" onclick="runFullDiagnostics()">
                    <i class="fas fa-play"></i> Iniciar Varredura
                </button>
            </div>
        </div>
        
        <div class="page-body">
            <div id="diagOutput" class="diag-console">
                <div class="diag-line">> Aguardando comando para iniciar varredura técnica...</div>
            </div>
            
            <div class="card" style="margin-top:24px; background:rgba(255,255,255,0.02)">
                <div style="font-size:12px; font-weight:700; color:var(--accent); text-transform:uppercase; margin-bottom:12px">Informações da Sessão Admin</div>
                <div style="font-family:'JetBrains Mono',monospace; font-size:13px; line-height:1.8">
                    <div>CLIENT_ID: <span style="color:var(--text-primary)">${state.lojaId}</span></div>
                    <div>GATEWAY: <span style="color:var(--text-primary)">${API}</span></div>
                    <div>VERSION: <span style="color:var(--text-primary)">4.0.0-PRO</span></div>
                </div>
            </div>
        </div>
    </div>`;
}

async function runFullDiagnostics() {
    const out = document.getElementById('diagOutput');
    const btn = document.getElementById('btnRunDiag');
    if (!out || !btn) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando...';
    out.innerHTML = '';

    const log = (msg, type = 'info') => {
        const time = new Date().toLocaleTimeString();
        const html = `
            <div class="diag-line">
                <span class="diag-time">[${time}]</span>
                <span class="diag-${type}">${msg}</span>
            </div>`;
        out.innerHTML += html;
        out.scrollTop = out.scrollHeight;
    };

    log('Iniciando sequência de diagnósticos para ' + state.lojaId, 'accent');
    
    try {
        log('Testando conexão com Servidor Central...', 'info');
        const res = await api.get('/admin/diagnostics/' + state.lojaId);
        
        log('LLM Groq: ' + (res.llm?.groq === 'ok' ? '✓ Operacional' : '✗ Falha'), res.llm?.groq === 'ok' ? 'success' : 'error');
        log('LLM Gemini: ' + (res.llm?.gemini === 'ok' ? '✓ Operacional' : '✗ Falha'), res.llm?.gemini === 'ok' ? 'success' : 'error');
        log('Supabase DB: ' + (res.supabase?.agentes_config === 'ok' ? '✓ Conectado' : '✗ Erro de acesso'), res.supabase?.agentes_config === 'ok' ? 'success' : 'error');
        log('Base RAG: ' + (res.rag?.documentos || 0) + ' documentos encontrados', 'info');
        
        if (res.rag?.documentos === 0) log('AVISO: Cliente sem base de conhecimento ativa.', 'warning');
        
        log('Varredura finalizada. Sistema operando conforme esperado.', 'success');
    } catch (e) {
        log('ERRO CRÍTICO: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> Iniciar Varredura';
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MORE (mobile)
// ══════════════════════════════════════════════════════════════════════════════

async function renderMore() {
    const c = document.getElementById('pageContent');
    const isAdmin = state.admin?.isSuperAdmin === true;
    const roleLabel = isAdmin ? '👑 Super Admin' : (state.user?.role === 'admin' ? '💼 Dono da Loja' : '💼 Gestor');

    // Mapeamento de ícones e descrições para o menu "Mais"
    const menuConfig = {
        agente: { icon: 'fa-robot', title: 'Agente & Prompt', sub: 'Comportamento da IA' },
        rag: { icon: 'fa-brain', title: 'Cérebro (RAG)', sub: 'Base de conhecimento' },
        scraping: { icon: 'fa-globe', title: 'Web Scraping', sub: 'Extração de dados' },
        whatsapp: { icon: 'fa-whatsapp', title: 'WhatsApp', sub: 'Conexão e status' },
        clientes: { icon: 'fa-building', title: 'Gestão de Clientes', sub: 'Administrar lojas' },
        equipe: { icon: 'fa-user-shield', title: 'Permissões', sub: 'Membros e cargos' },
        diagnostics: { icon: 'fa-tools', title: 'Diagnóstico', sub: 'Saúde do sistema' },
        contatos: { icon: 'fa-users', title: 'Leads', sub: 'Gestão de contatos' },
        catalogo: { icon: 'fa-shopping-bag', title: 'Catálogo', sub: 'Produtos e preços' }
    };

    const role = state.user?.role?.toLowerCase() || 'vendedor';
    const userPermissions = isAdmin ? PERMISSIONS.superadmin : (PERMISSIONS[role] || PERMISSIONS.vendedor);

    // Filtrar páginas que já estão na bottom nav para não repetir (dashboard, whatsapp, conversas, rag)
    const hiddenPages = ['dashboard', 'conversas', 'whatsapp', 'rag', 'more'];
    const extraPages = userPermissions.filter(p => !hiddenPages.includes(p));

    let menuHtml = '';
    extraPages.forEach(page => {
        const conf = menuConfig[page];
        if (conf) {
            menuHtml += `
            <div class="more-item" onclick="navigate('${page}')">
                <i class="fas ${conf.icon}"></i>
                <div class="more-item-content">
                    <div class="more-item-title">${conf.title}</div>
                    <div class="more-item-sub">${conf.sub}</div>
                </div>
                <i class="fas fa-chevron-right more-arrow"></i>
            </div>`;
        }
    });

    c.innerHTML = `
    <div class="page-wrapper">
        <div class="page-header">
            <h1 class="page-title">Mais Opções</h1>
        </div>
        <div class="page-body">
            <div class="card" style="padding:0;overflow:hidden;margin-bottom:24px">
                <div style="padding:20px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:14px;background:var(--bg-secondary)">
                    <div class="sidebar-user-avatar" style="width:50px;height:50px;font-size:18px">${(state.user?.email || 'AD').substring(0, 2).toUpperCase()}</div>
                    <div>
                        <div style="font-weight:700;font-size:16px">${esc(state.user?.email || '')}</div>
                        <div style="font-size:12px;color:var(--text-secondary)">${roleLabel}</div>
                    </div>
                </div>

                <div class="more-menu">
                    ${menuHtml}
                    
                    <div class="more-item" onclick="toggleTheme()">
                        <i class="fas fa-adjust"></i>
                        <div class="more-item-content">
                            <div class="more-item-title">Alternar Tema</div>
                            <div class="more-item-sub">Modo claro / escuro</div>
                        </div>
                        <i class="fas fa-chevron-right more-arrow"></i>
                    </div>

                    <div class="more-item" onclick="doLogout()" style="color:var(--destructive)">
                        <i class="fas fa-sign-out-alt"></i>
                        <div class="more-item-content">
                            <div class="more-item-title">Sair</div>
                            <div class="more-item-sub">Encerrar sessão</div>
                        </div>
                        <i class="fas fa-chevron-right more-arrow"></i>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-title" style="margin-bottom:16px">Status do Sistema</div>
                <div style="display:flex;flex-direction:column;gap:12px">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border-color)">
                        <div style="font-size:13px;font-weight:600">Servidor Backend</div>
                        <div style="display:flex;align-items:center;gap:8px">
                            <div id="serverDotMore" class="status-dot online"></div>
                            <span id="serverStatusTextMore" style="font-size:12px;color:var(--text-secondary)">Conectado</span>
                        </div>
                    </div>
                    <div style="font-size:11px;color:var(--text-secondary);text-align:center">
                        Versão 4.0.5 — RoboTI BR by WavePod
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    try {
        await api.get('/admin/lojas');
        const dot = document.getElementById('serverDotMore');
        const txt = document.getElementById('serverStatusTextMore');
        if (dot) dot.className = 'status-dot online';
        if (txt) txt.textContent = 'Online';
    } catch {
        const dot = document.getElementById('serverDotMore');
        const txt = document.getElementById('serverStatusTextMore');
        if (dot) dot.className = 'status-dot offline';
        if (txt) txt.textContent = 'Offline';
    }
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

// ─── INICIALIZAÇÃO ──────────────────────────────────────────────────────────


async function initLojas() {
    try {
        const lojas = await api.get('/admin/lojas');
        state.lojas = lojas;
        if (lojas.length && !state.lojaId) {
            state.lojaId = lojas[0].id;
            state.loja = lojas[0];
        }
        populateLojaSelect();
        const topbar = document.getElementById('lojaNameTopbar');
        if (topbar) topbar.textContent = state.loja ? state.loja.nome : '';
    } catch (e) { console.error('[RoboTI] Erro ao carregar lojas:', e); }
} async function renderContatos() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }
    c.innerHTML = `
    <div class="page-wrapper">
        <div class="page-header">
            <div>
                <h1 class="page-title">Gestão de Leads (CRM)</h1>
                <p class="text-muted">Acompanhe a qualificação dos seus leads em tempo real.</p>
            </div>
            <div class="page-actions">
                <button class="btn btn-secondary" onclick="renderContatos()">
                    <i class="fas fa-sync-alt"></i> Atualizar Leads
                </button>
            </div>
        </div>
        <div class="page-body">
            <div id="crmLeadsList"><div class="spinner"></div></div>
        </div>
    </div>`;
    
    // Chamada para carregar os leads
    setTimeout(async () => {
        const el = document.getElementById('crmLeadsList');
        if (!el) return;
        try {
            const leads = await api.get('/cliente/leads/' + state.lojaId).catch(() => []);
            if (!leads || !leads.length) {
                el.innerHTML = `<div class="card" style="padding:64px; text-align:center">
                    <div style="font-size:48px; opacity:0.1; margin-bottom:16px">👤</div>
                    <h3>Nenhum lead capturado ainda</h3>
                    <p class="text-muted">Divulgue seu link e a IA começará a qualificar seus contatos.</p>
                </div>`;
                return;
            }
            el.innerHTML = `<div class="stats-grid">
                ${leads.map(l => `
                <div class="card" style="border:1px solid rgba(255,255,255,0.03); background:rgba(255,255,255,0.02)">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px">
                        <div style="display:flex; align-items:center; gap:12px">
                            <div style="width:40px; height:40px; border-radius:50%; background:var(--bg-primary); display:flex; align-items:center; justify-content:center; border:1px solid var(--border-color); color:var(--accent)">
                                <i class="fas fa-user"></i>
                            </div>
                            <div>
                                <div style="font-weight:700; font-size:14px">${esc(l.nome || l.numero_whatsapp)}</div>
                                <div style="font-size:11px; color:var(--text-secondary)">ID: ${esc(l.numero_whatsapp)}</div>
                            </div>
                        </div>
                        <div class="badge" style="background:rgba(255,215,0,0.1); color:var(--accent); font-size:9px">LEAD ATIVO</div>
                    </div>
                    <div style="background:var(--bg-primary); padding:10px; border-radius:8px; font-size:12px; margin-bottom:12px">
                        <div style="color:var(--text-secondary); font-size:10px; text-transform:uppercase; margin-bottom:4px">Última Interação</div>
                        <div>${new Date(l.updated_at || l.created_at).toLocaleString('pt-BR')}</div>
                    </div>
                    <button class="btn btn-secondary" style="width:100%; justify-content:center" onclick="state.selectedChat='${l.numero_whatsapp}'; navigate('conversas')">
                        <i class="fas fa-comments"></i> Abrir Conversa
                    </button>
                </div>`).join('')}
            </div>`;
        } catch (e) { el.innerHTML = errMsg(e); }
    }, 100);
}

async function renderCatalogo() {
    const c = document.getElementById('pageContent');
    if (!state.lojaId) { c.innerHTML = noLojaMsg(); return; }

    try {
        const produtos = await api.get('/cliente/catalogo/' + state.lojaId);

        c.innerHTML = `
        <div class="page-wrapper">
            <div class="page-header">
                <h1 class="page-title">Catálogo de Produtos</h1>
                <div class="page-actions">
                    <button class="btn btn-primary" onclick="openModalProduto()" style="height:36px; padding:0 16px; font-size:13px">
                        <i class="fas fa-plus"></i> Novo Produto
                    </button>
                </div>
            </div>
            <div class="stats-grid">
                ${produtos.map(p => `
                <div class="card" style="display:flex; flex-direction:column; gap:16px; border:1px solid rgba(255,255,255,0.03); background:rgba(255,255,255,0.02)">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start">
                        <div style="display:flex; align-items:center; gap:12px">
                            <div style="width:48px; height:48px; border-radius:12px; background:var(--bg-primary); border:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; font-size:20px; color:var(--accent)">
                                <i class="fas fa-box"></i>
                            </div>
                            <div style="min-width:0">
                                <div style="font-weight:700; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis" title="${esc(p.nome_produto)}">${esc(p.nome_produto)}</div>
                                <div style="font-size:11px; color:var(--text-secondary)">SKU: ${esc(p.sku || 'Sem SKU')}</div>
                            </div>
                        </div>
                        <div style="font-weight:800; font-size:16px; color:var(--accent); font-family:'Space Grotesk',sans-serif">
                            R$ ${Number(p.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                    
                    <div style="flex:1; font-size:13px; color:var(--text-secondary); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden">
                        ${esc(p.descricao || 'Nenhuma descrição fornecida.')}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:1px solid var(--border-color)">
                        <div class="badge" style="background:${p.disponivel_para_ia ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color:${p.disponivel_para_ia ? 'var(--success)' : 'var(--danger)'}; font-size:9px">
                            ${p.disponivel_para_ia ? 'IA ATIVA' : 'IA OFF'}
                        </div>
                        <div style="display:flex; gap:6px">
                            <button class="btn btn-secondary" style="width:32px; height:32px; padding:0" onclick="openModalProduto('${p.id}')" title="Editar">
                                <i class="fas fa-edit" style="font-size:12px"></i>
                            </button>
                            <button class="btn btn-ghost" style="width:32px; height:32px; padding:0; color:var(--danger)" onclick="deleteProduto('${p.id}')" title="Excluir">
                                <i class="fas fa-trash-alt" style="font-size:12px"></i>
                            </button>
                        </div>
                    </div>
                </div>`).join('')}
                ${!produtos.length ? `<div style="grid-column:1/-1; padding:64px; text-align:center; background:rgba(255,255,255,0.01); border-radius:16px; border:1px dashed var(--border-color)">
                    <div style="font-size:48px; opacity:0.1; margin-bottom:16px">📦</div>
                    <h3 style="margin-bottom:8px">Seu catálogo está vazio</h3>
                    <p class="text-muted">Cadastre produtos para que a IA possa realizar vendas.</p>
                </div>` : ''}
            </div>
            </div>
        </div>`;
    } catch (e) { c.innerHTML = errMsg(e); }
}

async function openModalProduto(id = null) {
    let p = { nome_produto: '', descricao: '', preco: '', sku: '', disponivel_para_ia: true };
    if (id) {
        try {
            const produtos = await api.get('/cliente/catalogo/' + state.lojaId);
            p = produtos.find(item => item.id === id) || p;
        } catch (e) { toast('Erro ao carregar produto', 'error'); return; }
    }

    const html = `
    <h2 class="card-title" style="margin-bottom:24px">${id ? 'Editar' : 'Novo'} Produto</h2>
    <div class="form-group">
        <label>Nome do Produto</label>
        <input type="text" class="form-input" id="p_nome" value="${esc(p.nome_produto)}" placeholder="Ex: iPhone 15 Pro">
    </div>
    <div class="form-group">
        <label>SKU (Código)</label>
        <input type="text" class="form-input" id="p_sku" value="${esc(p.sku)}" placeholder="Ex: IPH15P-256">
    </div>
    <div class="form-group">
        <label>Preço (R$)</label>
        <input type="number" step="0.01" class="form-input" id="p_preco" value="${p.preco}" placeholder="0,00">
    </div>
    <div class="form-group">
        <label>Descrição para a IA</label>
        <textarea class="form-textarea" id="p_desc" placeholder="Detalhes técnicos, cores, garantias...">${esc(p.descricao)}</textarea>
    </div>
    <div class="form-group" style="display:flex; align-items:center; gap:10px">
        <input type="checkbox" id="p_ia" ${p.disponivel_para_ia ? 'checked' : ''} style="width:20px; height:20px; accent-color:var(--accent)">
        <label style="margin:0">Disponível para consulta da IA</label>
    </div>
    <div style="display:flex; gap:12px; margin-top:32px">
        <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="saveProduto('${id || ''}')">Salvar Produto</button>
    </div>`;
    openModal(html);
}

async function saveProduto(id) {
    const payload = {
        id: id || undefined,
        numero_wa: state.lojaId,
        nome_produto: document.getElementById('p_nome').value,
        sku: document.getElementById('p_sku').value,
        preco: parseFloat(document.getElementById('p_preco').value) || 0,
        descricao: document.getElementById('p_desc').value,
        disponivel_para_ia: document.getElementById('p_ia').checked
    };

    if (!payload.nome_produto) { toast('Nome é obrigatório', 'error'); return; }

    try {
        await api.post('/cliente/catalogo', payload);
        toast('✅ Produto salvo com sucesso!');
        closeModal();
        renderCatalogo();
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteProduto(id) {
    if (!confirm('Deseja realmente excluir este produto?')) return;
    try {
        await api.delete('/cliente/catalogo/' + id);
        toast('🗑️ Produto excluído.');
        renderCatalogo();
    } catch (e) { toast(e.message, 'error'); }
}





function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';

    html.setAttribute('data-theme', next);
    localStorage.setItem('robotibr_theme', next);
    _applyThemeIcons(next);
    toast(`Modo ${next === 'dark' ? 'Escuro' : 'Claro'} ativado`);
}

function _applyThemeIcons(theme) {
    const isDark = theme === 'dark';

    // Login Screen icons
    const loginIcon = document.getElementById('loginThemeIcon');
    const loginLabel = document.getElementById('loginThemeLabel');
    if (loginIcon) loginIcon.textContent = isDark ? '☀️' : '🌙';
    if (loginLabel) loginLabel.textContent = isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro';

    // Topbar icon
    const topbarIcon = document.getElementById('themeToggleIcon');
    if (topbarIcon) topbarIcon.textContent = isDark ? '☀️' : '🌙';
}

async function init() {
    // 1. Aplica tema salvo (o anti-flash no HTML já aplica, mas atualizamos ícones aqui)
    const savedTheme = localStorage.getItem('robotibr_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    _applyThemeIcons(savedTheme);

    // 2. Verifica sessão salva
    const saved = localStorage.getItem('robotibr_session');
    if (saved) {
        try {
            const session = JSON.parse(saved);
            state.admin = session.admin;
            state.user = session.user;
            state.lojaId = session.lojaId;

            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('appScreen').style.display = 'flex';

            document.getElementById('sidebarUserEmail').textContent = state.user.email;

            const isAdmin = state.admin?.isSuperAdmin === true;
            const roleLabel = isAdmin ? 'Super Admin' : (state.user.role === 'admin' ? 'Dono da Loja' : (state.user.role.charAt(0).toUpperCase() + state.user.role.slice(1)));

            document.getElementById('sidebarUserRole').textContent = roleLabel;
            document.getElementById('sidebarUserAvatar').textContent =
                state.user.email.substring(0, 2).toUpperCase();

            applyPermissions();
        } catch {
            localStorage.removeItem('robotibr_session');
        }
    }

    // 3. Fecha modal ao clicar fora
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.addEventListener('click', e => {
            if (e.target === e.currentTarget) closeModal();
        });
    }

    // 4. Polling de status do servidor
    checkServer();
    setInterval(checkServer, 15000);

    // 5. Carrega lojas
    await initLojas();

    // 6. Rota inicial
    if (state.admin.logado || saved) {
        const isAdmin = state.admin?.isSuperAdmin === true;
        navigate(isAdmin ? 'clientes' : 'dashboard');
    }
}

function toggleSidebar() {
    const sb = document.querySelector('.sidebar');
    if (sb) sb.classList.toggle('active');
}

// Fecha o sidebar ao clicar fora no mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
        const sb = document.querySelector('.sidebar');
        const btn = document.getElementById('mobileMenuBtn');
        if (sb && sb.classList.contains('active') && !sb.contains(e.target) && !btn.contains(e.target)) {
            sb.classList.remove('active');
        }
    }
});

// ─── BUSCA GLOBAL ────────────────────────────────────────────────────────────
function openGlobalSearch() {
    const overlay = document.getElementById('searchOverlay');
    const input = document.getElementById('globalSearchInput');
    if (overlay) overlay.classList.add('active');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 50);
    }
    renderSearchResults([]);
}

function closeGlobalSearch() {
    const overlay = document.getElementById('searchOverlay');
    if (overlay) overlay.classList.remove('active');
}

function handleGlobalSearch(q) {
    if (!q || q.length < 2) return renderSearchResults([]);
    
    const results = [];
    const query = q.toLowerCase();

    // 1. Páginas
    const PAGES = [
        { id: 'dashboard', title: 'Dashboard', icon: 'fa-th-large' },
        { id: 'conversas', title: 'Conversas / Omnichat', icon: 'fa-comments' },
        { id: 'whatsapp', title: 'Conexão WhatsApp', icon: 'fa-whatsapp' },
        { id: 'clientes', title: 'Gestão de Clientes', icon: 'fa-building' },
        { id: 'agente', title: 'Configurar Agente IA', icon: 'fa-robot' },
        { id: 'rag', title: 'Base de Conhecimento', icon: 'fa-brain' },
        { id: 'diagnostics', title: 'Diagnóstico do Sistema', icon: 'fa-tools' }
    ];

    PAGES.forEach(p => {
        if (p.title.toLowerCase().includes(query) || p.id.includes(query)) {
            results.push({ ...p, type: 'Página' });
        }
    });

    // 2. Contatos (se carregados)
    if (typeof _ocContacts !== 'undefined') {
        _ocContacts.forEach(c => {
            if ((c.nome || '').toLowerCase().includes(query) || (c.numero_cliente || '').includes(query)) {
                results.push({ 
                    id: c.id, 
                    title: c.nome || c.numero_cliente, 
                    meta: c.numero_cliente,
                    type: 'Contato',
                    icon: 'fa-user',
                    action: () => { navigate('conversas'); setTimeout(() => ocSelectContact(c.id), 100); }
                });
            }
        });
    }

    renderSearchResults(results);
}

function renderSearchResults(results) {
    const el = document.getElementById('globalSearchResults');
    if (!el) return;

    if (!results.length) {
        el.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-secondary); font-size:13px">
            Busque por páginas (ex: "ia", "chat") ou contatos...
        </div>`;
        return;
    }

    el.innerHTML = results.map(r => `
        <div class="search-item" onclick="handleSearchResultClick('${esc(r.id)}', '${r.type}')">
            <div class="search-item-icon"><i class="fas ${r.icon}"></i></div>
            <div class="search-item-info">
                <div class="search-item-title">${esc(r.title)}</div>
                <div class="search-item-meta">${esc(r.type)}${r.meta ? ' • ' + esc(r.meta) : ''}</div>
            </div>
            <i class="fas fa-chevron-right" style="font-size:10px; opacity:0.3"></i>
        </div>
    `).join('');

    // Armazena ações temporariamente para o clique
    window._lastSearchResults = results;
}

function handleSearchResultClick(id, type) {
    const res = window._lastSearchResults.find(r => r.id === id && r.type === type);
    closeGlobalSearch();
    if (res) {
        if (res.action) res.action();
        else navigate(res.id);
    }
}

// Atalhos de Teclado
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openGlobalSearch();
    }
    if (e.key === 'Escape') {
        closeGlobalSearch();
    }
});

document.addEventListener('DOMContentLoaded', init);