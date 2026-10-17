// Tiny safe markdown for AI answers: **bold**, `code`, ``` blocks ```, lists, paragraphs. Everything is escaped first.
import { esc, copyText } from '../core/util.js';
import { icon } from './icons.js';
import { t } from '../core/i18n.js';
import { success } from './toast.js';

export function md(text) {
  const src = String(text ?? '').replace(/\r/g, '');
  const parts = src.split(/```([\s\S]*?)```/);      // odd indexes are fenced code
  const out = [];
  parts.forEach((chunk, i) => {
    if (i % 2) { const code = chunk.replace(/^[a-z]*\n/, '').trim(); out.push(block(code)); return; }
    let list = null;
    const flush = () => { if (list) { out.push(`<${list.t}>${list.items.join('')}</${list.t}>`); list = null; } };
    chunk.split('\n').forEach(line => {
      const l = line.trim();
      const ol = l.match(/^(\d+)[.)]\s+(.*)/), ul = l.match(/^[-*•]\s+(.*)/);
      if (ol || ul) { const kind = ol ? 'ol' : 'ul'; if (!list || list.t !== kind) { flush(); list = { t: kind, items: [] }; } list.items.push('<li>' + inline((ol || ul)[ol ? 2 : 1]) + '</li>'); }
      else { flush(); if (l) out.push('<p>' + inline(l) + '</p>'); }
    });
    flush();
  });
  return out.join('');
}
const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, (_, c) => `<code data-copy="${c}" title="${esc(t('common.clickCopy', 'Click to copy'))}">${c}</code>`);
const block = code => `<div class="codeblk"><span>${esc(code)}</span><button type="button" class="btn btn--sm" data-copy="${esc(code)}">${icon('copy', 'icon--sm')} ${esc(t('common.copy', 'Copy'))}</button></div>`;

// one delegated handler per root
export function bindCopy(root) {
  root.addEventListener('click', async e => {
    const el = e.target.closest('[data-copy]'); if (!el) return;
    if (await copyText(el.dataset.copy)) success(t('common.copied', 'Copied'));
  });
}
