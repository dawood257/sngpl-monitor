// REST client for the existing backend. Same token key as the production UI, so existing sessions keep working.
const BASE = (window.SNGPL && window.SNGPL.apiBase) || '';
export const TOKEN_KEY = 'sngpl_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = t => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, detail) {
    const msg = typeof detail === 'string' && detail ? detail : Array.isArray(detail) ? detail.map(d => d?.msg || String(d)).join('; ') : 'Request failed';
    super(msg); this.status = status; this.detail = msg;   // detail is always a readable string
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = getToken(); if (t) headers.Authorization = 'Bearer ' + t;
  let r;
  try { r = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal }); }
  catch (e) { throw new ApiError(0, 'Cannot reach the server'); }
  let data = null; try { data = await r.json(); } catch { /* empty or non-JSON */ }
  if (!r.ok) {
    if (r.status === 401 && !path.endsWith('/auth/login')) document.dispatchEvent(new CustomEvent('auth:expired'));
    throw new ApiError(r.status, data?.detail ?? data?.message);
  }
  return data;
}
export const get = async (path, opts) => (await api(path, opts))?.data;

export async function login(username, password) {
  const r = await api('/api/v1/auth/login', { method: 'POST', body: { username, password } });
  setToken(r.access_token);
  return r;
}
export const me = () => get('/api/v1/auth/me');
export const wsUrl = () => {
  const u = BASE ? new URL(BASE) : location;
  return (u.protocol === 'https:' ? 'wss://' : 'ws://') + u.host + '/api/v1/ws/live';
};
