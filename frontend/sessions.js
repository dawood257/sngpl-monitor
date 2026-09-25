/* ============================================================
   Sessions Tab — Phase 1 (SSH Sessions)
   Self-contained: injects header button + modal dynamically.
   ============================================================ */
(function(){
  'use strict';

  var _open = false;
  var _timer = null;
  var _filter = 'all';
  var _cache = [];

  // ── CSS (injected once) ──
  function injectCSS() {
    if (document.getElementById('sessions-css')) return;
    var st = document.createElement('style');
    st.id = 'sessions-css';
    st.textContent = `
      #sessionsBtn{background:#1e293b;color:#e2e8f0;border:1px solid #334155;
        padding:7px 12px;border-radius:6px;cursor:pointer;font-size:13px;
        font-weight:600;transition:.15s;position:relative;display:inline-flex;
        align-items:center;gap:6px;margin-right:4px}
      #sessionsBtn:hover{background:#334155;border-color:#475569}
      #sessionsBtn .ss-count{background:#3b82f6;color:#fff;font-size:10px;
        padding:1px 6px;border-radius:9px;font-weight:700;min-width:18px;
        text-align:center;display:none}
      #sessionsBtn.has-data .ss-count{display:inline-block}

      .ss-overlay{position:fixed;inset:0;background:rgba(2,6,23,.75);
        backdrop-filter:blur(3px);z-index:9000;display:none;
        align-items:flex-start;justify-content:center;padding:60px 20px 20px}
      .ss-overlay.open{display:flex}

      .ss-modal{background:#0f172a;border:1px solid #334155;border-radius:12px;
        width:min(1000px,100%);max-height:calc(100vh - 100px);display:flex;
        flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6);
        animation:ssFadeIn .18s ease-out}
      @keyframes ssFadeIn{from{opacity:0;transform:translateY(-8px)}
        to{opacity:1;transform:none}}

      .ss-head{padding:18px 22px;border-bottom:1px solid #1e293b;
        display:flex;align-items:center;justify-content:space-between}
      .ss-head h2{margin:0;font-size:16px;font-weight:700;color:#f1f5f9;
        display:flex;align-items:center;gap:10px}
      .ss-head .ss-sub{font-size:11px;color:#64748b;font-weight:400}
      .ss-close{background:transparent;border:0;color:#94a3b8;font-size:20px;
        cursor:pointer;padding:4px 10px;border-radius:6px;line-height:1}
      .ss-close:hover{background:#1e293b;color:#f1f5f9}

      .ss-filters{padding:12px 22px;border-bottom:1px solid #1e293b;
        display:flex;gap:8px;flex-wrap:wrap}
      .ss-chip{background:#1e293b;color:#cbd5e1;border:1px solid #334155;
        padding:5px 12px;border-radius:16px;font-size:12px;font-weight:600;
        cursor:pointer;transition:.15s}
      .ss-chip:hover{border-color:#475569;color:#f1f5f9}
      .ss-chip.active{background:#3b82f6;color:#fff;border-color:#3b82f6}

      .ss-body{padding:6px 0 0;overflow:auto;flex:1}
      .ss-table{width:100%;border-collapse:collapse;font-size:13px}
      .ss-table thead th{position:sticky;top:0;background:#0f172a;
        text-align:left;padding:10px 16px;color:#94a3b8;font-size:11px;
        font-weight:600;text-transform:uppercase;letter-spacing:.4px;
        border-bottom:1px solid #1e293b;z-index:2}
      .ss-table tbody td{padding:11px 16px;border-bottom:1px solid #1e293b;
        color:#e2e8f0;vertical-align:middle}
      .ss-table tbody tr:hover{background:#111c33}

      .ss-os{display:inline-block;font-size:10px;font-weight:700;
        padding:2px 7px;border-radius:4px;letter-spacing:.3px}
      .ss-os.linux{background:#1e3a8a;color:#bfdbfe}
      .ss-os.aix{background:#7c2d12;color:#fed7aa}

      .ss-ip{font-family:'SF Mono',Consolas,monospace;font-size:12px;
        color:#93c5fd;background:#0c1e3d;padding:2px 8px;border-radius:4px}
      .ss-user{font-weight:600;color:#f1f5f9}
      .ss-empty{text-align:center;padding:60px 20px;color:#64748b}
      .ss-empty-icon{font-size:42px;margin-bottom:10px;opacity:.4}

      .ss-foot{padding:12px 22px;border-top:1px solid #1e293b;
        display:flex;justify-content:space-between;align-items:center;
        font-size:11px;color:#64748b}
      .ss-refresh{background:transparent;border:1px solid #334155;color:#cbd5e1;
        padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px;
        font-weight:600}
      .ss-refresh:hover{background:#1e293b;color:#f1f5f9}
    `;
    document.head.appendChild(st);
  }

  // ── Header button ──
  function injectButton() {
    if (document.getElementById('sessionsBtn')) return;
    var bell = document.getElementById('bellBtn');
    if (!bell || !bell.parentNode) return;
    var btn = document.createElement('button');
    btn.id = 'sessionsBtn';
    btn.title = 'Active SSH sessions across servers';
    btn.innerHTML = '👥 <span class="ss-count" id="ssCount">0</span>';
    btn.onclick = open;
    bell.parentNode.insertBefore(btn, bell);
  }

  // ── Modal HTML ──
  function injectModal() {
    if (document.getElementById('ssOverlay')) return;
    var ov = document.createElement('div');
    ov.className = 'ss-overlay';
    ov.id = 'ssOverlay';
    ov.innerHTML = `
      <div class="ss-modal" onclick="event.stopPropagation()">
        <div class="ss-head">
          <h2>👥 Active SSH Sessions <span class="ss-sub" id="ssHeadSub"></span></h2>
          <button class="ss-close" onclick="window.__sessions.close()">✕</button>
        </div>
        <div class="ss-filters">
          <button class="ss-chip active" data-f="all">All</button>
          <button class="ss-chip" data-f="Linux">🐧 RHEL</button>
          <button class="ss-chip" data-f="AIX">🅰️ AIX</button>
        </div>
        <div class="ss-body" id="ssBody"></div>
        <div class="ss-foot">
          <span id="ssFootL">—</span>
          <button class="ss-refresh" onclick="window.__sessions.refresh()">↻ Refresh</button>
        </div>
      </div>
    `;
    ov.addEventListener('click', function(e){
      if (e.target === ov) close();
    });
    document.body.appendChild(ov);

    // Filter chips
    ov.querySelectorAll('.ss-chip').forEach(function(c){
      c.addEventListener('click', function(){
        ov.querySelectorAll('.ss-chip').forEach(function(x){ x.classList.remove('active'); });
        c.classList.add('active');
        _filter = c.dataset.f;
        render();
      });
    });

    // Esc to close
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && _open) close();
    });
  }

  // ── Fetch ──
  function fetchData(cb) {
    var token = localStorage.getItem('sngpl_token') || sessionStorage.getItem('sngpl_token') || localStorage.getItem('token') || '';
    fetch('/api/v1/sessions', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
      .then(function(r){ return r.json(); })
      .then(function(j){
        _cache = (j && j.data) || [];
        updateBadge();
        if (cb) cb();
      })
      .catch(function(err){
        console.error('[sessions] fetch failed', err);
        if (cb) cb();
      });
  }

  function updateBadge() {
    var c = document.getElementById('ssCount');
    var b = document.getElementById('sessionsBtn');
    if (!c || !b) return;
    c.textContent = _cache.length;
    b.classList.toggle('has-data', _cache.length > 0);
  }

  // ── Render ──
  function render() {
    var body = document.getElementById('ssBody');
    var foot = document.getElementById('ssFootL');
    var sub = document.getElementById('ssHeadSub');
    if (!body) return;

    var rows = _cache;
    if (_filter !== 'all') {
      rows = rows.filter(function(r){
        return (r.os_type || '').toUpperCase() === _filter.toUpperCase();
      });
    }

    var total = _cache.length;
    var shown = rows.length;
    sub.textContent = '(' + total + ' total)';

    if (!shown) {
      body.innerHTML = '<div class="ss-empty">' +
        '<div class="ss-empty-icon">🌙</div>' +
        '<div>No active SSH sessions right now</div>' +
        '<div style="font-size:11px;margin-top:8px;color:#475569">' +
        'Live sessions will appear here automatically.</div>' +
        '</div>';
      foot.textContent = '0 shown';
      return;
    }

    var html = '<table class="ss-table"><thead><tr>' +
      '<th>Server</th><th>OS</th><th>User</th><th>TTY</th>' +
      '<th>Source IP</th><th>Login Time</th></tr></thead><tbody>';

    rows.forEach(function(r){
      var os = (r.os_type || '?').toUpperCase();
      var osCls = os.indexOf('AIX') >= 0 ? 'aix' : 'linux';
      var osLbl = os.indexOf('AIX') >= 0 ? 'AIX' : 'RHEL';
      html += '<tr>' +
        '<td>' + esc(r.server || '?') + '</td>' +
        '<td><span class="ss-os ' + osCls + '">' + osLbl + '</span></td>' +
        '<td class="ss-user">' + esc(r.user || '?') + '</td>' +
        '<td style="color:#94a3b8;font-family:monospace">' + esc(r.tty || '?') + '</td>' +
        '<td><span class="ss-ip">' + esc(r.source_ip || '?') + '</span></td>' +
        '<td style="color:#94a3b8;font-size:12px">' + esc(r.login_time || '?') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    body.innerHTML = html;
    foot.textContent = shown + ' shown' + (total !== shown ? ' of ' + total : '');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  // ── Open/Close ──
  function open() {
    _open = true;
    document.getElementById('ssOverlay').classList.add('open');
    fetchData(render);
    clearInterval(_timer);
    _timer = setInterval(function(){ fetchData(render); }, 15000);
  }
  function close() {
    _open = false;
    document.getElementById('ssOverlay').classList.remove('open');
    clearInterval(_timer);
  }
  function refresh() { fetchData(render); }

  // ── Background badge refresh (every 30s even when closed) ──
  function backgroundRefresh() {
    fetchData(null);
  }

  // ── Boot ──
  function boot() {
    injectCSS();
    injectModal();

    // Retry inserting button until header is ready (login → dashboard transition)
    var tries = 0;
    function tryInsert() {
      injectButton();
      tries++;
      if (!document.getElementById('sessionsBtn') && tries < 120) {
        setTimeout(tryInsert, 500);
      } else if (document.getElementById('sessionsBtn')) {
        console.log('[sessions] button injected after', tries, 'tries');
      }
    }
    tryInsert();

    // Background refresh
    setTimeout(backgroundRefresh, 2500);
    setInterval(backgroundRefresh, 30000);

    // MutationObserver — DOM change pe bhi retry (login → dashboard)
    if (window.MutationObserver) {
      var mo = new MutationObserver(function(){
        if (document.getElementById('sessionsBtn')) {
          mo.disconnect();
          console.log('[sessions] button injected via observer');
          return;
        }
        injectButton();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Public API
  window.__sessions = { open: open, close: close, refresh: refresh };
})();
