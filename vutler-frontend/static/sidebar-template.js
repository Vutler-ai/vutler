(function () {
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function ensureStyle() {
    if (document.getElementById('vutler-shared-sidebar-style')) return;
    const st = document.createElement('style');
    st.id = 'vutler-shared-sidebar-style';
    st.textContent = `
.sidebar-link{display:flex;align-items:center;gap:.75rem;padding:.625rem .75rem;border-radius:.5rem;color:#94a3b8;font-size:14px;line-height:20px;font-weight:500;transition:all .15s;min-height:40px}
.sidebar-link:hover{background:rgba(255,255,255,.05);color:#e2e8f0}
.sidebar-link.active{background:rgba(59,130,246,.15);color:#3B82F6}
.sidebar-link i,.sidebar-link [data-lucide]{width:18px;height:18px;min-width:18px;min-height:18px;stroke-width:1.75}
`;
    document.head.appendChild(st);
  }

  function item(path, icon, label, active) {
    return `<a href="${path}" class="sidebar-link${active ? ' active' : ''}"><i data-lucide="${icon}"></i> ${label}</a>`;
  }

  function build(active) {
    return `
<aside id="primary-sidebar" class="w-60 bg-navy-light border-r border-white/5 flex flex-col h-screen shrink-0" style="background:#111d33">
  <div class="p-4 border-b border-white/5">
    <a href="/dashboard" class="flex items-center gap-2"><img src="/static/vutler-logo-full-white.png" alt="Vutler" style="height:36px"></a>
  </div>
  <nav class="flex-1 p-3 space-y-0.5 overflow-y-auto text-sm" id="sidebar-nav">
    ${item('/dashboard','layout-dashboard','Dashboard',active==='dashboard')}
    ${item('/agents','bot','Agents',active==='agents')}
    ${item('/chat','message-square','Chat',active==='chat')}
    ${item('/drive','folder','Drive',active==='drive')}
    ${item('/integrations','plug','Integrations',active==='integrations')}
    ${item('/tasks','check-square','Tasks',active==='tasks')}
    ${item('/mail','mail','Mail',active==='mail')}
    ${item('/calendar','calendar','Calendar',active==='calendar')}
    ${item('/nexus','cpu','Nexus',active==='nexus')}
    ${item('/crm','users','CRM',active==='crm')}
    ${item('/audit','scroll-text','Audit Logs',active==='audit')}
    ${item('/sandbox','terminal','Sandbox',active==='sandbox')}
    ${item('/marketplace','store','Marketplace',active==='marketplace')}
  </nav>
  <div class="p-3 border-t border-white/5 space-y-1">
    ${item('/settings','settings','Settings',active==='settings')}
    ${item('/billing','credit-card','Billing',active==='billing')}
    <button id="theme-toggle" onclick="toggleTheme()" class="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg w-full transition-colors mb-1">
      <span id="theme-icon">🌙</span>
      <span id="theme-label">Dark</span>
    </button>
    <div class="flex items-center gap-2 px-3 py-2 mt-2">
      <div class="w-8 h-8 rounded-full bg-[#3B82F6]/20 flex items-center justify-center text-sm font-bold text-white">AL</div>
      <div class="flex-1 min-w-0"><div class="text-sm font-medium truncate" id="user-display-name">Alex Lopez</div><div class="text-xs text-slate-500">Starbox</div></div>
      <button onclick="if(typeof logout==='function')logout();else location.href='/login'" class="text-slate-500 hover:text-slate-300" title="Logout"><i data-lucide="log-out" style="width:16px;height:16px"></i></button>
    </div>
  </div>
</aside>`;
  }

  window.__VUTLER_SIDEBAR_BOOT = function () {
    ensureStyle();
    const active = window.__VUTLER_SIDEBAR_ACTIVE || '';
    const existing = document.querySelector('aside');
    if (!existing) return;
    existing.outerHTML = build(active);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  };
})();
