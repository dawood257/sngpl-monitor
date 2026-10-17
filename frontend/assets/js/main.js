import { $, $$, esc, timeAgo, startTicker, nowSec } from './core/util.js';
import { api, login as doLogin, me, getToken, setToken } from './core/api.js';
import { state, patch, subscribe, upsertServer, can } from './core/store.js';
import { kpis, serverStatus } from './core/status.js';
import { t, applyI18n } from './core/i18n.js';
import { initPrefs, syncPrefs, savePrefs, getPrefs, onPrefs } from './core/prefs.js';
import { startWS, stopWS } from './core/ws.js';
import { refreshServers, refreshIncidents, startPolling, stopPolling, seedHistories } from './core/data.js';
import { soundOn, setSound } from './core/alerts.js';
import { parse, go, onRoute } from './core/router.js';
import { icon } from './ui/icons.js';
import { initPalette, openPalette } from './ui/palette.js';
import { openServerModal, closeServerModal } from './views/server-modal.js';
import { incTitle } from './ui/parts.js';

const PAGES = {
  dashboard: () => import('./views/dashboard.js'), incidents: () => import('./views/incidents.js'), sessions: () => import('./views/sessions.js'),
  analytics: () => import('./views/analytics.js'), users: () => import('./views/users.js'), settings: () => import('./views/settings.js')
};
let cur = { page: null, arg: null, unmount: null }, lang = null, seeded = false;

const hideBoot = () => { const b = $('#boot'); if (!b) return; b.classList.add('is-done'); setTimeout(() => b.remove(), 400); };
const fillIcons = (root = document) => root.querySelectorAll('[data-ico]').forEach(el => { el.innerHTML = icon(el.dataset.ico); });

/* ---------- login / logout ---------- */
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; applyI18n($('#login')); hideBoot(); $('#lu').focus(); }
function logout() { setToken(''); stopWS(); stopPolling(); location.hash = ''; location.reload(); }
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#login-btn'), err = $('#login-err'); err.textContent = ''; btn.disabled = true;
  try { await doLogin($('#lu').value, $('#lp').value); }
  catch (x) { err.textContent = x.status === 0 ? x.message : t('login.failed', 'Login failed'); btn.disabled = false; return; }
  try { await enter(await me()); }
  catch (x) { console.error('start failed', x); $('#login').hidden = false; $('#app').hidden = true; err.textContent = t('login.startFail', 'Signed in, but the dashboard could not start') + ': ' + x.message; }
  finally { btn.disabled = false; }
});
$('#pw-toggle').addEventListener('click', () => { const p = $('#lp'), show = p.type === 'password'; p.type = show ? 'text' : 'password'; $('#pw-toggle').innerHTML = icon(show ? 'eyeOff' : 'eye'); });
document.addEventListener('auth:expired', () => { if (getToken()) logout(); });

/* ---------- enter the app ---------- */
async function enter(user) {
  patch({ user });
  $('#login').hidden = true; $('#app').hidden = false;
  fillIcons(); $('#nav-users').hidden = !can.admin;
  $('#sb-user').textContent = user.display_name || user.username; $('#sb-role').textContent = user.role;
  $('#b-user').textContent = (user.display_name || user.username || '?').slice(0, 2).toUpperCase();
  await syncPrefs(); lang = getPrefs().language; applyI18n(); paintSound(); paintTheme();
  startTicker(); hideBoot(); route(true);
  await Promise.all([refreshServers(), refreshIncidents()]);
  startPolling();
  startWS({ metric: (name, data) => upsertServer(Object.assign({ name, status: 'online', age_sec: 0 }, data)), prefs: p => import('./core/prefs.js').then(m => m.applyPrefs(p)), state: s => patch({ ws: s }), expired: logout });
  if (!seeded) { seeded = true; seedHistories(state.servers.map(s => s.name)); }
}

