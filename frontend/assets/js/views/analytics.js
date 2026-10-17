import { state, subscribe, can } from '../core/store.js';
import { serverStatus, metricsOf, levelOf, groupOf, svcTone, tone } from '../core/status.js';
import { esc, num, applyBars, $, nowSec } from '../core/util.js';
import { t, tx } from '../core/i18n.js';
import { icon } from '../ui/icons.js';
import { lineChart } from '../ui/charts.js';
import { emptyState } from '../ui/parts.js';
import { md, bindCopy } from '../ui/md.js';
import { history as fetchHist, aiTrend } from '../core/data.js';
import { go } from '../core/router.js';
import { failure } from '../ui/toast.js';

const cvar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#10b981';
const RANGES = ['1h', '6h', '24h', '7d'];

export function mount(root) {
  root.innerHTML = `<div class="page-head"><div><h1>${tx('nav.analytics', 'Analytics & AI')}</h1><p class="muted">${tx('an.sub', 'Fleet-wide view built from live data, plus per-server trends and AI analysis.')}</p></div></div>
    <div class="stack"><div class="an-grid" id="fleet"></div>
    <section class="card" id="lab"><div class="card-h"><span class="card-t">${tx('an.lab', 'Trend lab')}</span></div><div class="card-b stack">
      <div class="row row--wrap"><select class="select select--auto select--min" id="lab-srv" aria-label="${esc(t('col.server', 'Server'))}"></select>
        <span class="seg" id="lab-range" role="group">${RANGES.map(r => `<button type="button" data-r="${r}" aria-pressed="false">${r}</button>`).join('')}</span><span class="spacer"></span>
        ${can.operator ? `<button class="btn btn--primary" id="lab-ai" type="button">${icon('sparkles', 'icon--sm')} ${tx('ai.analyzeTrend', 'Analyze trend')}</button>` : ''}</div>
      <div id="lab-out" class="out" hidden></div><div class="an-grid"><div class="chart-card"><div class="chart-card__h"><span class="eyebrow">CPU</span></div><div id="c-cpu"></div></div><div class="chart-card"><div class="chart-card__h"><span class="eyebrow">RAM</span></div><div id="c-ram"></div></div></div>
      <div class="chart-card"><div class="chart-card__h"><span class="eyebrow">${tx('sv.loadAvg', 'Load average (1m)')}</span></div><div id="c-load"></div></div></div></section></div>`;

  /* ---- live fleet panels ---- */
  const rank = (title, key, rows) => `<section class="card"><div class="card-h"><span class="card-t">${esc(title)}</span></div><div class="card-b rank">${rows.length ? rows.map(r => `<div class="rank__row" role="button" tabindex="0" data-open="${esc(r.name)}"><span class="rank__n">${esc(r.name)}</span><div class="meter__track"><i class="meter__fill is-${levelOf(r.v)}" data-w="${r.v.toFixed(1)}"></i></div><b>${Math.round(r.v)}%</b></div>`).join('') : `<span class="muted">${tx('common.noData', 'No data')}</span>`}</div></section>`;
  function fleet() {
    const S = state.servers.filter(s => serverStatus(s) !== 'offline');
    if (!state.servers.length) { $('#fleet', root).innerHTML = `<div class="card span-all">${emptyState(icon('layers'), t('dash.noServers', 'No servers are reporting yet'))}</div>`; return; }
    const top = fn => S.map(s => ({ name: s.name, v: fn(metricsOf(s)) })).sort((a, b) => b.v - a.v).slice(0, 8);
    const cnt = { healthy: 0, warning: 0, critical: 0, offline: 0 }; state.servers.forEach(s => cnt[serverStatus(s)]++);
    const total = state.servers.length || 1, seg = (k, c) => `<i class="bg-${c}" data-w="${(cnt[k] / total) * 100}"></i>`;
    const os = {}; state.servers.forEach(s => { const g = groupOf(s); os[g] = (os[g] || 0) + 1; });
    const svcs = []; state.servers.forEach(s => (s.services || []).forEach(x => svcs.push({ s: s.name, n: x.name, tn: svcTone(x) })));
    svcs.sort((a, b) => ({ crit: 0, warn: 1, off: 2, ok: 3 }[a.tn] - { crit: 0, warn: 1, off: 2, ok: 3 }[b.tn]));
    const procs = []; S.forEach(s => (s.top_cpu || []).forEach(p => procs.push({ ...p, server: s.name }))); procs.sort((a, b) => num(b.cpu) - num(a.cpu));
    const byServer = {}; state.incidents.forEach(i => { byServer[i.server] = (byServer[i.server] || 0) + 1; });
    const hot = Object.entries(byServer).sort((a, b) => b[1] - a[1]).slice(0, 6), maxH = hot[0]?.[1] || 1;
    $('#fleet', root).innerHTML = `<section class="card"><div class="card-h"><span class="card-t">${tx('an.status', 'Fleet status')}</span></div><div class="card-b col"><div class="stack-bar">${seg('healthy', 'ok')}${seg('warning', 'warn')}${seg('critical', 'crit')}${seg('offline', 'off')}</div>
        <div class="row row--wrap"><span class="badge badge--ok">${cnt.healthy} ${tx('st.healthy', 'healthy')}</span><span class="badge badge--warn">${cnt.warning} ${tx('st.warning', 'warning')}</span><span class="badge badge--crit">${cnt.critical} ${tx('st.critical', 'critical')}</span><span class="badge badge--off">${cnt.offline} ${tx('st.offline', 'offline')}</span></div>
        <div class="row row--wrap">${Object.entries(os).map(([g, n]) => `<span class="badge badge--${g === 'AIX' ? 'aix' : 'rhel'} badge--lg">${esc(g)} · ${n}</span>`).join('')}</div></div></section>
      ${rank(t('an.topCpu', 'Top CPU'), 'cpu', top(m => m.cpu))}${rank(t('an.topRam', 'Top memory'), 'ram', top(m => m.ram))}${rank(t('an.topDisk', 'Fullest filesystem'), 'disk', top(m => m.disk))}
      <section class="card"><div class="card-h"><span class="card-t">${tx('an.svc', 'Service health')}</span></div><div class="card-b"><div class="matrix">${svcs.slice(0, 24).map(x => `<div title="${esc(x.s)}"><span class="dot dot--${x.tn}"></span><span>${esc(x.n)}</span></div>`).join('') || `<span class="muted">${tx('svc.none', 'No services monitored')}</span>`}</div></div></section>
      <section class="card"><div class="card-h"><span class="card-t">${tx('an.hot', 'Incident hotspots')}</span></div><div class="card-b rank">${hot.map(([n, c]) => `<div class="rank__row" role="button" tabindex="0" data-open="${esc(n)}"><span class="rank__n">${esc(n)}</span><div class="meter__track"><i class="meter__fill" data-w="${(c / maxH) * 100}"></i></div><b>${c}</b></div>`).join('') || `<span class="muted">${tx('inc.allClear', 'No active incidents. All systems operational.')}</span>`}</div></section>
      <section class="card span-all"><div class="card-h"><span class="card-t">${tx('an.procs', 'Busiest processes across the fleet')}</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${tx('col.server', 'Server')}</th><th>PID</th><th>${tx('col.user', 'User')}</th><th class="num">CPU %</th><th class="num">MEM %</th><th>${tx('sv.command', 'Command')}</th></tr></thead><tbody>${procs.slice(0, 10).map(p => `<tr><td class="mono"><b>${esc(p.server)}</b></td><td class="mono muted">${esc(p.pid)}</td><td class="mono">${esc(p.user)}</td><td class="num">${num(p.cpu).toFixed(1)}</td><td class="num">${num(p.mem).toFixed(1)}</td><td class="mono wrap-any">${esc(p.cmd)}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">${tx('sv.noProcs', 'No process data')}</td></tr>`}</tbody></table></div></section>`;
    applyBars(root);
    const sel = $('#lab-srv', root); if (!sel.options.length) { sel.innerHTML = state.servers.map(s => `<option>${esc(s.name)}</option>`).join(''); if (sel.value) loadLab(); }
  }

  /* ---- trend lab ---- */
  const lab = { range: '24h' }; const nodes = { cpu: $('#c-cpu', root), ram: $('#c-ram', root), load: $('#c-load', root) };
  async function loadLab() {
    const name = $('#lab-srv', root).value; if (!name) return;
    root.querySelectorAll('#lab-range [data-r]').forEach(b => { const on = b.dataset.r === lab.range; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
    try {
      const d = await fetchHist(name, lab.range), pts = (d?.points || []).map(p => ({ ...p, ts: +p.ts }));
      lineChart(nodes.cpu, pts, [{ key: 'cpu', label: 'CPU', color: cvar('--c-cpu') }], { ref: 90 });
      lineChart(nodes.ram, pts, [{ key: 'ram', label: 'RAM', color: cvar('--c-ram') }], { ref: 90 });
      lineChart(nodes.load, pts, [{ key: 'load1', label: 'Load 1m', color: cvar('--c-load') }], { yMax: 'auto', unit: '', height: 170 });
    } catch (e) { failure(t('sv.histFail', 'Could not load history'), e.detail || e.message); }
  }
  root.addEventListener('click', async e => {
    const o = e.target.closest('[data-open]'); if (o) return go('server', o.dataset.open);
    const r = e.target.closest('[data-r]'); if (r) { lab.range = r.dataset.r; return loadLab(); }
    if (e.target.closest('#lab-ai')) {
      const out = $('#lab-out', root), btn = $('#lab-ai', root), name = $('#lab-srv', root).value;
      out.hidden = false; out.innerHTML = `<span class="muted">${tx('ai.working', 'Analyzing…')}</span>`; btn.disabled = true;
      try { const res = await aiTrend(name, lab.range); out.innerHTML = `<p class="eyebrow">${esc(name)} · ${esc(lab.range)}${res?.model ? ' · ' + esc(res.model) : ''}</p>` + md(res?.analysis || t('ai.empty', 'No analysis returned.')); }
      catch (err) { out.innerHTML = `<div class="callout callout--crit">${icon('alert')}<span>${esc(err.detail || err.message)}</span></div>`; }
      btn.disabled = false;
    }
  });
  root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-open]')) go('server', e.target.dataset.open); });
  $('#lab-srv', root).addEventListener('change', loadLab);
  bindCopy(root);
  const unsub = subscribe(fleet); fleet();
  return () => unsub();
}
