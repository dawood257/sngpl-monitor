import { $ } from '../core/util.js';
import { t } from '../core/i18n.js';

const LABEL = { crit: ['CRITICAL', 'toast.critical'], warn: ['WARNING', 'toast.warning'], ok: ['RECOVERED', 'toast.recovered'], info: ['INFO', 'toast.info'], done: ['DONE', 'toast.done'], error: ['ERROR', 'toast.error'] };
export function toast(kind, title, meta = '', onClick) {
  const host = $('#toasts'); if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast toast--' + kind; el.setAttribute('role', kind === 'crit' || kind === 'error' ? 'alert' : 'status');
  const mk = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; return d; };
  const act = document.createElement('div'); act.className = 'toast__a';
  const view = Object.assign(document.createElement('button'), { className: 'btn btn--sm', type: 'button', textContent: t('common.view', 'View') });
  const dis = Object.assign(document.createElement('button'), { className: 'btn btn--sm btn--ghost', type: 'button', textContent: t('common.dismiss', 'Dismiss') });
  act.append(...(onClick ? [view, dis] : [dis]));
  el.append(mk('toast__k', t(LABEL[kind]?.[1], LABEL[kind]?.[0] || kind)), mk('toast__t', title), mk('toast__m', meta), act);
  const close = () => { if (!el.isConnected) return; el.classList.add('is-leaving'); setTimeout(() => el.remove(), 300); };
  view.onclick = e => { e.stopPropagation(); onClick?.(); close(); };
  dis.onclick = e => { e.stopPropagation(); close(); };
  el.onclick = () => { onClick?.(); close(); };
  host.append(el);
  while (host.children.length > 4) host.firstChild.remove();
  setTimeout(close, 8000);
}
export const info = (title, meta) => toast('info', title, meta);
export const success = (title, meta) => toast('done', title, meta);
export const failure = (title, meta) => toast('error', title, meta);
