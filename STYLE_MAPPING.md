# MAPEAMENTO DE ESTILO (LAYOUT & RESPONSIVIDADE) - style.css

Este documento contém a extração das regras de CSS responsáveis pela estrutura, layout e comportamento responsivo da plataforma RoboTI-BR.

---

# 1. LAYOUT PRINCIPAL

```css
.app-layout {
    display: flex;
    min-height: 100vh;
}

.main-content {
    margin-left: 260px;
    flex: 1;
    display: flex;
    flex-direction: column;
    background: transparent;
    padding: 0;
    overflow: hidden;
}

.page-content {
    flex: 1;
    padding: 32px;
    width: 100%;
    animation: fadeIn 0.3s ease;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* Important for inner scrolls */
}

/* Fix for full-screen components like Omnichat */
.page-content:has(.omnichat-layout), 
.page-content:has(.whatsapp-layout) {
    padding: 0 !important;
    height: calc(100vh - 72px); /* Subtract topbar height */
}

.topbar {
    height: 72px;
    background: rgba(17, 24, 39, 0.4);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 32px;
    position: sticky;
    top: 0;
    z-index: 50;
}
```

---

# 2. SIDEBAR (DESKTOP)

```css
.sidebar {
    width: 260px;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--sidebar-border);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 100;
    overflow-y: auto;
}

.sidebar-brand {
    padding: 28px 24px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
}

.sidebar-nav {
    flex: 1;
    padding: 0 10px 12px;
}

.nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    color: var(--sidebar-muted);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
    margin-bottom: 1px;
}

.nav-item.active {
    color: var(--sidebar-bg);
    background: var(--primary);
    font-weight: 600;
}

.sidebar-bottom {
    flex-shrink: 0;
    border-top: 1px solid var(--sidebar-border);
}
```

---

# 3. MOBILE (CRÍTICO)

```css
/* Force hide bottom nav on desktop */
@media (min-width: 993px) {
    .bottom-nav {
        display: none !important;
    }
}

/* ══ MOBILE RESPONSIVENESS (OFF-CANVAS & CLEANUP) ═══════════════════════════ */
@media (max-width: 768px) {
    :root {
        --sidebar-width: 0px; 
    }

    .bottom-nav {
        display: flex !important;
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 70px;
        background: rgba(17, 24, 39, 0.95);
        backdrop-filter: blur(12px);
        border-top: 1px solid var(--border);
        display: flex;
        justify-content: space-around;
        align-items: center;
        z-index: 1000;
        padding: 0 10px;
    }

    /* Blindagem Desktop: Garante que o menu principal suma APENAS no mobile */
    .sidebar {
        display: none !important;
    }

    .main-content {
        margin-left: 0 !important;
        padding-bottom: 80px; 
    }

    .topbar {
        padding: 0 16px;
        height: 64px;
        position: sticky;
        top: 0;
        background: rgba(17, 24, 39, 0.8);
        backdrop-filter: blur(12px);
    }

    /* Mobile Sidebar (Off-canvas) - Fundo Cinza Técnico */
    .mobile-sidebar {
        display: flex !important;
        position: fixed;
        top: 0;
        right: -300px;
        width: 300px;
        height: 100vh;
        background: #2a2a2a; 
        z-index: 2001;
        transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        padding: 30px 24px;
        flex-direction: column;
        border-left: 1px solid rgba(255, 255, 255, 0.05);
    }

    .mobile-sidebar.active {
        transform: translateX(-300px);
    }

    .mobile-sidebar-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(8px);
        z-index: 2000;
        display: none;
        animation: fadeIn 0.2s ease;
    }

    .mobile-sidebar-overlay.active {
        display: block;
    }
}
```

---

# 4. OMNICHAT / CHAT

```css
.omnichat-layout {
    display: flex;
    height: calc(100vh - 72px) !important;
    width: 100%;
    overflow: hidden !important;
    background: #0b0b0c;
}

.oc-sidebar-panel {
    width: 320px;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    background: var(--sidebar-bg);
    overflow: hidden;
}

.oc-chat-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: transparent;
    overflow: hidden;
    height: 100%;
}

.oc-messages-area {
    flex: 1 !important;
    overflow-y: auto !important;
    padding: 30px !important;
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: relative;
    background-color: #0b0b0c !important;
}

.oc-bubble {
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.5;
    position: relative;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}

.oc-bubble.user {
    background: #27272a;
    color: #ffffff;
    border-bottom-left-radius: 2px;
}

.oc-bubble.assistant {
    background: linear-gradient(135deg, #FFD700 0%, #D4AF37 100%);
    color: #000000;
    border-bottom-right-radius: 2px;
}
```

---

# 5. DASHBOARD

```css
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 20px;
    margin-bottom: 24px;
}

.stat-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 120px;
}

.stat-value {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 32px;
    font-weight: 700;
    color: var(--foreground);
    letter-spacing: -0.04em;
    line-height: 1;
}
```

---

# 6. BOTÕES E COMPONENTES

```css
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 9px 17px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: 0.15s;
    border: none;
}

.btn-primary {
    background: var(--primary);
    color: var(--primary-foreground);
}

.form-input, .form-textarea, .form-select {
    width: 100%;
    background: var(--card);
    border: 1px solid var(--input);
    border-radius: var(--radius-sm);
    padding: 10px 13px;
    font-size: 13px;
    color: var(--foreground);
}
```

---

# 7. VARIÁVEIS CSS

```css
:root {
    --primary: #FFD700;
    --primary-glow: rgba(255, 215, 0, 0.1);
    --secondary: #1e293b;
    --background: #0a0a0b;
    --foreground: #f8fafc;
    --card: rgba(17, 24, 39, 0.8);
    --muted: #1f2937;
    --border: rgba(148, 163, 184, 0.15);
    --sidebar-bg: #0d1117;
    --radius: 8px;
    --shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}
```
