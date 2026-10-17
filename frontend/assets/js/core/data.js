// Data layer: polling, incident detection, acknowledge and AI calls against the existing endpoints.
import { get, api } from './api.js';
import { state, patch, setServers, seedHistory } from './store.js';
import { detectIncidentChanges } from './alerts.js';
import { go } from './router.js';

let timers = [];
export const openIncident = id => go('incidents', id);

export async function refreshServers() {
  try { setServers((await get('/api/v1/servers')) || []); } catch { patch({ error: true }); }
}
export async function refreshIncidents() {
  try {
    const [list, summary] = await Promise.all([get('/api/v1/incidents?limit=100'), get('/api/v1/incidents/summary')]);
    const old = state.incidents.slice(), next = list || [];
    patch({ incidents: next, summary: summary || { active: 0, resolved: 0, total: 0 } });
    if (old.length) { try { detectIncidentChanges(old, next, openIncident); } catch (e) { console.error('detect', e); } }
  } catch (e) { console.error('incidents', e); }
}
// Seed the sparklines from the last hour so cards are not empty after a page load.
export async function seedHistories(names) {
  const queue = names.slice();
  const worker = async () => {
    while (queue.length) {
      const n = queue.shift();
      try { const d = await get('/api/v1/servers/' + encodeURIComponent(n) + '/history_agg?range=1h'); seedHistory(n, d?.points); } catch { /* optional */ }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}
export function startPolling() {
  stopPolling();
  timers = [setInterval(refreshServers, 5000), setInterval(refreshIncidents, 30000)];
}
export function stopPolling() { timers.forEach(clearInterval); timers = []; }

export const incidentDetail = id => get('/api/v1/incidents/' + id);
export async function ackIncident(id) {
  await api('/api/v1/incidents/' + id + '/acknowledge', { method: 'POST' });
  await refreshIncidents();
}
export const aiServer = name => get('/api/v1/ai/analyze_server/' + encodeURIComponent(name), { method: 'POST' });
export const aiIncident = id => get('/api/v1/ai/analyze_incident/' + id, { method: 'POST' });
export const aiTrend = (name, range = '24h') => get('/api/v1/ai/analyze_trend/' + encodeURIComponent(name) + '?range=' + encodeURIComponent(range), { method: 'POST' });
export const history = (name, range = '1h') => get('/api/v1/servers/' + encodeURIComponent(name) + '/history_agg?range=' + encodeURIComponent(range));
