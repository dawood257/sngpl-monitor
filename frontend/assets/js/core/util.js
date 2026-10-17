// Every piece of server-supplied text goes through esc() before it reaches innerHTML.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function debounce(fn, ms = 150) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function frame(fn) { let q = false; return () => { if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(); }); }; }

export const nowSec = () => Math.floor(Date.now() / 1000);
export function timeAgo(ts) {
  if (!ts) return '--';
  let s = Math.max(0, nowSec() - ts);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
export function duration(t1, t2) {
  if (!t1) return '--';
  const s = Math.max(0, (t2 || nowSec()) - t1);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
}
export function hms(sec) {
  sec = Math.max(0, Math.floor(sec));
  const p = n => String(n).padStart(2, '0');
  return p(Math.floor(sec / 3600)) + ':' + p(Math.floor((sec % 3600) / 60)) + ':' + p(sec % 60);
}
export const fmtUptime = sec => {
  if (!sec) return '--';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600);
  return d ? `${d}d ${h}h` : `${h}h ${Math.floor((sec % 3600) / 60)}m`;
};
export const fmtGB = mb => (num(mb) / 1024).toFixed(1) + ' GB';
export function fmtKB(kb) {
  kb = num(kb);
  if (kb >= 1048576) return (kb / 1048576).toFixed(2) + ' GB';
  if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
  return kb + ' KB';
}
export const fmtDate = ts => (ts ? new Date(ts * 1000).toLocaleString() : '--');
export const fmtTime = ts => (ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--');

// CSV with spreadsheet-formula injection protection
export const csvCell = v => {
  const t = v == null ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(t) ? "'" + t : t;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const toCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n');
export function download(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename.replace(/[^A-Za-z0-9._-]/g, '_') });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove(); return ok;
  }
}
export const initials = s => String(s || '?').trim().split(/[\s._-]+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || '?';

// Only touch the DOM when the markup really changed (keeps clicks, open dropdowns and focus stable during live updates).
export function setHTML(el, html) { if (el.__h === html) return false; el.__h = html; el.innerHTML = html; return true; }
// Bars are sized with JS (data-w) after render, so no inline style attributes are needed in the markup.
export function applyBars(root) { root.querySelectorAll('[data-w]').forEach(el => { el.style.width = Math.min(100, Math.max(0, +el.dataset.w || 0)) + '%'; }); }
// Re-rendering replaces elements; put keyboard focus back on the same control afterwards.
export function keepFocus(root, fn) {
  const a = document.activeElement;
  let sel = null;
  if (a && root.contains(a)) for (const k of ['data-open', 'data-act', 'data-f', 'data-v', 'data-tab', 'data-id']) if (a.hasAttribute(k)) { sel = `[${k}="${CSS.escape(a.getAttribute(k))}"]`; break; }
  fn();
  if (sel) root.querySelector(sel)?.focus({ preventScroll: true });
}
// 1-second ticker for live SLA timers and relative times: elements carry data-sla / data-ago with an epoch-seconds value.
let tickTimer = null;
export function startTicker() {
  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    document.querySelectorAll('[data-sla]').forEach(el => { el.textContent = hms(nowSec() - (+el.dataset.sla || nowSec())); });
    document.querySelectorAll('[data-ago]').forEach(el => { el.textContent = timeAgo(+el.dataset.ago); });
  }, 1000);
}
