import { icon } from './icons.js';
import { t } from '../core/i18n.js';

/** openDialog({title, body(html|Node), foot:[{label,cls,onClick,keepOpen}], width, drawer, cls, onClose}) -> {el, body, close} */
export function openDialog({ title = '', body = '', foot = [], width, drawer = false, cls = '', onClose, headExtra } = {}) {
  const el = document.createElement('dialog');
  el.className = (drawer ? 'drawer ' : '') + cls;
  el.setAttribute('aria-label', title || 'Dialog');
  const modal = document.createElement('div'); modal.className = 'modal';
  if (width) modal.style.setProperty('--w', width);
  const head = document.createElement('header'); head.className = 'modal__head';
  const h2 = document.createElement('h2'); h2.textContent = title;
  const sp = Object.assign(document.createElement('span'), { className: 'spacer' });
  const x = Object.assign(document.createElement('button'), { className: 'icon-btn', type: 'button', innerHTML: icon('x') });
  x.setAttribute('aria-label', t('common.close', 'Close'));
  head.append(h2, ...(headExtra ? [headExtra] : []), sp, x);
  const b = document.createElement('div'); b.className = 'modal__body';
  typeof body === 'string' ? (b.innerHTML = body) : b.append(body);
  modal.append(head, b);
  if (foot.length) {
    const f = document.createElement('footer'); f.className = 'modal__foot';
    foot.forEach(spec => {
      const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'btn ' + (spec.cls || ''), textContent: spec.label });
      btn.onclick = async () => { const r = await spec.onClick?.(btn, api); if (!spec.keepOpen && r !== false) close(); };
      f.append(btn);
    });
    modal.append(f);
  }
  el.append(modal); document.body.append(el);
  const close = () => { if (el.open) el.close(); };
  const api = { el, body: b, head: h2, close };
  x.onclick = close;
  el.addEventListener('click', e => { if (e.target === el) close(); });
  el.addEventListener('close', () => { onClose?.(); el.remove(); });
  el.showModal();
  return api;
}

export function confirmBox({ title, message, confirmLabel, danger = false }) {
  return new Promise(resolve => {
    let answer = false;
    const d = openDialog({
      title, width: '460px', body: `<p class="muted lh-16"></p>`,
      foot: [{ label: t('common.cancel', 'Cancel'), cls: 'btn--ghost' }, { label: confirmLabel || t('common.confirm', 'Confirm'), cls: danger ? 'btn--solid-danger' : 'btn--primary', onClick: () => { answer = true; } }],
      onClose: () => resolve(answer)
    });
    d.body.querySelector('p').textContent = message;
  });
}
