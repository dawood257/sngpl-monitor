// Live updates. Protocol (unchanged): connect, send {type:"auth",token} first, then receive auth_ok / metric / preferences.updated.
import { getToken, wsUrl } from './api.js';

let sock = null, timer = null, stopped = true;
const handlers = { metric: () => {}, prefs: () => {}, state: () => {}, expired: () => {} };

export function startWS(h) {
  Object.assign(handlers, h); stopped = false; connect();
}
export function stopWS() { stopped = true; clearTimeout(timer); try { sock?.close(); } catch { /* ignore */ } sock = null; }

function connect() {
  if (stopped || !getToken()) return;
  handlers.state('connecting');
  try { sock = new WebSocket(wsUrl()); } catch { retry(3000); return; }
  sock.onopen = () => { try { sock.send(JSON.stringify({ type: 'auth', token: getToken() })); } catch { /* ignore */ } };
  sock.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'auth_ok') handlers.state('live');
    else if (m.type === 'metric') handlers.metric(m.server, m.data);
    else if (m.type === 'preferences.updated') handlers.prefs(m.data);
    else if (m.type === 'error') console.warn('ws error:', m.message);
  };
  sock.onclose = ev => {
    if (stopped) return;
    if (ev.code === 4401) { handlers.expired(); return; }          // auth failed: sign out
    handlers.state('reconnecting');
    retry(ev.code === 4429 ? 15000 : 3000);                         // rate limited: wait longer
  };
  sock.onerror = () => { try { sock.close(); } catch { /* ignore */ } };
}
function retry(ms) { clearTimeout(timer); timer = setTimeout(connect, ms); }
