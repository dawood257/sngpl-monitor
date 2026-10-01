/* ═══════════════════════════════════════════════════════════════════
   SNGLP — Dashboard V3 Shell (Sidebar + Topbar + Hero)
   Non-destructive: adds chrome above existing content.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // Icons as inline SVG
  var ICONS = {
    dash:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><line x1="7" y1="7.5" x2="7.01" y2="7.5"/><line x1="7" y1="16.5" x2="7.01" y2="16.5"/></svg>',
    sess:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    inc:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    chart:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="20" x2="21" y2="20"/><polyline points="5 16 10 11 14 15 20 8"/></svg>',
    gear:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    bell:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    user:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
  };

  // Sanity check
  if (!document.documentElement.hasAttribute('data-dashboard') ||
      document.documentElement.getAttribute('data-dashboard') !== 'v3') {
    return;
  }

  var _heroTimer = null;

  function txt(id) {
    var el = document.getElementById(id);
    return el ? (el.textContent || '').trim() : '';
  }
  function num(id) {
    var v = txt(id);
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  }

  function buildSidebar() {
    if (document.getElementById('v3-side')) return;
    var a = document.createElement('aside');
    a.id = 'v3-side';
    a.innerHTML = [
      '<div class="v3-brand">',
      '  <div class="v3-brand__logo">S</div>',
      '  <div>',
      '    <div class="v3-brand__name">SNGLP Monitor</div>',
      '    <div class="v3-brand__sub">Infrastructure</div>',
      '  </div>',
      '</div>',
      '<div class="v3-nav-label">Overview</div>',
      '<nav class="v3-nav">',
      '  <a class="v3-nav__item active" data-target="dashboard">' + ICONS.dash + '<span>Dashboard</span></a>',
      '  <a class="v3-nav__item" data-target="servers">' + ICONS.server + '<span>Servers</span><span class="v3-nav__badge" id="v3-badge-servers">8</span></a>',
      '  <a class="v3-nav__item" data-target="sessions">' + ICONS.sess + '<span>Sessions</span><span class="v3-nav__badge" id="v3-badge-sessions">0</span></a>',
      '  <a class="v3-nav__item" data-target="incidents">' + ICONS.inc + '<span>Incidents</span><span class="v3-nav__badge" id="v3-badge-incidents">0</span></a>',
      '  <a class="v3-nav__item" data-target="activity">' + ICONS.chart + '<span>Activity</span></a>',
      '</nav>',
      '<div class="v3-nav-label">System</div>',
      '<nav class="v3-nav">',
      '  <a class="v3-nav__item" id="v3-nav-settings">' + ICONS.gear + '<span>Preferences</span></a>',
      '</nav>',
      '<div class="v3-side__foot">',
      '  <div class="v3-user" id="v3-user">',
      '    <div class="v3-user__avatar" id="v3-user-av">A</div>',
      '    <div class="v3-user__info">',
      '      <div class="v3-user__name" id="v3-user-name">Admin</div>',
      '      <div class="v3-user__role" id="v3-user-role">Administrator</div>',
      '    </div>',
      '    <span style="color:var(--v3-fg-3)" id="v3-user-logout">' + ICONS.logout + '</span>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(a);

    // Wire nav clicks to scroll
    a.querySelectorAll('.v3-nav__item[data-target]').forEach(function(el){
      el.addEventListener('click', function(e){
        e.preventDefault();
        a.querySelectorAll('.v3-nav__item').forEach(function(x){ x.classList.remove('active'); });
        el.classList.add('active');
        var t = el.getAttribute('data-target');
        var sel = { dashboard: '#kpiGrid', servers: '.servers-grid, .server-grid', sessions: '#sessionsBtn', incidents: '.incident-item, #incidentCenter', activity: '#kpiGrid' }[t];
        var node = sel ? document.querySelector(sel) : null;
        if (node && node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (t === 'sessions' && document.getElementById('sessionsBtn')) document.getElementById('sessionsBtn').click();
      });
    });

    // Settings click → trigger preferences
    var st = a.querySelector('#v3-nav-settings');
    if (st) st.addEventListener('click', function(){
      var b = document.getElementById('sngplPrefsBtn');
      if (b) b.click();
      else if (window.__settingsUI) window.__settingsUI.open();
    });

    // Logout click
    var lo = a.querySelector('#v3-user-logout');
    if (lo) lo.addEventListener('click', function(){
      if (window.logout) window.logout();
    });

    // Fill user info
    try {
      var token = localStorage.getItem('sngpl_token');
      if (token) {
        var payload = JSON.parse(atob(token.split('.')[1]));
        var name = payload.sub || payload.user || payload.username || 'Admin';
        document.getElementById('v3-user-name').textContent = name;
        document.getElementById('v3-user-av').textContent = name.slice(0,1).toUpperCase();
        var role = (payload.role || 'admin').toString();
        document.getElementById('v3-user-role').textContent = role.charAt(0).toUpperCase() + role.slice(1);
      }
    } catch(e){}
  }

  function buildTopbar() {
    if (document.getElementById('v3-top')) return;
    var t = document.createElement('header');
    t.id = 'v3-top';
    t.innerHTML = [
      '<div class="v3-search">',
      ICONS.search,
      '  <input type="text" placeholder="Search servers, incidents, sessions…" id="v3-search-input">',
      '</div>',
      '<div class="v3-top__actions">',
      '  <span class="v3-live"><span class="v3-live__dot"></span>Live</span>',
      '  <span class="v3-clock" id="v3-clock">--:--:--</span>',
      '  <button class="v3-action" id="v3-act-refresh" title="Refresh">' + ICONS.refresh + '</button>',
      '  <button class="v3-action" id="v3-act-bell" title="Alerts">' + ICONS.bell + '<span class="v3-action__badge" id="v3-bell-badge" style="display:none">0</span></button>',
      '  <button class="v3-action" id="v3-act-prefs" title="Preferences">' + ICONS.gear + '</button>',
      '</div>'
    ].join('');
    document.body.appendChild(t);

    // Wire actions
    var rf = document.getElementById('v3-act-refresh');
    if (rf) rf.onclick = function(){ if (window.refresh) window.refresh(); else location.reload(); };
    var bl = document.getElementById('v3-act-bell');
    if (bl) bl.onclick = function(){ var b = document.getElementById('bellBtn'); if (b) b.click(); };
    var pr = document.getElementById('v3-act-prefs');
    if (pr) pr.onclick = function(){
      var b = document.getElementById('sngplPrefsBtn');
      if (b) b.click();
      else if (window.__settingsUI) window.__settingsUI.open();
    };
    var si = document.getElementById('v3-search-input');
    if (si) si.addEventListener('keydown', function(e){
      if (e.key === 'Enter') {
        var q = si.value.trim().toLowerCase();
        if (!q) return;
        var cards = document.querySelectorAll('.server-card');
        for (var i=0;i<cards.length;i++){
          if ((cards[i].textContent||'').toLowerCase().indexOf(q) >= 0){
            cards[i].scrollIntoView({behavior:'smooth', block:'center'});
            cards[i].style.outline = '2px solid var(--v3-cyan)';
            setTimeout(function(el){ el.style.outline=''; }.bind(null, cards[i]), 2400);
            break;
          }
        }
      }
    });

    // Clock
    function tickClock() {
      var el = document.getElementById('v3-clock');
      if (!el) return;
      var d = new Date();
      var hh = String(d.getHours()).padStart(2,'0');
      var mm = String(d.getMinutes()).padStart(2,'0');
      var ss = String(d.getSeconds()).padStart(2,'0');
      el.textContent = hh + ':' + mm + ':' + ss;
    }
    tickClock();
    setInterval(tickClock, 1000);
  }

  function buildHero() {
    if (document.getElementById('v3-hero')) return;
    var app = document.getElementById('app');
    if (!app) return;

    var h = document.createElement('section');
    h.className = 'v3-hero';
    h.id = 'v3-hero';
    h.innerHTML = [
      '<div class="v3-hero__orb"><span class="v3-hero__orb-val" id="v3-hero-avail">—%</span></div>',
      '<div class="v3-hero__body">',
      '  <div class="v3-hero__title">Fleet Health</div>',
      '  <div class="v3-hero__sub" id="v3-hero-sub">Reading from sensors…</div>',
      '</div>',
      '<div class="v3-hero__stats">',
      '  <div class="v3-hero__stat v3-hero__stat--ok">',
      '    <div class="v3-hero__stat-val" id="v3-hs-ok">—</div>',
      '    <div class="v3-hero__stat-lab">Healthy</div>',
      '  </div>',
      '  <div class="v3-hero__stat v3-hero__stat--warn">',
      '    <div class="v3-hero__stat-val" id="v3-hs-warn">—</div>',
      '    <div class="v3-hero__stat-lab">Warning</div>',
      '  </div>',
      '  <div class="v3-hero__stat v3-hero__stat--crit">',
      '    <div class="v3-hero__stat-val" id="v3-hs-crit">—</div>',
      '    <div class="v3-hero__stat-lab">Critical</div>',
      '  </div>',
      '  <div class="v3-hero__stat">',
      '    <div class="v3-hero__stat-val" id="v3-hs-total">—</div>',
      '    <div class="v3-hero__stat-lab">Total</div>',
      '  </div>',
      '</div>'
    ].join('');
    app.insertBefore(h, app.firstChild);

    refreshHero();
    _heroTimer = setInterval(refreshHero, 3000);
  }

  function refreshHero() {
    var total = num('kpiTotal');
    var ok    = num('kpiHealthy');
    var warn  = num('kpiWarning');
    var crit  = num('kpiCritical');
    var off   = num('kpiOffline');

    var setTxt = function(id, v){ var el=document.getElementById(id); if(el) el.textContent = v; };
    setTxt('v3-hs-ok', ok);
    setTxt('v3-hs-warn', warn);
    setTxt('v3-hs-crit', crit);
    setTxt('v3-hs-total', total);

    var availEl = document.querySelector('.avail-value, [class*="avail-value"]');
    var avail = availEl ? availEl.textContent.trim() : '';
    if (!avail && total > 0) avail = Math.round((ok / total) * 100) + '%';
    setTxt('v3-hero-avail', avail || '—');

    var sub = 'Across ' + total + ' servers · ' + ok + ' healthy, ' + warn + ' warning, ' + crit + ' critical' + (off ? ', ' + off + ' offline' : '');
    setTxt('v3-hero-sub', sub);

    // Update sidebar badges
    var sB = document.getElementById('v3-badge-servers'); if (sB) sB.textContent = total;
    var iB = document.getElementById('v3-badge-incidents'); if (iB) iB.textContent = warn + crit;
    var ssB = document.getElementById('v3-badge-sessions');
    if (ssB) { var sc = document.getElementById('ssCount'); ssB.textContent = sc ? sc.textContent.trim() : '0'; }
    var bellB = document.getElementById('v3-bell-badge');
    if (bellB) {
      var bc = document.getElementById('bellCount');
      if (bc && bc.style.display !== 'none' && bc.textContent.trim() !== '0') {
        bellB.style.display = '';
        bellB.textContent = bc.textContent.trim();
      } else {
        bellB.style.display = 'none';
      }
    }

    // Update hero orb color based on crit
    var orb = document.getElementById('v3-hero-avail');
    if (orb && orb.parentElement) {
      orb.parentElement.style.background = crit > 0
        ? 'radial-gradient(circle, #FB7185 0%, rgba(251,113,133,0.15) 55%, transparent 70%)'
        : warn > 0
        ? 'radial-gradient(circle, #FBBF24 0%, rgba(251,191,36,0.15) 55%, transparent 70%)'
        : 'radial-gradient(circle, #34D399 0%, rgba(52,211,153,0.15) 55%, transparent 70%)';
      orb.style.color = crit > 0 ? '#FB7185' : warn > 0 ? '#FBBF24' : '#34D399';
    }
  }

  function boot() {
    try {
      buildSidebar();
      buildTopbar();

      // Wait for #app to be populated (login → dashboard)
      var tries = 0;
      function tryHero(){
        tries++;
        if (document.getElementById('app') && document.getElementById('kpiTotal')) {
          buildHero();
        } else if (tries < 120) {
          setTimeout(tryHero, 500);
        }
      }
      tryHero();
      console.log('[v3] boot complete');
    } catch (e) {
      console.error('[v3] boot failed:', e);
      // Safety: if boot fails, drop the attribute so original dashboard shows
      document.documentElement.removeAttribute('data-dashboard');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
