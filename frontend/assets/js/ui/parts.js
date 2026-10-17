import { esc, num } from '../core/util.js';
import { groupOf, osLabel, tone, toneLabel, levelOf, sevTone } from '../core/status.js';
import { t } from '../core/i18n.js';

export const osBadge = s => `<span class="badge badge--${groupOf(s) === 'AIX' ? 'aix' : 'rhel'}">${esc(osLabel(s))}</span>`;
export const stBadge = (st, lg = false) => `<span class="badge badge--${tone(st)}${lg ? ' badge--lg' : ''}">${toneLabel(st)}</span>`;
export const meter = (label, pct, off = false) => `<div class="meter"><span>${esc(label)}</span><div class="meter__track">${off ? '' : `<i class="meter__fill is-${levelOf(pct)}" data-w="${num(pct).toFixed(1)}"></i>`}</div><b>${off ? '--' : Math.round(pct) + '%'}</b></div>`;
export const sevBadge = i => i.status === 'RESOLVED' ? `<span class="badge badge--ok">${esc(t('inc.resolvedTag', 'RESOLVED'))}</span>` : `<span class="badge badge--${sevTone(i)}">${esc(i.severity || '-')}</span>`;
export const emptyState = (iconHtml, title, text = '') => `<div class="empty">${iconHtml}<b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
export const loadingBlock = (n = 3) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');
export const incTitle = i => i.message || (i.service || i.category || '') + ' issue';
