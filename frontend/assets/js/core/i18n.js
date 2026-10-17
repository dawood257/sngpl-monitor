// Small translation layer. Uses /locales/<lang>.json (same files as before, extended). Missing keys fall back to English text in code.
import { esc } from './util.js';
let dict = {}, lang = 'en-US';
const RTL = new Set(['ur-PK', 'ar', 'ar-SA', 'he']);
export const isRtl = () => RTL.has(lang);
export const currentLang = () => lang;

export async function loadLang(code) {
  lang = code || 'en-US';
  try {
    const r = await fetch(new URL('../../../locales/' + lang + '.json', import.meta.url));
    dict = r.ok ? await r.json() : {};
  } catch { dict = {}; }
  document.documentElement.lang = lang.split('-')[0];
  document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
}
export function t(key, fallback, vars) {
  let s = dict[key] ?? fallback ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}
export const tx = (key, fb, vars) => esc(t(key, fb, vars));   // translated and escaped, for templates
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n, el.textContent); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh, el.placeholder); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle, el.title); });
}
