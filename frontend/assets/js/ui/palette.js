// Ctrl/Cmd+K command palette: jump to servers, incidents and pages, or run quick actions.
import { state, can } from '../core/store.js';
import { serverStatus, tone } from '../core/status.js';
import { esc, toCsv, download } from '../core/util.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';
import { go } from '../core/router.js';
import { incTitle } from './parts.js';
import { setSound, soundOn } from '../core/alerts.js';
import { savePrefs, getPrefs } from '../core/prefs.js';
import { success } from './toast.js';

let dlg = null, items = [], idx = 0;

function build(q) {
  q = q.trim().toLowerCase();
  const m = s => !q || s.toLowerCase().includes(q);
  const pages = [['dashboard', 'dashboard', t('nav.dashboard', 'Dashboard')], ['incidents', 'bell', t('nav.incidents', 'Incidents')], ['sessions', 'terminal', t('nav.sessions', 'Session manager')], ['analytics', 'layers', t('nav.analytics', 'Analytics & AI')], ...(can.admin ? [['users', 'users', t('nav.users', 'Users & audit')]] : []), ['settings', 'settings', t('nav.settings', 'Settings')]]
    .filter(([, , l]) => m(l)).map(([p, ic, l]) => ({ g: t('pal.pages', 'Pages'), ic, label: l, hint: '', run: () => go(p) }));
  const servers = state.servers.filter(s => m(s.name) || m(String(s.machine?.ip || '')) || m(String(s.machine?.hostname || ''))).slice(0, 7)
    .map(s => ({ g: t('pal.servers', 'Servers'), ic: 'server', label: s.name, mono: true, hint: serverStatus(s).toUpperCase(), tn: tone(serverStatus(s)), sub: s.machine?.ip || '', run: () => go('server', s.name) }));
  const incs = state.incidents.filter(i => i.status === 'ACTIVE' && (m(incTitle(i)) || m(i.server))).slice(0, 4)
    .map(i => ({ g: t('pal.incidents', 'Incidents'), ic: 'alert', label: incTitle(i), sub: i.server, hint: i.severity, tn: i.severity === 'CRITICAL' ? 'crit' : 'warn', run: () => go('incidents', i.id) }));
  const acts = [
    { g: t('pal.actions', 'Actions'), ic: 'download', label: t('pal.exportCsv', 'Export servers as CSV'), run: () => download('servers.csv', toCsv([['server', 'status', 'ip'], ...state.servers.map(s => [s.name, serverStatus(s), s.machine?.ip])])) },
    { g: t('pal.actions', 'Actions'), ic: soundOn ? 'volumeOff' : 'volume', label: soundOn ? t('pal.mute', 'Mute alert sounds') : t('pal.unmute', 'Unmute alert sounds'), run: () => { setSound(!soundOn); success(!soundOn ? t('set.soundOn', 'Alert sounds on') : t('set.soundOff', 'Alert sounds muted')); } },
    { g: t('pal.actions', 'Actions'), ic: 'sun', label: t('pal.toggleTheme', 'Switch light / dark theme'), run: () => savePrefs({ theme: getPrefs().theme === 'clean' ? 'default' : 'clean' }).catch(() => {}) }
  ].filter(a => m(a.label));
  if (can.operator && q) state.servers.filter(s => q.includes(s.name.toLowerCase())).slice(0, 1).forEach(s => acts.unshift({ g: t('pal.actions', 'Actions'), ic: 'sparkles', label: t('pal.aiOn', 'Run AI diagnostics on') + ' ' + s.name, run: () => go('server', s.name) }));
  return [...servers, ...incs, ...pages, ...acts];
}
function paint() {
  const list = dlg.querySelector('.pal__list'); let last = '';
  list.innerHTML = items.length ? items.map((it, i) => { const head = it.g !== last ? `<li class="pal__g" role="presentation">${esc(it.g)}</li>` : ''; last = it.g;
    return `${head}<li class="pal__item" role="option" data-i="${i}" aria-selected="${i === idx}">${icon(it.ic, 'icon--sm')}${it.tn ? `<span class="dot dot--${it.tn}"></span>` : ''}<span class="${it.mono ? 'mono' : ''}">${esc(it.label)}</span>${it.sub ? `<span class="muted mono fs-12">${esc(it.sub)}</span>` : ''}<span class="spacer"></span>${it.hint ? `<span class="badge badge--${it.tn || 'off'}">${esc(it.hint)}</span>` : ''}</li>`; }).join('') : `<li class="menu-empty">${esc(t('pal.none', 'No matches'))}</li>`;
  list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}
const run = i => { const it = items[i]; if (!it) return; dlg.close(); it.run(); };

export function openPalette() {
  if (dlg?.open) return;
  dlg = document.createElement('dialog'); dlg.className = 'pal'; dlg.setAttribute('aria-label', t('pal.title', 'Command palette'));
  dlg.innerHTML = `<div class="modal"><div class="pal__in">${icon('search')}<input id="pal-q" type="text" autocomplete="off" spellcheck="false" placeholder="${esc(t('pal.ph', 'Jump to a server, incident or page…'))}" aria-label="${esc(t('pal.title', 'Command palette'))}"><span class="kbd">Esc</span></div><ul class="pal__list" role="listbox"></ul><div class="pal__foot"><span><span class="kbd">↑</span> <span class="kbd">↓</span> ${esc(t('pal.move', 'move'))}</span><span><span class="kbd">Enter</span> ${esc(t('pal.open', 'open'))}</span><span><span class="kbd">Esc</span> ${esc(t('pal.close', 'close'))}</span></div></div>`;
  document.body.append(dlg);
  const input = dlg.querySelector('#pal-q'); idx = 0; items = build(''); paint();
  input.addEventListener('input', () => { idx = 0; items = build(input.value); paint(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(idx); }
  });
  dlg.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) run(+li.dataset.i); else if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal(); input.focus();
}
export function initPalette() {
  document.addEventListener('keydown', e => {
    if (document.getElementById('app').hidden) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { e.preventDefault(); openPalette(); }
  });
}
