// Server detail: Specs, Performance, Storage, Processes, Services, AI. Live-updates from the store while open.
import { state, subscribe, getServer, can } from '../core/store.js';
import { serverStatus, metricsOf, tone, levelOf, svcTone, groupOf, osLabel } from '../core/status.js';
import { esc, num, fmtGB, fmtKB, fmtUptime, fmtDate, nowSec, applyBars, keepFocus, toCsv, download, copyText, $, duration } from '../core/util.js';
import { t, tx } from '../core/i18n.js';
import { icon } from '../ui/icons.js';
import { lineChart } from '../ui/charts.js';
import { stBadge, osBadge, emptyState, incTitle, sevBadge } from '../ui/parts.js';
import { md, bindCopy } from '../ui/md.js';
import { history, aiServer, aiTrend, aiIncident } from '../core/data.js';
import { go } from '../core/router.js';
import { success, failure } from '../ui/toast.js';

const TABS = [['specs', 'Specs', 'sv.specs'], ['perf', 'Performance', 'sv.perf'], ['storage', 'Storage', 'sv.storage'], ['procs', 'Processes', 'sv.procs'], ['services', 'Services', 'sv.services'], ['ai', 'AI diagnostics', 'sv.ai']];
const RANGES = ['1h', '6h', '24h', '7d'];
const COLORS = { cpu: 'var(--c-cpu)', ram: 'var(--c-ram)', disk: 'var(--c-disk)', load1: 'var(--c-load)' };
const cv = name => getComputedStyle(document.documentElement).getPropertyValue(name.replace(/var\(|\)/g, '')).trim() || '#10b981';

let open = null;   // only one modal at a time

