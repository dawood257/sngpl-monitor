import { state, subscribe, patch, history, can, getServer } from '../core/store.js';
import { serverStatus, metricsOf, tone, kpis, bySeverity, topRisk, groupOf, svcDown, svcTone, WARN_AT } from '../core/status.js';
import { esc, applyBars, keepFocus, nowSec, hms, fmtUptime, toCsv, download, num, setHTML, $ } from '../core/util.js';
import { t, tx } from '../core/i18n.js';
import { icon } from '../ui/icons.js';
import { sparkline, ring } from '../ui/charts.js';
import { osBadge, stBadge, meter, sevBadge, emptyState, loadingBlock, incTitle } from '../ui/parts.js';
import { md, bindCopy } from '../ui/md.js';
import { go } from '../core/router.js';
import { ackIncident, aiServer, aiTrend, aiIncident, refreshServers, refreshIncidents } from '../core/data.js';
import { confirmBox } from '../ui/dialog.js';
import { failure, success } from '../ui/toast.js';

const FILTERS = [['all', 'All', 'filter.all'], ['RHEL', 'RHEL', null], ['AIX', 'AIX', null], ['alerts', 'Alerts', 'filter.alerts'], ['services', 'Services', 'filter.services'], ['offline', 'Offline', 'filter.offline']];
const VIEWS = [['grid', 'grid', 'Grid'], ['os', 'layers', 'By OS'], ['heat', 'heat', 'Heatmap'], ['list', 'list', 'List']];

function applyFilter(list) {
  const f = state.filter, q = state.query.trim().toLowerCase();
  let out = list.filter(s => {
    const st = serverStatus(s);
    if (f === 'RHEL') return groupOf(s) === 'RHEL';
    if (f === 'AIX') return groupOf(s) === 'AIX';
    if (f === 'alerts') return st === 'warning' || st === 'critical';
    if (f === 'services') return svcDown(s).length > 0;
    if (f === 'offline') return st === 'offline';
    if (f === 'healthy' || f === 'warning' || f === 'critical') return st === f;
    return true;
  });
  if (q) out = out.filter(s => s.name.toLowerCase().includes(q) || String(s.machine?.ip || '').includes(q) || String(s.machine?.hostname || '').toLowerCase().includes(q));
  return out.sort(bySeverity);
}

