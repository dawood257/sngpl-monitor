// User preferences (language / theme / layout): server-side via /preferences/me, cached locally for flash-free startup.
import { api, get } from './api.js';
import { loadLang, applyI18n } from './i18n.js';

const CACHE = 'sngpl_prefs_cache';   // same key as the production UI
const DEFAULTS = { language: 'en-US', theme: 'default', layout: 'comfortable' };
let prefs = { ...DEFAULTS }, options = null;
const subs = new Set();
export const onPrefs = fn => { subs.add(fn); return () => subs.delete(fn); };

export const getPrefs = () => ({ ...prefs });
export function readCache() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CACHE) || '{}') }; } catch { return { ...DEFAULTS }; } }

export async function applyPrefs(p, { reloadLang = true } = {}) {
  const prevLang = prefs.language;
  prefs = { ...DEFAULTS, ...prefs, ...p };
  localStorage.setItem(CACHE, JSON.stringify(prefs));
  const root = document.documentElement;
  root.dataset.theme = prefs.theme; root.dataset.layout = prefs.layout;
  if (reloadLang && (prefs.language !== prevLang || !root.lang)) { await loadLang(prefs.language); applyI18n(); }
  subs.forEach(fn => fn(prefs));
}
export const initPrefs = () => applyPrefs(readCache());          // before login: cached values only
export async function syncPrefs() {                              // after login: the account's saved values
  try { const remote = await get('/api/v1/preferences/me'); if (remote) await applyPrefs(remote); } catch { /* offline: keep cache */ }
}
export async function savePrefs(patch) {
  await applyPrefs(patch);
  const r = await api('/api/v1/preferences/me', { method: 'PATCH', body: patch });
  if (r?.data) await applyPrefs(r.data);
  return prefs;
}
export async function loadOptions() {
  if (options) return options;
  try { options = await get('/api/v1/preferences/options'); } catch { options = null; }
  return options || {
    languages: [{ code: 'en-US', label: 'English' }, { code: 'ur-PK', label: 'Urdu' }, { code: 'es-ES', label: 'Español' }],
    themes: [{ id: 'default', label: 'Default' }, { id: 'clean', label: 'Clean' }, { id: 'compact', label: 'Compact' }, { id: 'dark', label: 'Dark' }, { id: 'high-contrast', label: 'High Contrast' }],
    layouts: [{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }, { id: 'wide', label: 'Wide' }]
  };
}