export function openServerModal(name, { tab = 'specs', onClose } = {}) {
  if (open) open.close(true);
  const S = { name, tab, range: '1h', hist: {}, histErr: '', ai: {}, busy: false, nodes: {}, timers: [] };
  const dlg = document.createElement('dialog'); dlg.className = 'sv'; dlg.setAttribute('aria-labelledby', 'sv-title');
  dlg.innerHTML = `<div class="modal"><header class="modal__head"><span class="dot" id="sv-dot"></span><h2 class="sv__title" id="sv-title"></h2><span id="sv-os"></span><span id="sv-st"></span><span class="sv__sub" id="sv-sub"></span><span class="spacer"></span><span class="kbd">Esc</span><button class="icon-btn" type="button" data-act="close" aria-label="${esc(t('common.close', 'Close'))}">${icon('x')}</button></header>
    <div class="tabs" role="tablist" aria-label="${esc(t('sv.sections', 'Server sections'))}">${TABS.map(([k, l, key], i) => `<button class="tab" type="button" role="tab" id="svt-${k}" data-tab="${k}" aria-selected="false" aria-controls="sv-body" tabindex="-1">${esc(t(key, l))} <span class="kbd">${i + 1}</span></button>`).join('')}</div>
    <div class="modal__body" id="sv-body" role="tabpanel" tabindex="0" autofocus></div>
    <footer class="modal__foot"><button class="btn btn--primary" type="button" data-act="ai-open"${can.operator ? '' : ' hidden'}>${icon('sparkles', 'icon--sm')} ${tx('sv.aiCheck', 'Run AI health check')}</button><button class="btn" type="button" data-act="sessions">${icon('terminal', 'icon--sm')} ${tx('sv.sessions', 'View sessions')}</button><button class="btn" type="button" data-act="copy-ip">${icon('copy', 'icon--sm')} ${tx('sv.copyIp', 'Copy IP')}</button><span class="spacer"></span><button class="btn" type="button" data-act="export">${icon('download', 'icon--sm')} ${tx('sv.export', 'Export report')}</button></footer></div>`;
  document.body.append(dlg);
  const body = $('#sv-body', dlg), srv = () => getServer(name);

  const kv = (k, v) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v ?? '--')}</span></div>`;
  const hist = () => S.hist[S.range];
  const holder = id => `<div data-holder="${id}"></div>`;
  const swap = () => body.querySelectorAll('[data-holder]').forEach(h => { const n = S.nodes[h.dataset.holder]; if (n) h.replaceWith(n); });

  /* ---------- tab renderers ---------- */
  function specs(s) {
    const m = metricsOf(s), mc = s.machine || {}, off = serverStatus(s) === 'offline';
    const card = (label, v, sub, tn) => `<div class="metric${tn === 'crit' ? ' metric--crit' : tn === 'warn' ? ' metric--warn' : ''}"><span class="eyebrow">${esc(label)}</span><span class="metric__v mono">${off ? '--' : esc(v)}</span><div class="meter__track meter--lg">${off ? '' : `<i class="meter__fill is-${tn}" data-w="${Math.min(100, parseFloat(v) || 0)}"></i>`}</div><span class="metric__s">${esc(sub)}</span></div>`;
    const boot = s.uptime_sec ? fmtDate(nowSec() - s.uptime_sec) : '--';
    const users = (s.active_users || []).map(u => `<div class="ucard"><span class="av">${esc((u.name || '?')[0].toUpperCase())}</span><div class="minw0"><b class="mono">${esc(u.name)}</b><div class="muted fs-12">${u.active ? esc((u.tty || '') + (u.source_ip ? ' · ' + u.source_ip : '')) : u.shell ? tx('sv.shellOnly', 'shell access only') : ''}</div></div><span class="spacer"></span><span class="badge badge--${u.active ? 'ok' : 'off'}">${u.active ? tx('sv.active', 'active') : tx('sv.idle', 'idle')}</span></div>`).join('');
    const net = (s.network || []).map(n => `<div class="kv"><span class="mono">${esc(n.iface)}</span><span>↓ ${esc(fmtKB(n.rx_kb))} · ↑ ${esc(fmtKB(n.tx_kb))}</span></div>`).join('');
    return `<div class="split"><div class="col">
        <div class="panel"><span class="eyebrow">${tx('sv.hardware', 'Hardware')}</span>${kv(t('sv.hostname', 'Hostname'), mc.hostname)}${kv(t('sv.model', 'Model'), mc.machine_model)}${kv(t('sv.cpuModel', 'CPU'), [mc.cpu_model, mc.cpu_cores ? '× ' + mc.cpu_cores : ''].filter(Boolean).join(' '))}${kv(t('sv.arch', 'Architecture'), mc.arch || (s.os_type === 'AIX' ? 'ppc64' : 'x86_64'))}${kv('RAM', mc.ram_total ? mc.ram_total + ' GB' : fmtGB(s.ram?.total_mb))}${kv(t('sv.serial', 'Serial'), mc.serial)}</div>
        <div class="panel"><span class="eyebrow">${tx('sv.os', 'Operating system')}</span>${kv(t('sv.family', 'Family'), s.os_type)}${kv(t('sv.version', 'Version'), s.os_version || mc.os_version)}${kv(t('sv.kernel', 'Kernel'), s.kernel || mc.kernel)}${kv(t('col.uptime', 'Uptime'), fmtUptime(s.uptime_sec))}${kv(t('sv.boot', 'Boot time'), boot)}${kv(t('sv.ip', 'Primary IP'), mc.ip)}</div>
        ${net ? `<div class="panel"><span class="eyebrow">${tx('sv.network', 'Network')}</span>${net}</div>` : ''}</div>
      <div class="col"><div class="metrics">${card('CPU', m.cpu.toFixed(1) + '%', `${t('sv.load', 'Load')} ${m.load.map(x => x.toFixed(2)).join(' / ')}`, levelOf(m.cpu))}${card('RAM', m.ram.toFixed(1) + '%', `${fmtGB(s.ram?.used_mb)} / ${fmtGB(s.ram?.total_mb)}`, levelOf(m.ram))}${card(t('srv.disk', 'Disk'), Math.round(m.disk) + '%', m.diskMount ? t('sv.worst', 'worst mount') + ' ' + m.diskMount : '--', levelOf(m.disk))}${card('Swap', m.swapT ? m.swap.toFixed(0) + '%' : '0%', m.swapT ? `${fmtGB(m.swapU)} / ${fmtGB(m.swapT)}` : t('sv.noSwap', 'no swap'), levelOf(m.swap))}</div>
        <div class="chart-card"><div class="chart-card__h"><span class="eyebrow">${tx('sv.lastHour', 'Last hour')}</span><span class="spacer"></span><span class="legend"><span><i class="bg-ram"></i>RAM</span><span><i class="bg-cpu"></i>CPU</span></span></div>${holder('spec')}</div>
        <div class="panel"><span class="eyebrow">${tx('sv.users', 'Users & SSH access')} (${(s.active_users || []).length})</span><div class="users-grid">${users || `<span class="muted">${tx('sv.noUsers', 'No users reported.')}</span>`}</div></div></div></div>`;
  }
  function perf(s) {
    const stats = S.hist[S.range + ':stats'] || {}, pts = hist() || [];
    const st = (key, fromApi) => { const arr = pts.map(p => +p[key]).filter(Number.isFinite); const a = fromApi || (arr.length ? { current: arr.at(-1), avg: arr.reduce((x, y) => x + y, 0) / arr.length, min: Math.min(...arr), max: Math.max(...arr) } : null);
      return a ? `<div class="stats4">${[['sv.cur', 'Current', a.current], ['sv.avg', 'Average', a.avg], ['sv.min', 'Min', a.min], ['sv.max', 'Max', a.max]].map(([k, l, v]) => `<div><small>${esc(t(k, l))}</small><b>${(+v).toFixed(key === 'load1' ? 2 : 1)}${key === 'load1' ? '' : '%'}</b></div>`).join('')}</div>` : ''; };
    const block = (title, id, key, api) => `<div class="chart-card"><div class="chart-card__h"><span class="eyebrow">${esc(title)}</span></div>${holder(id)}${st(key, api)}</div>`;
    return `<div class="stack"><div class="row row--wrap"><span class="seg" role="group" aria-label="${esc(t('sv.range', 'Time range'))}">${RANGES.map(r => `<button type="button" data-v="${r}" class="${S.range === r ? 'is-active' : ''}" aria-pressed="${S.range === r}">${r}</button>`).join('')}</span>
        <span class="spacer"></span>${can.operator ? `<button class="btn" type="button" data-act="trend">${icon('sparkles', 'icon--sm')} ${tx('ai.analyzeTrend', 'Analyze trend')}</button>` : ''}</div>
      ${S.histErr ? `<div class="callout callout--warn">${icon('alert')}<span>${esc(S.histErr)}</span></div>` : ''}
      <div id="trend-out" class="out" ${S.ai.trend ? '' : 'hidden'}>${S.ai.trend || ''}</div>
      ${block('CPU', 'cpu', 'cpu', stats.cpu)}${block('RAM', 'ram', 'ram', stats.ram)}${block(t('sv.loadAvg', 'Load average (1m)'), 'load', 'load1')}${block(t('srv.disk', 'Disk'), 'disk', 'disk')}</div>`;
  }
  function storage(s) {
    const rows = (s.mounts || []).slice().sort((a, b) => num(b.use_pct) - num(a.use_pct)).map(m => { const p = num(m.use_pct), lv = p > 85 ? 'crit' : p >= 70 ? 'warn' : 'ok', f = Math.round(p / 10);
      return `<tr><td class="mono"><b>${esc(m.mount)}</b></td><td><div class="storage-seg">${Array.from({ length: 10 }, (_, i) => `<i class="${i < f ? 'on is-' + lv : ''}"></i>`).join('')}</div></td><td class="num">${p}%</td><td class="num">${num(m.used_gb).toFixed(2)} GB</td><td class="num">${num(m.avail_gb).toFixed(2)} GB</td><td class="num">${num(m.total_gb).toFixed(2)} GB</td><td><span class="badge badge--${lv}">${lv === 'ok' ? 'OK' : lv === 'warn' ? t('st.warning', 'WARN') : 'CRIT'}</span></td></tr>`; }).join('');
    return rows ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>${tx('sv.mount', 'Mount point')}</th><th>${tx('sv.usage', 'Usage')}</th><th class="num">%</th><th class="num">${tx('sv.used', 'Used')}</th><th class="num">${tx('sv.free', 'Free')}</th><th class="num">${tx('sv.total', 'Total')}</th><th>${tx('col.status', 'Status')}</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState(icon('disk'), t('sv.noMounts', 'No filesystem data'));
  }
  function procs(s) {
    const rows = (s.top_cpu || []).slice(0, 15).map(p => `<tr><td class="mono muted">${esc(p.pid)}</td><td class="mono">${esc(p.user)}</td><td class="num">${num(p.cpu).toFixed(1)}</td><td class="num">${num(p.mem).toFixed(1)}</td><td class="mono wrap-any">${esc(p.cmd)}</td></tr>`).join('');
    return rows ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>PID</th><th>${tx('col.user', 'User')}</th><th class="num">CPU %</th><th class="num">MEM %</th><th>${tx('sv.command', 'Command')}</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState(icon('cpu'), t('sv.noProcs', 'No process data'));
  }
  function services(s) {
    const list = s.services || [], inc = state.incidents.filter(i => i.server === s.name && i.status === 'ACTIVE');
    const c = { ok: 0, warn: 0, crit: 0 }; list.forEach(x => { const tn = svcTone(x); if (c[tn] !== undefined) c[tn]++; });
    const rows = list.map(x => { const i = inc.find(v => v.service === x.name), tn = svcTone(x);
      return `<tr><td><b>${esc(x.name)}</b></td><td><span class="badge badge--${tn}">${esc(String(x.status).toUpperCase())}</span></td><td class="muted">${esc(x.type || '--')}</td><td class="mono muted">${esc(x.check || '--')}</td><td class="num">${x.response_ms != null ? num(x.response_ms) + ' ms' : '--'}</td><td>${i ? `<a href="#/incidents/${i.id}" class="badge badge--${i.severity === 'CRITICAL' ? 'crit' : 'warn'}">#${i.id} · ${esc(duration(i.first_detected))}</a>` : '<span class="faint">--</span>'}</td></tr>`; }).join('');
    return `<div class="stack"><div class="row row--wrap"><span class="badge badge--ok badge--lg">${c.ok} ${tx('svc.running', 'running')}</span><span class="badge badge--warn badge--lg">${c.warn} ${tx('svc.degraded', 'degraded')}</span><span class="badge badge--crit badge--lg">${c.crit} ${tx('srv.down', 'down')}</span></div>
      ${rows ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>${tx('col.service', 'Service')}</th><th>${tx('col.status', 'Status')}</th><th>${tx('svc.type', 'Type')}</th><th>${tx('svc.check', 'Check')}</th><th class="num">${tx('svc.response', 'Response')}</th><th>${tx('svc.incident', 'Incident')}</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState(icon('layers'), t('svc.none', 'No services monitored on this server'))}</div>`;
  }
  function ai(s) {
    const inc = state.incidents.filter(i => i.server === s.name && i.status === 'ACTIVE');
    if (!can.operator) return `<div class="callout">${icon('info')}<span>${tx('ai.viewerNote', 'AI analysis is available to operators and admins.')}</span></div>`;
    return `<div class="stack"><div class="row row--wrap"><button class="btn btn--primary" type="button" data-act="ai-server" ${S.busy ? 'disabled' : ''}>${icon('sparkles', 'icon--sm')} ${tx('ai.analyzeServer', 'Analyze server')}</button><button class="btn" type="button" data-act="trend" ${S.busy ? 'disabled' : ''}>${tx('ai.analyzeTrend', 'Analyze trend')} (${esc(S.range)})</button></div>
      ${inc.length ? `<div class="panel"><span class="eyebrow">${tx('ai.activeInc', 'Active incidents on this server')}</span><div class="list">${inc.map(i => `<div class="row">${sevBadge(i)}<span class="truncate">${esc(incTitle(i))}</span><span class="spacer"></span><button class="btn btn--sm" type="button" data-act="explain" data-id="${i.id}">${icon('sparkles', 'icon--sm')} ${tx('ai.explain', 'Explain')}</button></div>`).join('')}</div></div>` : ''}
      <div id="ai-out" class="out" aria-live="polite" ${S.busy || S.ai.out ? '' : 'hidden'}>${S.busy ? `<span class="muted">${tx('ai.working', 'Analyzing…')}</span>` : S.ai.out || ''}</div>
      <p class="muted">${tx('ai.note', 'SNG-AI only reads metrics. It never runs commands; review suggested commands before using them.')}</p></div>`;
  }
  const VIEWS = { specs, perf, storage, procs, services, ai };

  /* ---------- rendering ---------- */
  function head() {
    const s = srv(); $('#sv-title', dlg).textContent = name;
    if (!s) { $('#sv-sub', dlg).textContent = t('sv.gone', 'not reporting'); return; }
    const st = serverStatus(s), tn = tone(st);
    $('#sv-dot', dlg).className = 'dot dot--' + tn; $('#sv-os', dlg).innerHTML = osBadge(s); $('#sv-st', dlg).innerHTML = stBadge(st, true);
    $('#sv-sub', dlg).textContent = `${s.machine?.hostname || ''} · ${t('sv.updated', 'updated')} ${s.age_sec ?? 0}s`;
  }
  function render(force = true) {
    head();
    const s = srv();
    if (!s) { body.innerHTML = emptyState(icon('server'), t('sv.notFound', 'This server is not reporting')); return; }
    if (!force && body.contains(document.activeElement) && document.activeElement !== body) return;
    const x = body.scrollTop;
    keepFocus(dlg, () => { body.innerHTML = VIEWS[S.tab](s); swap(); applyBars(body); });
    body.scrollTop = x;
    if (!dlg.contains(document.activeElement)) body.focus({ preventScroll: true });   // never leave focus on the page behind the dialog
  }
  function drawCharts() {
    const pts = hist(); if (!pts) return;
    const mk = id => (S.nodes[id] ??= document.createElement('div'));
    lineChart(mk('spec'), (S.hist['1h'] || pts), [{ key: 'ram', label: 'RAM', color: cv(COLORS.ram) }, { key: 'cpu', label: 'CPU', color: cv(COLORS.cpu) }], { ref: WARN_REF, height: 170 });
    lineChart(mk('cpu'), pts, [{ key: 'cpu', label: 'CPU', color: cv(COLORS.cpu) }], { ref: WARN_REF });
    lineChart(mk('ram'), pts, [{ key: 'ram', label: 'RAM', color: cv(COLORS.ram) }], { ref: WARN_REF });
    lineChart(mk('load'), pts, [{ key: 'load1', label: 'Load 1m', color: cv(COLORS.load1) }], { yMax: 'auto', unit: '' });
    lineChart(mk('disk'), pts, [{ key: 'disk', label: t('srv.disk', 'Disk'), color: cv(COLORS.disk) }], { ref: WARN_REF });
  }
  const WARN_REF = 90;
  async function loadHist(range = S.range) {
    try {
      const d = await history(name, range);
      S.hist[range] = (d?.points || []).map(p => ({ ...p, ts: +p.ts })); S.hist[range + ':stats'] = d?.stats || {}; S.histErr = '';
      if (range === '1h') S.hist['1h'] = S.hist[range];
    } catch (e) { S.histErr = e.detail || e.message || t('sv.histFail', 'Could not load history'); S.hist[range] = S.hist[range] || []; }
    if (open?.dlg === dlg) { drawCharts(); if (['specs', 'perf'].includes(S.tab)) render(); }
  }
  function switchTab(k) {
    S.tab = k;
    dlg.querySelectorAll('[role="tab"]').forEach(b => { const on = b.dataset.tab === k; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    body.setAttribute('aria-labelledby', 'svt-' + k); body.scrollTop = 0; render();
    if (k === 'perf' && !S.hist[S.range]) loadHist(S.range); else if (k === 'specs' && !S.hist['1h']) loadHist('1h');
  }

  /* ---------- AI ---------- */
  async function runAi(kind, id) {
    S.busy = true; S.ai.out = ''; if (S.tab !== 'ai' && kind !== 'trend') switchTab('ai'); else render();
    try {
      const r = kind === 'server' ? await aiServer(name) : kind === 'trend' ? await aiTrend(name, S.range) : await aiIncident(id);
      const out = `<p class="eyebrow">${esc(kind === 'trend' ? name + ' · ' + S.range : kind === 'incident' ? '#' + id : name)}${r?.model ? ' · ' + esc(r.model) : ''}</p>` + md(r?.analysis || t('ai.empty', 'No analysis returned.'));
      kind === 'trend' && S.tab === 'perf' ? (S.ai.trend = out) : (S.ai.out = out);
    } catch (e) { S.ai.out = `<div class="callout callout--crit">${icon('alert')}<span>${esc(e.detail || e.message)}</span></div>`; if (S.tab === 'perf') S.ai.trend = S.ai.out; }
    S.busy = false; render();
  }
  function exportReport() {
    const s = srv(); if (!s) return; const m = metricsOf(s), mc = s.machine || {};
    const rows = [['field', 'value'], ['server', s.name], ['os', s.os_type], ['status', serverStatus(s)], ['cpu_pct', m.cpu.toFixed(1)], ['ram_pct', m.ram.toFixed(1)], ['disk_pct', m.disk], ['load_1_5_15', m.load.join(' / ')], ['hostname', mc.hostname], ['ip', mc.ip], ['model', mc.machine_model], ['cpu_model', mc.cpu_model], ['cores', mc.cpu_cores], ['serial', mc.serial], ['os_version', s.os_version], ['kernel', s.kernel], ['uptime', fmtUptime(s.uptime_sec)]];
    (s.mounts || []).forEach(x => rows.push(['mount ' + x.mount, `${x.use_pct}% (${x.used_gb}/${x.total_gb} GB)`]));
    (s.services || []).forEach(x => rows.push(['service ' + x.name, x.status]));
    (s.ssh_sessions || []).forEach(x => rows.push(['session ' + x.tty, `${x.user}@${x.source_ip}`]));
    download(`${s.name}-report.csv`, toCsv(rows)); success(t('sv.exported', 'Report downloaded'));
  }

  /* ---------- events ---------- */
  dlg.addEventListener('click', async e => {
    if (e.target === dlg) return dlg.close();
    const c = e.target.closest('[data-act],[data-tab],[data-v]'); if (!c) return;
    const d = c.dataset;
    if (d.tab) return switchTab(d.tab);
    if (d.v) { S.range = d.v; render(); if (!S.hist[d.v]) await loadHist(d.v); else { drawCharts(); render(); } return; }
    const s = srv();
    try {
      if (d.act === 'close') dlg.close();
      else if (d.act === 'ai-open') { switchTab('ai'); runAi('server'); }
      else if (d.act === 'ai-server') runAi('server');
      else if (d.act === 'trend') runAi('trend');
      else if (d.act === 'explain') runAi('incident', d.id);
      else if (d.act === 'sessions') { dlg.close(); go('sessions', name); }
      else if (d.act === 'copy-ip') { s?.machine?.ip ? (await copyText(s.machine.ip), success(t('common.copied', 'Copied'))) : failure(t('sv.noIp', 'No IP address reported')); }
      else if (d.act === 'export') exportReport();
    } catch (err) { failure(t('common.failed', 'Action failed'), err.detail || err.message); }
  });
  dlg.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const i = e.key.length === 1 ? '123456'.indexOf(e.key) : -1;
    if (i >= 0) { e.preventDefault(); switchTab(TABS[i][0]); return; }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.getAttribute('role') === 'tab') {
      const cur = TABS.findIndex(x => x[0] === S.tab), nx = TABS[(cur + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length][0];
      e.preventDefault(); switchTab(nx); $('#svt-' + nx, dlg).focus();
    }
  });
  bindCopy(dlg);
  const unsub = subscribe(() => { head(); if (['specs', 'storage', 'procs', 'services', 'ai'].includes(S.tab)) render(false); });
  S.timers.push(setInterval(() => loadHist(S.range), 60000));
  const close = silent => { if (dlg.open) dlg.close(); if (silent) dlg.remove(); };
  dlg.addEventListener('close', () => { unsub(); S.timers.forEach(clearInterval); dlg.remove(); if (open?.dlg === dlg) open = null; onClose?.(); });
  open = { dlg, close };
  dlg.showModal(); switchTab(tab); loadHist(tab === 'perf' ? S.range : '1h');
  return open;
}
export const closeServerModal = () => open?.close();