/* ---------- routing ---------- */
async function mountPage(page, arg, force = false) {
  if (!force && cur.page === page && cur.arg === arg) return;
  cur.unmount?.(); cur = { page, arg, unmount: null };
  const view = $('#view'); view.innerHTML = '';
  const host = document.createElement('div'); view.append(host);        // fresh node per page so old listeners die with it
  try { const mod = await PAGES[page](); if (cur.page !== page) return; cur.unmount = mod.mount(host, arg); }
  catch (e) { console.error(e); host.innerHTML = `<div class="empty"><b>${esc(t('common.pageFail', 'This page failed to load'))}</b><span>${esc(e.message)}</span></div>`; }
}
function route(force = false) {
  let { page, arg } = parse();
  if (page === 'server') {
    if (cur.page !== 'dashboard') mountPage('dashboard', null);
    markNav('dashboard'); openServerModal(arg, { onClose: () => { if (location.hash.startsWith('#/server/')) go('dashboard'); } }); return;
  }
  closeServerModal();
  if (!PAGES[page] || (page === 'users' && !can.admin)) { page = 'dashboard'; arg = ''; history.replaceState(null, '', '#/dashboard'); }
  markNav(page); document.body.classList.remove('nav-open'); mountPage(page, arg || null, force);
}
const markNav = page => $$('#nav a, #sidebar a[data-route]').forEach(a => (a.dataset.route === page ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')) || a.classList.toggle('is-active', a.dataset.route === page));
onRoute(() => { if (!$('#app').hidden) route(); });

/* ---------- top bar ---------- */
const menus = { bell: [$('#b-bell'), $('#bell-menu')], user: [$('#b-user'), $('#user-menu')] };
function closeMenus() { Object.values(menus).forEach(([b, m]) => { m.hidden = true; b.setAttribute('aria-expanded', 'false'); }); }
function toggleMenu(k, html) { const [b, m] = menus[k], was = !m.hidden; closeMenus(); if (was) return; m.innerHTML = html; m.hidden = false; b.setAttribute('aria-expanded', 'true'); fillIcons(m); }
$('#b-bell').addEventListener('click', e => {
  e.stopPropagation();
  const un = state.incidents.filter(i => i.status === 'ACTIVE' && !i.acknowledged);
  toggleMenu('bell', `<div class="menu-h">${esc(t('bell.title', 'Needs attention'))}</div>${un.length ? un.slice(0, 6).map(i => `<button class="menu-item" data-go="${i.id}"><span class="dot dot--${i.severity === 'CRITICAL' ? 'crit' : 'warn'}"></span><span class="truncate minw0"><b class="block truncate">${esc(incTitle(i))}</b><small class="muted">${esc(i.server)}${i.service ? ' · ' + esc(i.service) : ''}</small></span></button>`).join('') : `<div class="menu-empty">${esc(t('bell.none', 'Nothing needs attention'))}</div>`}<div class="menu-sep"></div><button class="menu-item" data-go="all">${esc(t('common.viewAll', 'View all'))}</button>`);
});
$('#bell-menu').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (!b) return; closeMenus(); b.dataset.go === 'all' ? go('incidents') : go('incidents', b.dataset.go); });
$('#b-user').addEventListener('click', e => {
  e.stopPropagation(); const u = state.user || {};
  toggleMenu('user', `<div class="menu-h">${esc(u.display_name || u.username || '')} · ${esc(u.role || '')}</div><button class="menu-item" data-go="settings"><span data-ico="settings"></span>${esc(t('nav.settings', 'Settings'))}</button><button class="menu-item" data-go="logout"><span data-ico="logout"></span>${esc(t('common.signout', 'Sign out'))}</button>`);
});
$('#user-menu').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (!b) return; closeMenus(); b.dataset.go === 'logout' ? logout() : go('settings'); });
document.addEventListener('click', closeMenus);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
$('#tb-search').addEventListener('click', openPalette);
$('#nav-toggle').addEventListener('click', e => { e.stopPropagation(); document.body.classList.toggle('nav-open'); });
document.addEventListener('click', e => { if (document.body.classList.contains('nav-open') && !e.target.closest('#sidebar')) document.body.classList.remove('nav-open'); });
const paintSound = () => { const b = $('#b-sound'); b.innerHTML = icon(soundOn ? 'volume' : 'volumeOff'); b.classList.toggle('is-off', !soundOn); b.setAttribute('aria-pressed', soundOn); };
$('#b-sound').addEventListener('click', () => { setSound(!soundOn); paintSound(); });
const paintTheme = () => { const light = getPrefs().theme === 'clean'; $('#b-theme').innerHTML = icon(light ? 'moon' : 'sun'); };
$('#b-theme').addEventListener('click', () => savePrefs({ theme: getPrefs().theme === 'clean' ? 'default' : 'clean' }).catch(() => {}));
$('#banner-retry').addEventListener('click', () => { refreshServers(); refreshIncidents(); });

/* ---------- reactive chrome ---------- */
subscribe(s => {
  const k = kpis(s.servers, s.incidents), unacked = s.incidents.filter(i => i.status === 'ACTIVE' && !i.acknowledged).length;
  $('#p-health').textContent = k.total ? k.health + '%' : '--';
  const live = s.ws === 'live', ws = $('#p-ws');
  ws.querySelector('.dot').className = 'dot ' + (live ? 'dot--ok dot--live' : 'dot--warn');
  $('#p-ws-t').textContent = live ? t('ws.live', 'LIVE') : s.ws === 'connecting' ? t('ws.connecting', 'CONNECTING') : t('ws.recon', 'RECONNECTING');
  $('#p-crit-n').textContent = k.critical; $('#p-crit').classList.toggle('pill--crit', k.critical > 0);
  const n = $('#bell-n'); n.hidden = !unacked; n.textContent = unacked;
  const nb = $('#nav-inc'); nb.hidden = !k.alerts; nb.textContent = k.alerts;
  const bn = $('#banner'); bn.hidden = !s.error; if (s.error) $('#banner-t').textContent = t('banner.err', 'Cannot reach the server.') + (s.lastUpdate ? ' ' + t('banner.last', 'Last update') + ': ' + new Date(s.lastUpdate).toLocaleTimeString() : '');
  document.title = (k.critical ? `(${k.critical}) ` : '') + 'SNGPL Monitor';
});
onPrefs(p => { paintTheme(); if (p.language !== lang) { lang = p.language; applyI18n(); if (cur.page) mountPage(cur.page, cur.arg, true); } });

/* ---------- start ---------- */
initPalette();
(async () => {
  fillIcons(); await initPrefs(); applyI18n();
  if (getToken()) { try { await enter(await me()); return; } catch (e) { if (e.status === 401 || e.status === 403) setToken(''); else { hideBoot(); $('#login').hidden = false; $('#login-err').textContent = e.message; return; } } }
  showLogin();
})();
