/* ═══════════════════════════════════════════════════════════════
   Reference Shell v2 — robust data extraction
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function sparkSVG(color) {
    var pts = [];
    for (var i = 0; i < 30; i++) {
      var y = 15 + Math.sin(i / 2.5) * 6 + Math.random() * 5;
      pts.push(i * 6 + ',' + y.toFixed(1));
    }
    return '<svg viewBox="0 0 180 30" preserveAspectRatio="none">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.5" points="' + pts.join(' ') + '"/></svg>';
  }

  function activitySVG() {
    var a = [], b = [];
    for (var i = 0; i < 60; i++) {
      a.push((i * 13).toFixed(0) + ',' + (80 + Math.sin(i / 3) * 22 + Math.random() * 15).toFixed(1));
      b.push((i * 13).toFixed(0) + ',' + (90 + Math.cos(i / 4) * 18 + Math.random() * 12).toFixed(1));
    }
    return '<svg viewBox="0 0 780 140" preserveAspectRatio="none">' +
      '<line x1="0" y1="30" x2="780" y2="30" stroke="#FB7185" stroke-dasharray="3,4" stroke-opacity=".5"/>' +
      '<polyline fill="none" stroke="#60A5FA" stroke-width="1.6" points="' + a.join(' ') + '"/>' +
      '<polyline fill="none" stroke="#2DD4BF" stroke-width="1.6" stroke-dasharray="4,3" points="' + b.join(' ') + '"/></svg>';
  }

  function buildShell() {
    var app = document.getElementById('app');
    if (!app || document.getElementById('refShell')) return;

    var shell = document.createElement('div');
    shell.className = 'ref-shell';
    shell.id = 'refShell';
    shell.innerHTML = [
      '<aside class="ref-sidebar">',
      '  <div class="ref-sidebar__top" title="Menu">☰</div>',
      '  <a class="ref-nav-item active" title="Dashboard">▦</a>',
      '  <a class="ref-nav-item" title="Monitoring">◐</a>',
      '  <a class="ref-nav-item" title="Reports">▤</a>',
      '  <a class="ref-nav-item" title="Servers" id="refNavServers">▥</a>',
      '  <a class="ref-nav-item" title="Incidents" id="refNavIncidents">⚠</a>',
      '  <div class="ref-sidebar__spacer"></div>',
      '  <div class="ref-sidebar__bottom" title="Logout" id="refLogout">⏻</div>',
      '</aside>',
      '<div class="ref-main">',
      '  <div class="ref-topbar">',
      '    <div class="ref-topbar__title">Monitoring <span class="caret">▾</span></div>',
      '    <div class="ref-topbar__actions">',
      '      <button title="Add">＋</button>',
      '      <button title="Settings" id="refSettingsBtn">⚙</button>',
      '      <button title="Refresh" id="refRefreshBtn">↻</button>',
      '      <button title="Export">⤓</button>',
      '      <button title="More">⋮</button>',
      '    </div>',
      '  </div>',
      '  <div class="ref-grid-row1">',
      '    <div class="ref-kpi-cluster">',
      '      <div class="ref-kpi ref-kpi--info">',
      '        <div class="ref-kpi__label">Total Servers</div>',
      '        <div class="ref-kpi__spark">' + sparkSVG('#FB7185') + '</div>',
      '        <div class="ref-kpi__foot"><span>Online</span><b id="refValTotal">0</b></div>',
      '      </div>',
      '      <div class="ref-kpi ref-kpi--ok">',
      '        <div class="ref-kpi__label">Healthy</div>',
      '        <div class="ref-kpi__spark">' + sparkSVG('#60A5FA') + '</div>',
      '        <div class="ref-kpi__foot"><span>Servers</span><b id="refValHealthy">0</b></div>',
      '      </div>',
      '      <div class="ref-kpi ref-kpi--warn">',
      '        <div class="ref-kpi__label">Incidents</div>',
      '        <div class="ref-kpi__spark">' + sparkSVG('#FACC15') + '</div>',
      '        <div class="ref-kpi__foot"><span>Active</span><b id="refValIncidents">0</b></div>',
      '      </div>',
      '      <div class="ref-kpi ref-kpi--info">',
      '        <div class="ref-kpi__label">Sessions</div>',
      '        <div class="ref-kpi__spark">' + sparkSVG('#2DD4BF') + '</div>',
      '        <div class="ref-kpi__foot"><span>SSH</span><b id="refValSessions">0</b></div>',
      '      </div>',
      '    </div>',
      '    <div class="ref-activity">',
      '      <div class="ref-sec-head">Server Activity</div>',
      '      <div class="ref-activity__legend">',
      '        <span style="color:#60A5FA">Server_01</span>',
      '        <span style="color:#2DD4BF">Server_02</span>',
      '      </div>',
      '      <div class="ref-activity__chart">' + activitySVG() + '</div>',
      '      <div class="ref-gauges">',
      '        <div class="ref-gauge">',
      '          <svg viewBox="0 0 100 55">',
      '            <path d="M8,50 A42,42 0 0 1 92,50" fill="none" stroke="#1F2937" stroke-width="6"/>',
      '            <path id="refGaugeCpu" d="M8,50 A42,42 0 0 1 92,50" fill="none" stroke="#60A5FA" stroke-width="6" stroke-dasharray="0,132"/>',
      '          </svg>',
      '          <div class="ref-gauge__label">CPU</div>',
      '          <div class="ref-gauge__val" id="refCpuVal">0%</div>',
      '        </div>',
      '        <div class="ref-gauge">',
      '          <svg viewBox="0 0 100 55">',
      '            <path d="M8,50 A42,42 0 0 1 92,50" fill="none" stroke="#1F2937" stroke-width="6"/>',
      '            <path id="refGaugeMem" d="M8,50 A42,42 0 0 1 92,50" fill="none" stroke="#FACC15" stroke-width="6" stroke-dasharray="0,132"/>',
      '          </svg>',
      '          <div class="ref-gauge__label">Memory</div>',
      '          <div class="ref-gauge__val" id="refMemVal">0%</div>',
      '        </div>',
      '        <div class="ref-gauge">',
      '          <svg viewBox="0 0 100 55">',
      '            <path d="M8,50 A42,42 0 0 1 92,50" fill="none" stroke="#1F2937" stroke-width="6"/>',
      '            <path id="refGaugeDisk" d="M8,50 A42,42 0 0 1 92,50" fill="none" stroke="#FB7185" stroke-width="6" stroke-dasharray="0,132"/>',
      '          </svg>',
      '          <div class="ref-gauge__label">Disk</div>',
      '          <div class="ref-gauge__val" id="refDiskVal">0%</div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="ref-grid-row2">',
      '    <div class="ref-tickets">',
      '      <div class="ref-sec-head">',
      '        <span>Tickets Status</span>',
      '        <span class="ref-tickets__tabs">',
      '          <span class="active">Priority</span>',
      '          <span>Latest</span>',
      '        </span>',
      '      </div>',
      '      <div class="ref-ticket-list" id="refTicketList">',
      '        <div class="ref-ticket-empty">Loading…</div>',
      '      </div>',
      '    </div>',
      '    <div class="ref-disk">',
      '      <div class="ref-sec-head">Disk Space Usage</div>',
      '      <div class="ref-disk-list" id="refDiskList">',
      '        <div class="ref-ticket-empty">Loading…</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    app.appendChild(shell);
    document.body.classList.add('ref-mode');

    var sb = document.getElementById('refSettingsBtn');
    if (sb) sb.onclick = function () {
      var s = document.getElementById('sngplPrefsBtn');
      if (s) s.click();
      else if (window.__settingsUI) window.__settingsUI.open();
    };
    var rb = document.getElementById('refRefreshBtn');
    if (rb) rb.onclick = function () { if (window.refresh) window.refresh(); else location.reload(); };
    var lo = document.getElementById('refLogout');
    if (lo) lo.onclick = function () { if (window.logout) window.logout(); };
  }

  /* ─── Extract all "Label X%" pairs from a card's inner text ─── */
  function extractMetrics(card) {
    var out = { cpu: null, mem: null, disk: null };
    // Strategy 1: look for label element followed by XX% element (siblings)
    var candidates = card.querySelectorAll('*');
    candidates.forEach(function (el) {
      if (el.children.length > 0) return; // leaf only
      var t = (el.textContent || '').trim();
      var m = t.match(/^(\d{1,3})\s*%$/);
      if (!m) return;
      var v = parseInt(m[1], 10);
      if (v > 100) return;
      // Look backwards through previous siblings and parent text
      var ctx = '';
      var sib = el.previousElementSibling;
      while (sib && ctx.length < 40) {
        ctx = (sib.textContent || '').trim() + ' ' + ctx;
        sib = sib.previousElementSibling;
      }
      if (!ctx && el.parentElement) {
        var p = el.parentElement;
        var first = p.firstElementChild;
        if (first && first !== el) ctx = (first.textContent || '').trim();
      }
      ctx = ctx.toLowerCase();
      if (out.cpu === null && /cpu/.test(ctx)) out.cpu = v;
      else if (out.mem === null && /(ram|mem)/.test(ctx)) out.mem = v;
      else if (out.disk === null && /disk/.test(ctx)) out.disk = v;
    });
    // Strategy 2 (fallback): scan inner text for "CPU 75%" pattern
    var inner = (card.textContent || '').replace(/\s+/g, ' ');
    if (out.cpu === null)  { var mc = inner.match(/CPU\s*[:]?\s*(\d{1,3})\s*%/i); if (mc) out.cpu = +mc[1]; }
    if (out.mem === null)  { var mm = inner.match(/(?:RAM|Memory|Mem)\s*[:]?\s*(\d{1,3})\s*%/i); if (mm) out.mem = +mm[1]; }
    if (out.disk === null) { var md = inner.match(/Disk\s*[:]?\s*(\d{1,3})\s*%/i); if (md) out.disk = +md[1]; }
    return out;
  }

  function setGauge(pid, pct) {
    var el = document.getElementById(pid);
    if (!el) return;
    var len = (Math.max(0, Math.min(100, pct)) / 100) * 132; // A42 arc length ≈ 132
    el.setAttribute('stroke-dasharray', len.toFixed(1) + ',132');
  }

  function textOf(id) {
    var el = document.getElementById(id);
    return el ? (el.textContent || '').trim() : '';
  }

  function setText(id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  function refreshData() {
    // KPI values
    setText('refValTotal',     textOf('kpiTotal') || textOf('kpiHealthy') || '—');
    setText('refValHealthy',   textOf('kpiHealthy') || '—');
    var inc = (parseInt(textOf('kpiWarning') || '0', 10) || 0) +
              (parseInt(textOf('kpiCritical') || '0', 10) || 0);
    setText('refValIncidents', inc);
    var sb = document.getElementById('ssCount');
    setText('refValSessions', sb ? sb.textContent.trim() : '0');

    // Server cards → gauges + disk list
    var cards = document.querySelectorAll('.server-card');
    var cpuV = [], memV = [], diskV = [], diskRows = [];

    cards.forEach(function (card) {
      var nameEl = card.querySelector('.server-name, h3, .name, [class*="name"]');
      var name = nameEl ? nameEl.textContent.trim().split(/\s+/)[0] : '—';
      var m = extractMetrics(card);
      if (m.cpu  !== null) cpuV.push(m.cpu);
      if (m.mem  !== null) memV.push(m.mem);
      if (m.disk !== null) { diskV.push(m.disk); diskRows.push({ name: name, pct: m.disk }); }
    });

    function avg(a) {
      return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0;
    }
    var cA = avg(cpuV), mA = avg(memV), dA = avg(diskV);

    setGauge('refGaugeCpu',  cA);
    setGauge('refGaugeMem',  mA);
    setGauge('refGaugeDisk', dA);
    setText('refCpuVal',  cA + '%');
    setText('refMemVal',  mA + '%');
    setText('refDiskVal', dA + '%');

    // Disk list — sorted desc
    diskRows.sort(function (a, b) { return b.pct - a.pct; });
    var dh = '';
    diskRows.slice(0, 8).forEach(function (r) {
      var color = r.pct >= 85 ? 'var(--accent-rose)'
                : r.pct >= 70 ? 'var(--accent-yellow)'
                : 'var(--accent-blue)';
      dh += '<div class="ref-disk-row">' +
        '<span class="ref-disk-name" title="' + r.name + '">' + r.name + '</span>' +
        '<div class="ref-disk-bar"><div style="width:' + r.pct + '%;background:' + color + '"></div></div>' +
        '<span class="ref-disk-val">' + r.pct + '%</span>' +
        '</div>';
    });
    var dl = document.getElementById('refDiskList');
    if (dl) dl.innerHTML = dh || '<div class="ref-ticket-empty">No disk data</div>';

    // Tickets — from incident center items
    var incItems = document.querySelectorAll('#incidentCenter .incident-item, .incident-item, .incident-row');
    var seen = {};
    var th = '', real = 0;
    incItems.forEach(function (inc) {
      var titleEl = inc.querySelector('.incident-title, h4, h3, .title, [class*="title"]');
      var subEl   = inc.querySelector('.incident-sub, .sub, .meta, [class*="sub"], [class*="meta"]');
      var title = titleEl ? titleEl.textContent.trim() : (inc.textContent || '').trim().split('\n')[0].slice(0, 60);
      var sub   = subEl ? subEl.textContent.trim() : '';
      if (!title || seen[title]) return;
      seen[title] = 1;
      real++;
      var isCrit = /critical|crit|active|down/i.test(inc.className + ' ' + title);
      var edge = isCrit ? 'var(--accent-rose)' : 'var(--accent-yellow)';
      th += '<div class="ref-ticket-row">' +
        '<div class="ref-ticket-row__edge" style="background:' + edge + '"></div>' +
        '<div>' +
          '<div class="ref-ticket-row__title">' + title + '</div>' +
          '<div class="ref-ticket-row__sub">' + sub + '</div>' +
        '</div>' +
        '<div class="ref-ticket-row__meta">' + (isCrit ? 'P1' : 'P2') + '</div>' +
        '</div>';
    });
    var tl = document.getElementById('refTicketList');
    if (tl) {
      tl.innerHTML = real ? th : '<div class="ref-ticket-empty">No active incidents</div>';
    }
  }

  function start() {
    var tries = 0;
    function tryOnce() {
      tries++;
      if (document.getElementById('app') && document.getElementById('kpiTotal')) {
        buildShell();
        setTimeout(refreshData, 800);
        setInterval(refreshData, 3000);
      } else if (tries < 120) {
        setTimeout(tryOnce, 500);
      }
    }
    tryOnce();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
