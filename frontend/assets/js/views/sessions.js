import { esc, $, keepFocus, setHTML, toCsv, download } from '../core/util.js';
import { t, tx } from '../core/i18n.js';
import { icon } from '../ui/icons.js';
import { get } from '../core/api.js';
import { emptyState, osBadge } from '../ui/parts.js';
import { go } from '../core/router.js';

const grp = s => (s.os_type === 'AIX' ? 'AIX' : 'RHEL');
export function mount(root, arg) {
  const F = { f: 'all', server: arg || '', q: '' };
  let rows = [], err = '', loading = true, alive = true;
  root.innerHTML = `<div class="page-head"><div><h1>${tx('nav.sessions', 'Session manager')}</h1><p id="sub" class="muted"></p></div><span class="spacer"></span><button class="btn" id="refresh" type="button">${icon('refresh', 'icon--sm')} ${tx('common.refresh', 'Refresh')}</button><button class="btn" id="csv" type="button">${icon('download', 'icon--sm')} CSV</button></div>
    <div class="toolbar mb-g"><div class="filters" id="filters"></div><select class="select select--auto" id="srv" aria-label="${esc(t('col.server', 'Server'))}"></select>
      <div class="search-wrap search-wrap--md">${icon('search', 'icon--sm')}<input class="input input--search" id="q" type="search" placeholder="${esc(t('ses.search', 'Search user, IP, TTY'))}" maxlength="64" aria-label="${esc(t('ses.search', 'Search'))}"></div></div>
    <div class="card tbl-wrap" id="tbl"></div>`;
  const view = () => rows.filter(r => (F.f === 'all' || grp(r) === F.f) && (!F.server || r.server === F.server) && (!F.q || [r.user, r.source_ip, r.tty, r.server].some(v => String(v || '').toLowerCase().includes(F.q))));
  function render() {
    keepFocus(root, () => {
      const v = view(), servers = [...new Set(rows.map(r => r.server))].sort();
      $('#sub', root).textContent = err || t('ses.summary', '{n} active sessions on {m} servers', { n: rows.length, m: servers.length });
      $('#filters', root).innerHTML = [['all', t('filter.all', 'All')], ['RHEL', 'RHEL'], ['AIX', 'AIX']].map(([k, l]) => `<button type="button" class="chip${F.f === k ? ' is-active' : ''}" data-f="${k}" aria-pressed="${F.f === k}">${esc(l)}<span class="n">${k === 'all' ? rows.length : rows.filter(r => grp(r) === k).length}</span></button>`).join('');
      const sel = $('#srv', root); sel.innerHTML = `<option value="">${tx('ses.allServers', 'All servers')}</option>` + servers.map(s => `<option${s === F.server ? ' selected' : ''}>${esc(s)}</option>`).join('');
      const tblHtml = loading ? '<div class="skeleton"></div>' : err ? emptyState(icon('alert'), err) : v.length ? `<table class="tbl"><thead><tr><th>${tx('col.server', 'Server')}</th><th>OS</th><th>${tx('col.user', 'User')}</th><th>TTY</th><th>${tx('ses.ip', 'Source IP')}</th><th>${tx('ses.login', 'Login time')}</th><th>${tx('ses.type', 'Type')}</th></tr></thead><tbody>${v.map(r => `<tr><td><a class="mono" href="#/server/${encodeURIComponent(r.server)}"><b>${esc(r.server)}</b></a></td><td><span class="badge badge--${grp(r) === 'AIX' ? 'aix' : 'rhel'}">${grp(r)}</span></td><td class="mono"><b>${esc(r.user)}</b></td><td class="mono">${esc(r.tty)}</td><td class="mono">${esc(r.source_ip)}</td><td class="mono muted">${esc(r.login_time)}</td><td><span class="badge badge--off">${esc(r.type || 'SSH')}</span></td></tr>`).join('')}</tbody></table>` : emptyState(icon('terminal'), t('ses.none', 'No active sessions'));
      setHTML($('#tbl', root), tblHtml);
    });
  }
  async function load() { try { rows = (await get('/api/v1/sessions')) || []; err = ''; } catch (e) { err = e.detail || e.message; } loading = false; if (alive) render(); }
  root.addEventListener('click', e => { const c = e.target.closest('[data-f]'); if (c) { F.f = c.dataset.f; render(); } });
  $('#srv', root).addEventListener('change', e => { F.server = e.target.value; render(); });
  $('#q', root).addEventListener('input', e => { F.q = e.target.value.trim().toLowerCase(); render(); });
  $('#refresh', root).addEventListener('click', load);
  $('#csv', root).addEventListener('click', () => download('sessions-' + new Date().toISOString().slice(0, 10) + '.csv', toCsv([['server', 'os', 'user', 'tty', 'source_ip', 'login_time', 'type'], ...view().map(r => [r.server, r.os_type, r.user, r.tty, r.source_ip, r.login_time, r.type])])));
  const timer = setInterval(load, 15000); render(); load();
  return () => { alive = false; clearInterval(timer); };
}
