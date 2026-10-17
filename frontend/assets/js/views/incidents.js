import { state, subscribe, can } from '../core/store.js';
import { esc, fmtDate, duration, hms, nowSec, toCsv, download, setHTML, $, keepFocus } from '../core/util.js';
import { t, tx } from '../core/i18n.js';
import { icon } from '../ui/icons.js';
import { sevBadge, emptyState, incTitle } from '../ui/parts.js';
import { sevTone } from '../core/status.js';
import { openDialog, confirmBox } from '../ui/dialog.js';
import { md, bindCopy } from '../ui/md.js';
import { incidentDetail, ackIncident, aiIncident } from '../core/data.js';
import { go } from '../core/router.js';
import { success, failure } from '../ui/toast.js';

export function mount(root, arg) {
  const F = { tab: 'ACTIVE', sev: '', q: '' };
  root.innerHTML = `<div class="page-head"><div><h1>${tx('nav.incidents', 'Incidents')}</h1><p id="sub" class="muted"></p></div><span class="spacer"></span><button class="btn" id="csv" type="button">${icon('download', 'icon--sm')} CSV</button></div>
    <div class="toolbar mb-g"><div class="seg" id="tabs" role="group"></div><select class="select select--auto" id="sev" aria-label="${esc(t('inc.severity', 'Severity'))}"><option value="">${tx('inc.allSev', 'All severities')}</option><option>CRITICAL</option><option>WARNING</option><option>INFO</option></select>
      <div class="search-wrap search-wrap--md">${icon('search', 'icon--sm')}<input class="input input--search" id="q" type="search" placeholder="${esc(t('inc.search', 'Search server, service, message'))}" maxlength="80" aria-label="${esc(t('inc.search', 'Search'))}"></div></div>
    <div class="card tbl-wrap" id="tbl"></div>`;
  const list = () => state.incidents.filter(i => (F.tab === 'ALL' || i.status === F.tab) && (!F.sev || i.severity === F.sev)
    && (!F.q || [i.server, i.service, i.message].some(v => String(v || '').toLowerCase().includes(F.q))));

  function render() {
    keepFocus(root, () => {
      const all = state.incidents, n = { ACTIVE: all.filter(i => i.status === 'ACTIVE').length, RESOLVED: all.filter(i => i.status === 'RESOLVED').length, ALL: all.length };
      $('#sub', root).textContent = `${n.ACTIVE} ${t('inc.active', 'active')} · ${n.RESOLVED} ${t('inc.resolved', 'resolved')}`;
      $('#tabs', root).innerHTML = [['ACTIVE', 'inc.tabActive', 'Active'], ['RESOLVED', 'inc.tabResolved', 'Resolved'], ['ALL', 'inc.tabAll', 'All']].map(([k, key, l]) => `<button type="button" data-v="${k}" class="${F.tab === k ? 'is-active' : ''}" aria-pressed="${F.tab === k}">${esc(t(key, l))} <span class="kbd">${n[k]}</span></button>`).join('');
      const rows = list();
      const tblHtml = rows.length ? `<table class="tbl"><thead><tr><th>${tx('inc.severity', 'Severity')}</th><th>${tx('inc.incident', 'Incident')}</th><th>${tx('col.server', 'Server')}</th><th>${tx('col.status', 'Status')}</th><th>${tx('inc.openFor', 'Open for')}</th><th>${tx('inc.detected', 'Detected')}</th><th></th></tr></thead><tbody>${rows.map(i => {
        const act = i.status === 'ACTIVE';
        return `<tr class="is-click" data-id="${i.id}" tabindex="0"><td>${sevBadge(i)}</td><td><b>${esc(incTitle(i))}</b>${i.service ? `<div class="muted fs-12">${esc(i.service)}${i.category ? ' · ' + esc(i.category) : ''}</div>` : ''}</td><td class="mono">${esc(i.server)}</td>
          <td>${act ? `<span class="badge badge--${sevTone(i)}">ACTIVE</span>` : '<span class="badge badge--ok">RESOLVED</span>'} ${i.acknowledged ? `<span class="badge badge--info">ACK ${esc(i.acknowledged_by || '')}</span>` : ''}</td>
          <td class="mono">${act ? `<span class="sla" data-sla="${i.first_detected}">${hms(nowSec() - i.first_detected)}</span>` : esc(duration(i.first_detected, i.resolved_at))}</td><td class="muted">${esc(fmtDate(i.first_detected))}</td>
          <td><div class="tbl-actions"><button class="btn btn--sm" data-act="open" data-id="${i.id}">${tx('common.details', 'Details')}</button>${can.operator && act && !i.acknowledged ? `<button class="btn btn--sm btn--primary" data-act="ack" data-id="${i.id}">${tx('inc.ack', 'Acknowledge')}</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table>`
        : emptyState(icon(F.tab === 'ACTIVE' ? 'check' : 'inbox'), F.tab === 'ACTIVE' ? t('inc.allClear', 'No active incidents. All systems operational.') : t('inc.noMatch', 'No incidents match your filters'));
      setHTML($('#tbl', root), tblHtml);
    });
  }

  let drawer = null;
  async function showDetail(id) {
    drawer?.close();
    let inc; try { inc = await incidentDetail(id); } catch (e) { failure(t('inc.loadFail', 'Could not load the incident'), e.detail || e.message); return go('incidents'); }
    const act = inc.status === 'ACTIVE', kv = (k, v) => `<dt>${esc(k)}</dt><dd>${esc(v ?? '--')}</dd>`;
    const ev = (inc.events || []).map(e => `<li class="t-${String(e.type).toLowerCase()}"><time>${esc(new Date(e.ts * 1000).toLocaleString())}</time><b>${esc(e.type)}</b> ${esc(e.detail || '')}</li>`).join('');
    const body = `<div class="stack"><div class="row row--wrap">${sevBadge(inc)}${inc.acknowledged ? `<span class="badge badge--info">${tx('inc.ackBy', 'ACK')} ${esc(inc.acknowledged_by || '')}</span>` : ''}</div>
      <h3 class="fs-19">${esc(incTitle(inc))}</h3><div class="mono muted">${esc(inc.server)}${inc.service ? ' · ' + esc(inc.service) : ''}</div>
      <dl class="kvs">${kv(t('col.status', 'Status'), inc.status)}${kv(t('inc.category', 'Category'), inc.category)}${kv(t('inc.severity', 'Severity'), inc.severity)}${kv(t('inc.detected', 'Detected'), fmtDate(inc.first_detected))}${kv(t('inc.lastSeen', 'Last seen'), fmtDate(inc.last_seen))}${inc.resolved_at ? kv(t('inc.resolvedAt', 'Resolved'), fmtDate(inc.resolved_at)) : ''}${kv(t('inc.duration', 'Duration'), duration(inc.first_detected, inc.resolved_at))}${kv(t('inc.failures', 'Failures'), inc.failure_count)}</dl>
      <div class="row row--wrap">${can.operator ? `<button class="btn btn--primary" id="d-ai" type="button">${icon('sparkles', 'icon--sm')} ${tx('ai.explainInc', 'Explain this incident')}</button>` : ''}${can.operator && act && !inc.acknowledged ? `<button class="btn" id="d-ack" type="button">${icon('check', 'icon--sm')} ${tx('inc.ack', 'Acknowledge')}</button>` : ''}<button class="btn btn--ghost" id="d-srv" type="button">${icon('server', 'icon--sm')} ${tx('inc.openServer', 'Open server')}</button></div>
      <div id="d-out" class="out" hidden></div>
      ${ev ? `<div><span class="eyebrow">${tx('inc.timeline', 'Timeline')} (${inc.events.length})</span><ul class="tl mt-12">${ev}</ul></div>` : ''}</div>`;
    drawer = openDialog({ title: t('inc.detail', 'Incident') + ' #' + inc.id, body, drawer: true, onClose: () => { drawer = null; if (location.hash.startsWith('#/incidents/')) go('incidents'); } });
    bindCopy(drawer.el);
    const b = drawer.body;
    b.querySelector('#d-srv').onclick = () => { drawer.close(); go('server', inc.server); };
    const ai = b.querySelector('#d-ai');
    if (ai) ai.onclick = async () => { const out = b.querySelector('#d-out'); out.hidden = false; out.innerHTML = `<span class="muted">${tx('ai.working', 'Analyzing…')}</span>`; ai.disabled = true;
      try { const r = await aiIncident(inc.id); out.innerHTML = md(r?.analysis || t('ai.empty', 'No analysis returned.')); } catch (e) { out.innerHTML = `<div class="callout callout--crit">${icon('alert')}<span>${esc(e.detail || e.message)}</span></div>`; } ai.disabled = false; };
    const ack = b.querySelector('#d-ack');
    if (ack) ack.onclick = () => doAck(inc.id, true);
  }
  async function doAck(id, reopen) {
    if (!(await confirmBox({ title: t('inc.ackTitle', 'Acknowledge incident'), message: t('inc.ackMsg', 'Acknowledging does NOT resolve the incident. It resolves only when the service actually recovers.'), confirmLabel: t('inc.ack', 'Acknowledge') }))) return;
    try { await ackIncident(id); success(t('inc.acked', 'Incident acknowledged')); if (reopen) showDetail(id); } catch (e) { failure(t('common.failed', 'Action failed'), e.detail || e.message); }
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-v],[data-act]');
    if (b?.dataset.v) { F.tab = b.dataset.v; return render(); }
    if (b?.dataset.act === 'open') return go('incidents', b.dataset.id);
    if (b?.dataset.act === 'ack') return doAck(+b.dataset.id);
    const tr = e.target.closest('tr[data-id]'); if (tr) go('incidents', tr.dataset.id);
  });
  root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) go('incidents', e.target.dataset.id); });
  $('#sev', root).addEventListener('change', e => { F.sev = e.target.value; render(); });
  $('#q', root).addEventListener('input', e => { F.q = e.target.value.trim().toLowerCase(); render(); });
  $('#csv', root).addEventListener('click', () => download('incidents-' + new Date().toISOString().slice(0, 10) + '.csv', toCsv([['id', 'server', 'service', 'category', 'severity', 'status', 'message', 'detected', 'resolved', 'acknowledged_by'],
    ...list().map(i => [i.id, i.server, i.service, i.category, i.severity, i.status, i.message, fmtDate(i.first_detected), i.resolved_at ? fmtDate(i.resolved_at) : '', i.acknowledged_by])])));
  const unsub = subscribe(render); render();
  if (arg) showDetail(+arg);
  return () => { unsub(); drawer?.close(); };
}
