import { esc, clamp, fmtTime, nowSec } from '../core/util.js';

export function sparkline(values, tone = 'ok') {
  const v = values || [];
  if (v.length < 2) return `<svg class="spark spark--${tone}" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="18" x2="120" y2="18" stroke="currentColor" stroke-dasharray="3 4" opacity=".4"/></svg>`;
  const st = 120 / (v.length - 1);
  const pts = v.map((x, i) => `${(i * st).toFixed(1)},${(34 - clamp(x, 0, 100) / 100 * 32).toFixed(1)}`).join(' ');
  return `<svg class="spark spark--${tone}" viewBox="0 0 120 36" preserveAspectRatio="none" role="img" aria-label="CPU trend"><polygon points="${pts} 120,36 0,36"/><polyline points="${pts}"/></svg>`;
}

export function ring(pct, color, label = '') {
  const p = clamp(pct, 0, 100);
  return `<div class="ring" role="img" aria-label="${esc(label)} ${p.toFixed(1)}%"><svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15.9"/><circle class="fg" cx="18" cy="18" r="15.9" pathLength="100" stroke="${color}" stroke-dasharray="${p.toFixed(1)} 100"/></svg><div class="ring__c"><b>${p.toFixed(p % 1 ? 1 : 0)}%</b><small>${esc(label)}</small></div></div>`;
}

/** Interactive line chart with hover tooltip. points: [{ts, ...}], series: [{key,label,color}], opts: {yMax|'auto', unit, height, ref, fill} */
export function lineChart(el, points, series, { yMax = 100, unit = '%', height = 190, ref = null, fill = true } = {}) {
  const pts = (points || []).filter(p => p && Number.isFinite(+p.ts));
  if (pts.length < 2) { el.innerHTML = '<div class="empty"><span>Not enough history yet</span></div>'; return; }
  const W = 720, H = height, L = 40, R = 12, T = 10, B = 24, iw = W - L - R, ih = H - T - B;
  const t0 = pts[0].ts, t1 = pts[pts.length - 1].ts, span = Math.max(1, t1 - t0);
  const max = yMax === 'auto' ? niceMax(Math.max(...pts.flatMap(p => series.map(s => +p[s.key] || 0)), 1)) : yMax;
  const X = ts => L + ((ts - t0) / span) * iw, Y = v => T + ih - (clamp(v, 0, max) / max) * ih;
  const ticks = [0, .25, .5, .75, 1].map(f => f * max);
  const grid = ticks.map(v => `<line class="g" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="ax" x="${L - 7}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${fmtTick(v, max)}${unit === '%' ? '' : ''}</text>`).join('');
  const refLine = ref != null ? `<line class="ref" x1="${L}" x2="${W - R}" y1="${Y(ref).toFixed(1)}" y2="${Y(ref).toFixed(1)}"/>` : '';
  const defs = series.map((s, i) => `<linearGradient id="lg${uid}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".28"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`).join('');
  const paths = series.map((s, i) => {
    const line = pts.filter(p => Number.isFinite(+p[s.key])).map(p => `${X(p.ts).toFixed(1)},${Y(+p[s.key]).toFixed(1)}`);
    if (line.length < 2) return '';
    return (fill && i === 0 ? `<polygon points="${line.join(' ')} ${X(t1).toFixed(1)},${T + ih} ${X(t0).toFixed(1)},${T + ih}" fill="url(#lg${uid}${i})"/>` : '') + `<polyline points="${line.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  const xl = [0, .5, 1].map((f, i) => `<text class="ax" x="${(L + f * iw).toFixed(1)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}">${fmtTime(t0 + f * span)}</text>`).join('');
  uid++;
  el.classList.add('chart');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.label).join(', '))}"><defs>${defs}</defs>${grid}${refLine}${paths}<line class="cursor" x1="0" x2="0" y1="${T}" y2="${T + ih}"/>${xl}</svg><div class="tip" hidden></div>`;
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cur = el.querySelector('.cursor');
  svg.addEventListener('mousemove', e => {
    const r = svg.getBoundingClientRect(), fx = clamp((e.clientX - r.left) / r.width * W, L, W - R), ts = t0 + ((fx - L) / iw) * span;
    let best = pts[0]; for (const p of pts) if (Math.abs(p.ts - ts) < Math.abs(best.ts - ts)) best = p;
    const cx = X(best.ts); cur.setAttribute('x1', cx); cur.setAttribute('x2', cx);
    tip.hidden = false; tip.style.left = (cx / W * r.width) + 'px'; tip.style.top = '14%';
    tip.replaceChildren();
    const h = document.createElement('b'); h.textContent = new Date(best.ts * 1000).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }); tip.append(h);
    series.forEach(s => {
      const row = document.createElement('span'), l = document.createElement('em'), dot = document.createElement('i'), v = document.createElement('strong');
      dot.style.background = s.color; l.append(dot, document.createTextNode(s.label));
      v.textContent = Number.isFinite(+best[s.key]) ? (+best[s.key]).toFixed(1) + (unit === '%' ? '%' : '') : '--';
      row.append(l, v); tip.append(row);
    });
  });
  svg.addEventListener('mouseleave', () => { tip.hidden = true; });
}
let uid = 0;
function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
function fmtTick(v, max) { return max <= 10 ? v.toFixed(1) : Math.round(v); }
export const emptyChart = msg => `<div class="empty"><span>${esc(msg)}</span></div>`;