function card(s) {
  const st = serverStatus(s), tn = tone(st), off = st === 'offline', m = metricsOf(s), mc = s.machine || {};
  const down = svcDown(s), total = (s.services || []).length;
  const svc = !total ? `<span class="faint">${tx('srv.noServices', 'No services monitored')}</span>`
    : down.length ? `<span class="badge badge--crit">${down.length} ${tx('srv.down', 'down')}</span><span>${esc(down.map(x => x.name).slice(0, 2).join(', '))}</span>`
    : `<span class="badge badge--ok">${total}/${total}</span><span>${tx('srv.allRunning', 'services running')}</span>`;
  return `<div class="card srv srv--${tn}" role="button" tabindex="0" data-open="${esc(s.name)}" aria-label="${esc(s.name)}">
    <div class="srv__head"><span class="dot dot--${tn}${st === 'healthy' ? ' dot--live' : ''}"></span><span class="srv__name">${esc(s.name)}</span>${osBadge(s)}<span class="spacer"></span>${stBadge(st)}</div>
    <div class="srv__sub">${esc(mc.ip || '')}${mc.machine_model ? ' · ' + esc(mc.machine_model) : ''}${off ? ' · ' + tx('srv.noHeartbeat', 'no heartbeat') : s.uptime_sec ? ' · ' + tx('srv.up', 'up') + ' ' + esc(fmtUptime(s.uptime_sec)) : ''}</div>
    <div class="srv__spark">${sparkline(off ? [] : history.get(s.name)?.cpu, tn)}</div>
    <div class="srv__meters">${meter('CPU', m.cpu, off)}${meter('RAM', m.ram, off)}${meter(t('srv.disk', 'Disk'), m.disk, off)}</div>
    <div class="srv__foot">${svc}</div></div>`;
}
function tile(s) {
  const st = serverStatus(s), m = metricsOf(s), off = st === 'offline';
  const top = off ? t('srv.noData', 'No data') : m.ram >= m.cpu && m.ram >= m.disk ? `RAM ${Math.round(m.ram)}%` : m.disk >= m.cpu ? `Disk ${Math.round(m.disk)}%` : `CPU ${Math.round(m.cpu)}%`;
  return `<div class="tile tile--${tone(st)}" role="button" tabindex="0" data-open="${esc(s.name)}"><b>${esc(s.name)}</b><span class="v">${esc(top)}</span><small>${esc(t('st.' + st, st))} · ${esc(groupOf(s))}</small></div>`;
}
function listTable(list) {
  return `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>${tx('col.status', 'Status')}</th><th>${tx('col.server', 'Server')}</th><th>OS</th><th class="num">CPU</th><th class="num">RAM</th><th class="num">${tx('srv.disk', 'Disk')}</th><th>${tx('col.services', 'Services')}</th><th>IP</th><th class="num">${tx('col.uptime', 'Uptime')}</th></tr></thead><tbody>${list.map(s => {
    const st = serverStatus(s), m = metricsOf(s), off = st === 'offline', dn = svcDown(s).length;
    return `<tr class="is-click" tabindex="0" data-open="${esc(s.name)}"><td>${stBadge(st)}</td><td class="mono"><b>${esc(s.name)}</b></td><td>${osBadge(s)}</td><td class="num">${off ? '--' : Math.round(m.cpu) + '%'}</td><td class="num">${off ? '--' : Math.round(m.ram) + '%'}</td><td class="num">${off ? '--' : Math.round(m.disk) + '%'}</td><td>${dn ? `<span class="badge badge--crit">${dn} ${tx('srv.down', 'down')}</span>` : (s.services || []).length || '--'}</td><td class="mono muted">${esc(s.machine?.ip || '')}</td><td class="num muted">${esc(fmtUptime(s.uptime_sec))}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function summaryText(k, risk) {
  if (!k.total) return t('hero.none', 'No servers are reporting yet.');
  if (!risk) return t('hero.allOk', 'All {n} servers are healthy.', { n: k.total }) + (k.alerts ? ' ' + t('hero.butInc', '{n} incident(s) are still open.', { n: k.alerts }) : '');
  const m = metricsOf(risk), st = serverStatus(risk), dn = svcDown(risk)[0];
  const why = st === 'offline' ? t('hero.offline', 'it stopped reporting') : dn ? t('hero.svcDown', '{s} is {st}', { s: dn.name, st: String(dn.status).toLowerCase() }) : t('hero.peak', 'peak usage is {p}%', { p: Math.round(Math.max(m.cpu, m.ram, m.disk)) });
  return t('hero.summary', '{c} critical, {w} warning and {o} offline. Highest risk: {name}, where {why}.', { c: k.critical, w: k.warning, o: k.offline, name: risk.name, why });
}

function incItem(i) {
  const active = i.status === 'ACTIVE', tn = i.status === 'RESOLVED' ? 'done' : i.severity === 'WARNING' ? 'warn' : i.severity === 'INFO' ? 'info' : '';
  return `<div class="inc ${tn ? 'inc--' + tn : ''}" data-id="${i.id}">
    <div class="inc__top">${sevBadge(i)}<span class="inc__title truncate">${esc(incTitle(i))}</span></div>
    <div class="inc__meta"><span class="mono">${esc(i.server)}${i.service ? ' · ' + esc(i.service) : ''}</span><span class="spacer"></span>${active ? `<span class="sla" title="${esc(t('inc.open', 'Open for'))}">${icon('clock', 'icon--sm')}<span data-sla="${i.first_detected}">${hms(nowSec() - i.first_detected)}</span></span>` : `<span class="muted">${tx('inc.resolved', 'resolved')}</span>`}</div>
    <div class="inc__act">${i.acknowledged ? `<span class="badge badge--info">${tx('inc.ackBy', 'ACK')} ${esc(i.acknowledged_by || '')}</span>` : ''}
      <button class="btn btn--sm" data-act="open" data-id="${i.id}">${tx('common.details', 'Details')}</button>
      ${can.operator ? `<button class="btn btn--sm" data-act="explain" data-id="${i.id}">${icon('sparkles', 'icon--sm')} ${tx('ai.explain', 'Explain')}</button>` : ''}
      ${can.operator && active && !i.acknowledged ? `<button class="btn btn--sm btn--primary" data-act="ack" data-id="${i.id}">${tx('inc.ack', 'Acknowledge')}</button>` : ''}</div></div>`;
}

export function mount(root) {
  root.innerHTML = `<div class="dash"><div class="dash__main">
      <section class="card hero" id="hero"></section><section class="kpis" id="kpis" aria-label="Totals"></section>
      <div class="toolbar"><div class="filters" id="filters"></div><span class="spacer"></span>
        <div class="search-wrap search-wrap--sm">${icon('search', 'icon--sm')}<input class="input input--search" id="q" type="search" data-i18n-ph="dash.search" placeholder="${esc(t('dash.search', 'Filter servers'))}" aria-label="${esc(t('dash.search', 'Filter servers'))}" maxlength="64"></div>
        <div class="seg" id="views" role="group"></div><button class="btn" id="export" type="button">${icon('download', 'icon--sm')} CSV</button></div>
      <section id="srvs"></section></div>
    <aside class="rail"><section class="card" id="incbox"></section><section class="card" id="copilot"></section></aside></div>`;
  const $q = $('#q', root); $q.value = state.query;
  $('#views', root).innerHTML = VIEWS.map(([k, ic, l]) => `<button type="button" data-v="${k}" aria-pressed="false" title="${esc(l)}">${icon(ic, 'icon--sm')}<span>${esc(t('view.' + k, l))}</span></button>`).join('');
  $('#filters', root).innerHTML = '';

  const copilotState = { server: '', range: '24h', out: '', busy: false };
  const el = id => $('#' + id, root);

  function render() {
    keepFocus(root, () => {
      const servers = state.servers, k = kpis(servers, state.incidents), risk = topRisk(servers);
      /* hero */
      const hc = k.health >= 90 ? 'var(--ok)' : k.health >= 60 ? 'var(--warn)' : 'var(--crit)';
      setHTML(el('hero'), `${ring(k.health, hc, t('hero.health', 'Health'))}<div class="hero__body"><span class="eyebrow">${tx('hero.summaryLabel', 'Cluster summary')}</span><h2>${esc(summaryText(k, risk))}</h2>
        <div class="hero__avail"><span>${tx('hero.avail', 'Availability')} <b>${k.availability}%</b> · ${k.online}/${k.total} ${tx('hero.online', 'online')}</span><span>${tx('hero.incidents', 'Open incidents')} <b>${k.alerts}</b></span><span>${tx('col.services', 'Services')} <b>${k.running}/${k.services}</b> ${tx('hero.running', 'running')}</span></div></div>
        ${risk ? `<button class="btn btn--primary" type="button" data-open="${esc(risk.name)}">${icon('shield', 'icon--sm')} ${tx('hero.review', 'Review top risk')}</button>` : ''}`);
      /* KPIs */
      const kp = [['all', 'total', 'server', 'kpi.total', 'Servers', k.total, t('kpi.monitored', 'Monitored infrastructure')], ['healthy', 'ok', 'check', 'kpi.healthy', 'Healthy', k.healthy, t('kpi.healthyD', 'Operating normally')],
        ['warning', 'warn', 'alert', 'kpi.warning', 'Warning', k.warning, t('kpi.warningD', 'Needs attention')], ['critical', 'crit', 'activity', 'kpi.critical', 'Critical', k.critical, t('kpi.criticalD', 'Immediate action')],
        ['offline', 'off', 'x', 'kpi.offline', 'Offline', k.offline, t('kpi.offlineD', 'Not responding')], ['services', 'svc', 'layers', 'kpi.services', 'Services', k.services, `${k.running} ${t('hero.running', 'running')}${k.down ? ' · ' + k.down + ' ' + t('srv.down', 'down') : ''}`]];
      setHTML(el('kpis'), kp.map(([f, c, ic, key, fb, v, sub]) => `<button class="kpi kpi--${c}${state.filter === f ? ' is-active' : ''}" type="button" data-f="${f}" aria-pressed="${state.filter === f}"><span class="kpi__l">${icon(ic, 'icon--sm')}${esc(t(key, fb))}</span><span class="kpi__v">${v}</span><span class="kpi__s">${esc(sub)}</span></button>`).join(''));
      /* filters */
      const cnt = { all: k.total, RHEL: k.rhel, AIX: k.aix, alerts: k.alerts, services: k.services, offline: k.offline };
      const extra = ['healthy', 'warning', 'critical'].includes(state.filter) ? [[state.filter, t('kpi.' + state.filter, state.filter), k[state.filter]]] : [];
      setHTML(el('filters'), FILTERS.map(([f, l, key]) => [f, key ? t(key, l) : l, cnt[f]]).concat(extra).map(([f, l, n]) => `<button type="button" class="chip${state.filter === f ? ' is-active' : ''}" data-f="${f}" aria-pressed="${state.filter === f}">${esc(l)}<span class="n">${n}</span></button>`).join(''));
      $$v(root).forEach(b => { const on = b.dataset.v === state.view; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
      /* servers */
      const list = applyFilter(servers), box = el('srvs');
      let html;
      if (!state.loaded) html = `<div class="grid">${loadingBlock(6)}</div>`;
      else if (!servers.length) html = `<div class="card">${emptyState(icon('server'), t('dash.noServers', 'No servers are reporting yet'), t('dash.noServersHint', 'Agents appear here as soon as they send their first metrics.'))}</div>`;
      else if (!list.length) html = `<div class="card">${emptyState(icon('search'), t('dash.noMatch', 'No servers match this filter'))}</div>`;
      else if (state.view === 'heat') html = `<div class="heat">${list.map(tile).join('')}</div>`;
      else if (state.view === 'list') html = listTable(list);
      else if (state.view === 'os') html = `<div class="grid">${['AIX', 'RHEL', 'UNKNOWN'].map(g => { const part = list.filter(s => groupOf(s) === g); return part.length ? `<div class="group-h">${esc(g === 'AIX' ? 'IBM AIX' : g === 'RHEL' ? 'Red Hat Linux' : 'Other')} <small>${part.length}</small></div>${part.map(card).join('')}` : ''; }).join('')}</div>`;
      else html = `<div class="grid">${list.map(card).join('')}</div>`;
      setHTML(box, html);
      /* incidents rail */
      const act = state.incidents.filter(i => i.status === 'ACTIVE'), shown = act.length ? act.slice(0, 5) : state.incidents.filter(i => i.status === 'RESOLVED').slice(0, 3);
      const sm = state.summary || {};
      setHTML(el('incbox'), `<div class="card-h"><span class="card-t">${tx('inc.center', 'Incident center')}</span><span class="spacer"></span><button class="btn btn--sm btn--ghost" type="button" data-act="all">${tx('common.viewAll', 'View all')} ${icon('chevR', 'icon--sm flip-rtl')}</button></div>
        <div class="card-b"><p class="muted mb-12">${sm.active ?? act.length} ${tx('inc.active', 'active')} · ${sm.resolved ?? 0} ${tx('inc.resolved', 'resolved')} · ${sm.total ?? state.incidents.length} ${tx('inc.total', 'total')}</p>
        <div class="list">${shown.length ? shown.map(incItem).join('') : `<div class="callout callout--ok">${icon('check')}<span>${tx('inc.allClear', 'No active incidents. All systems operational.')}</span></div>`}</div></div>`);
      /* copilot */
      const names = servers.map(s => s.name), sel = names.includes(copilotState.server) ? copilotState.server : (risk?.name || names[0] || '');
      copilotState.server = sel;
      setHTML(el('copilot'), `<div class="card-h"><span class="card-t">${tx('ai.title', 'SNG-AI copilot')}</span></div><div class="card-b copilot">
        ${can.operator ? `<div class="field"><label for="cp-srv">${tx('ai.pick', 'Server')}</label><select class="select" id="cp-srv">${names.map(n => `<option${n === sel ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
          <div class="row row--wrap"><button class="btn btn--primary" type="button" data-act="ai-server" ${copilotState.busy ? 'disabled' : ''}>${icon('sparkles', 'icon--sm')} ${tx('ai.analyzeServer', 'Analyze server')}</button>
          <select class="select select--auto" id="cp-range" aria-label="${esc(t('ai.range', 'Range'))}">${['1h', '6h', '24h', '7d'].map(r => `<option${r === copilotState.range ? ' selected' : ''}>${r}</option>`).join('')}</select>
          <button class="btn" type="button" data-act="ai-trend" ${copilotState.busy ? 'disabled' : ''}>${tx('ai.analyzeTrend', 'Analyze trend')}</button></div>`
          : `<div class="callout">${icon('info')}<span>${tx('ai.viewerNote', 'AI analysis is available to operators and admins.')}</span></div>`}
        <div id="cp-out" class="out" aria-live="polite"${copilotState.out || copilotState.busy ? '' : ' hidden'}>${copilotState.busy ? `<span class="muted">${tx('ai.working', 'Analyzing…')}</span>` : copilotState.out}</div></div>`);
      applyBars(root);
    });
  }
  const $$v = r => Array.from(r.querySelectorAll('#views [data-v]'));

  async function runAi(kind, id) {
    copilotState.busy = true; copilotState.out = ''; render();
    try {
      const r = kind === 'server' ? await aiServer(copilotState.server) : kind === 'trend' ? await aiTrend(copilotState.server, copilotState.range) : await aiIncident(id);
      const title = kind === 'server' ? copilotState.server : kind === 'trend' ? copilotState.server + ' · ' + copilotState.range : '#' + id;
      copilotState.out = `<p class="eyebrow">${esc(title)}${r?.model ? ' · ' + esc(r.model) : ''}</p>` + md(r?.analysis || r?.answer || t('ai.empty', 'No analysis returned.'));
    } catch (e) { copilotState.out = `<div class="callout callout--crit">${icon('alert')}<span>${esc(e.detail || e.message)}</span></div>`; }
    copilotState.busy = false; render();
  }

  root.addEventListener('click', async e => {
    const c = e.target.closest('[data-open],[data-f],[data-v],[data-act]'); if (!c) return;
    const d = c.dataset;
    try {
      if (d.open) return go('server', d.open);
      if (d.f) return patch({ filter: state.filter === d.f && d.f !== 'all' ? 'all' : d.f });
      if (d.v) return patch({ view: d.v });
      if (d.act === 'all') return go('incidents');
      if (d.act === 'open') return go('incidents', d.id);
      if (d.act === 'ai-server') return runAi('server');
      if (d.act === 'ai-trend') return runAi('trend');
      if (d.act === 'explain') return runAi('incident', d.id);
      if (d.act === 'ack') {
        if (!(await confirmBox({ title: t('inc.ackTitle', 'Acknowledge incident'), message: t('inc.ackMsg', 'Acknowledging does NOT resolve the incident. It resolves only when the service actually recovers.'), confirmLabel: t('inc.ack', 'Acknowledge') }))) return;
        await ackIncident(+d.id); success(t('inc.acked', 'Incident acknowledged'));
      }
    } catch (err) { failure(t('common.failed', 'Action failed'), err.detail || err.message); }
  });
  root.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open][role="button"],tr[data-open]')) { e.preventDefault(); go('server', e.target.dataset.open); } });
  root.addEventListener('change', e => {
    if (e.target.id === 'cp-srv') copilotState.server = e.target.value;
    if (e.target.id === 'cp-range') copilotState.range = e.target.value;
  });
  $q.addEventListener('input', () => patch({ query: $q.value }));
  $('#export', root).addEventListener('click', () => {
    download('servers-' + new Date().toISOString().slice(0, 10) + '.csv', toCsv([['server', 'os', 'status', 'cpu_pct', 'ram_pct', 'disk_pct', 'ip', 'hostname', 'services_down'],
      ...applyFilter(state.servers).map(s => { const m = metricsOf(s), st = serverStatus(s); return [s.name, s.os_type, st, m.cpu.toFixed(1), m.ram.toFixed(1), m.disk, s.machine?.ip, s.machine?.hostname, svcDown(s).map(x => x.name).join('; ')]; })]));
  });
  bindCopy(root);
  const unsub = subscribe(render); render();
  return () => unsub();
}
