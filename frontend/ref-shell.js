/* ═══════════════════════════════════════════════════════════════
   Reference Shell — rebuild dashboard layout to match reference
   Pulls live data from existing DOM (#kpiTotal, .server-card, etc.)
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _interval = null;

  function sparkSVG(color) {
    var pts = [];
    for (var i = 0; i < 30; i++) {
      var y = 15 + Math.sin(i / 2.5) * 6 + Math.random() * 5;
      pts.push(i * 6 + ',' + y.toFixed(1));
    }
    return '<svg viewBox="0 0 180 30" preserveAspectRatio="none">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.5" points="' + pts.join(' ') + '"/>' +
      '</svg>';
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
      '<polyline fill="none" stroke="#2DD4BF" stroke-width="1.6" stroke-dasharray="4,3" points="' + b.join(' ') + '"/>' +
      '</svg>';
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
      '            <path d="M5,50 A45,45 0 0 1 95,50" fill="none" stroke="#1F2937" stroke-width="5"/>',
      '            <path id="refGaugeCpu" d="M5,50 A45,45 0 0 1 95,50" fill="none" stroke="#60A5FA" stroke-width="5" stroke-dasharray="0,200"/>',
      '          </svg>',
      '          <div class="ref-gauge__label">CPU</div>',
      '          <div class="ref-gauge__val" id="refCpuVal">0%</div>',
      '        </div>',
      '        <div class="ref-gauge">',
      '          <svg viewBox="0 0 100 55">',
      '            <path d="M5,50 A45,45 0 0 1 95,50" fill="none" stroke="#1F2937" stroke-width="5"/>',
      '            <path id="refGaugeMem" d="M5,50 A45,45 0 0 1 95,50" fill="none" stroke="#FACC15" stroke-width="5" stroke-dasharray="0,200"/>',
      '          </svg>',
      '          <div class="ref-gauge__label">Memory</div>',
      '          <div class="ref-gauge__val" id="refMemVal">0%</div>',
      '        </div>',
      '        <div class="ref-gauge">',
      '          <svg viewBox="0 0 100 55">',
      '            <path d="M5,50 A45,45 0 0 1 95,50" fill="none" stroke="#1F2937" stroke-width="5"/>',
      '            <path id="refGaugeDisk" d="M5,50 A45,45 0 0 1 95,50" fill="none" stroke="#FB7185" stroke-width="5" stroke-dasharray="0,200"/>',
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

    // Wire sidebar buttons
    var settingsBtn = document.getElementById('refSettingsBtn');
    if (settingsBtn) settingsBtn.onclick = function () {
      var s = document.getElementById('sngplPrefsBtn');
      if (s) s.click();
      else if (window.__settingsUI) window.__settingsUI.open();
    };
    var refreshBtn = document.getElementById('refRefreshBtn');
    if (refreshBtn) refreshBtn.onclick = function () {
      if (window.refresh) window.refresh();
      else location.reload();
    };
    var logoutBtn = document.getElementById('refLogout');
    if (logoutBtn) logoutBtn.onclick = function () {
      if (window.logout) window.logout();
    };
    // Incidents scroll
    var navInc = document.getElementById('refNavIncidents');
    if (navInc) navInc.onclick = function () {
      var el = document.getElementById('refTicketList');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    };
    // Servers scroll
    var navSrv = document.getElementById('refNavServers');
    if (navSrv) navSrv.onclick = function () {
      var el = document.getElementById('refDiskList');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    };
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.textContent.trim() : '—';
  }

  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function setGauge(pid, pct) {
    var el = document.getElementById(pid);
    if (!el) return;
    // Half-circle radius 45 → circumference = π*45 ≈ 141.37
    var len = (Math.max(0, Math.min(100, pct)) / 100) * 141.37;
    el.setAttribute('stroke-dasharray', len.toFixed(1) + ',200');
  }

  function refreshData() {
    // KPI numbers from existing DOM
    setText('refValTotal',     val('kpiTotal')     || val('kpiHealthy') || '—');
    setText('refValHealthy',   val('kpiHealthy')   || '—');
    setText('refValIncidents', val('kpiWarning')   || val('kpiCritical') || '0');

    // Sessions — from sessions button badge
    var sessBadge = document.getElementById('ssCount');
    setText('refValSessions', sessBadge ? sessBadge.textContent.trim() : '0');

    // Server cards → gauges + disk list
    var cards = document.querySelectorAll('.server-card');
    var cpuVals = [], memVals = [], diskVals = [];
    var diskRows = [];

    cards.forEach(function (card) {
      var nameEl = card.querySelector('.server-name, h3, .name, [class*="name"]');
      var name = nameEl ? nameEl.textContent.trim() : '—';

      // find metric values — pattern: label then XX%
      var pctNodes = card.querySelectorAll('*');
      var localCpu = null, localMem = null, localDisk = null;
      pctNodes.forEach(function (n) {
        if (n.children.length > 0) return; // leaf only
        var t = (n.textContent || '').trim();
        var m = t.match(/^(\d+)%$/);
        if (!m) return;
        var v = parseInt(m[1], 10);
        var prev = n.previousElementSibling;
        var lbl = prev ? (prev.textContent || '').trim().toLowerCase() : '';
        // also try parent label
        if (!lbl && n.parentElement) {
          var p = n.parentElement;
          lbl = (p.textContent || '').toLowerCase();
        }
        if (/cpu/.test(lbl) && localCpu === null) localCpu = v;
        else if (/(ram|mem)/.test(lbl) && localMem === null) localMem = v;
        else if (/disk/.test(lbl) && localDisk === null) localDisk = v;
      });

      if (localCpu !== null) cpuVals.push(localCpu);
      if (localMem !== null) memVals.push(localMem);
      if (localDisk !== null) {
        diskVals.push(localDisk);
        diskRows.push({ name: name, pct: localDisk });
      }
    });

    function avg(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0; }
    var cA = avg(cpuVals), mA = avg(memVals), dA = avg(diskVals);

    setGauge('refGaugeCpu', cA);
    setGauge('refGaugeMem', mA);
    setGauge('refGaugeDisk', dA);
    setText('refCpuVal',  cA + '%');
    setText('refMemVal',  mA + '%');
    setText('refDiskVal', dA + '%');

    // Disk list — sort by usage desc, top 8
    diskRows.sort(function (a, b) { return b.pct - a.pct; });
    var diskHtml = '';
    diskRows.slice(0, 8).forEach(function (r) {
      var color = r.pct >= 85 ? 'var(--accent-rose)'
                : r.pct >= 70 ? 'var(--accent-yellow)'
                : 'var(--accent-blue)';
      diskHtml += '<div class="ref-disk-row">' +
        '<span class="ref-disk-name">' + r.name + '</span>' +
        '<div class="ref-disk-bar"><div style="width:' + r.pct + '%;background:' + color + '"></div></div>' +
        '<span class="ref-disk-val">' + r.pct + '%</span>' +
        '</div>';
    });
    var diskList = document.getElementById('refDiskList');
    if (diskList && diskHtml) diskList.innerHTML = diskHtml;

    // Ticket list — from incident items
    var incs = document.querySelectorAll('.incident-item, .incident-row, [class*="incident"]');
    var tHtml = '';
    var real = 0;
    incs.forEach(function (inc) {
      var titleEl = inc.querySelector('.incident-title, h4, h3, .title, [class*="title"]');
      var subEl   = inc.querySelector('.incident-sub, .sub, .meta, [class*="sub"], [class*="meta"]');
      var title = titleEl ? titleEl.textContent.trim() : (inc.textContent || '').trim().split('\n')[0];
      var sub   = subEl ? subEl.textContent.trim() : '';
      if (!title) return;
      real++;
      var isCrit = /critical|crit|active|down/i.test(inc.className + ' ' + title);
      var edge = isCrit ? 'var(--accent-rose)' : 'var(--accent-yellow)';
      tHtml += '<div class="ref-ticket-row">' +
        '<div class="ref-ticket-row__edge" style="background:' + edge + '"></div>' +
        '<div>' +
          '<div class="ref-ticket-row__title">' + title + '</div>' +
          '<div class="ref-ticket-row__sub">' + sub + '</div>' +
        '</div>' +
        '<div class="ref-ticket-row__meta">' + (isCrit ? 'P1' : 'P2') + '</div>' +
        '</div>';
    });
    var tList = document.getElementById('refTicketList');
    if (tList) {
      if (real === 0) {
        tList.innerHTML = '<div class="ref-ticket-empty">No active incidents</div>';
      } else {
        tList.innerHTML = tHtml;
      }
    }
  }

  function start() {
    var tries = 0;
    function tryOnce() {
      tries++;
      if (document.getElementById('app') && document.getElementById('kpiTotal')) {
        buildShell();
        refreshData();
        _interval = setInterval(refreshData, 3000);
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
