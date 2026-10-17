import { frame } from './util.js';

const HIST_LEN = 60;
const subs = new Set();
export const history = new Map();   // server name -> {cpu:[], ram:[]}

export const state = {
  user: null, servers: [], incidents: [], summary: { active: 0, resolved: 0, total: 0 },
  filter: 'all', view: localStorage.getItem('sngpl_view') || 'grid', query: '',
  ws: 'connecting', lastUpdate: 0, error: false, loaded: false
};
// Do not redraw while a mouse/touch press is in progress, so a click is never lost to a live update.
let hold = false, pending = false;
const flush = () => { hold = false; if (pending) { pending = false; notify(); } };
addEventListener('pointerdown', () => { hold = true; }, true);
addEventListener('pointerup', () => setTimeout(flush, 0), true);
addEventListener('pointercancel', flush, true);
addEventListener('blur', flush);
const notify = frame(() => { if (hold) { pending = true; return; } subs.forEach(fn => fn(state)); });
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn); };
export function patch(p) { Object.assign(state, p); if ('view' in p) localStorage.setItem('sngpl_view', p.view); notify(); }

function record(s) {
  const h = history.get(s.name) ?? { cpu: [], ram: [] };
  const cpu = s.cpu?.usage_pct ?? 0, ram = s.ram?.total_mb ? (100 * s.ram.used_mb) / s.ram.total_mb : 0;
  h.cpu.push(cpu); h.ram.push(ram);
  if (h.cpu.length > HIST_LEN) { h.cpu.shift(); h.ram.shift(); }
  history.set(s.name, h);
}
export function seedHistory(name, points) {   // from /history_agg: [{ts,cpu,ram,...}]
  const pts = (points || []).slice(-HIST_LEN);
  if (pts.length < 2) return;
  history.set(name, { cpu: pts.map(p => Number(p.cpu) || 0), ram: pts.map(p => Number(p.ram) || 0) });
  notify();
}
export function setServers(list) { list.forEach(record); patch({ servers: list, lastUpdate: Date.now(), error: false, loaded: true }); }
export function upsertServer(s) {
  record(s);
  const list = state.servers.slice(), i = list.findIndex(x => x.name === s.name);
  if (i >= 0) list[i] = s; else list.push(s);
  patch({ servers: list, lastUpdate: Date.now() });
}
export const getServer = name => state.servers.find(s => s.name === name);
export const role = () => state.user?.role || 'viewer';
export const can = {
  get operator() { return ['operator', 'admin'].includes(role()); },
  get admin() { return role() === 'admin'; }
};
