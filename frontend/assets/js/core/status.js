// Same rules as the production UI: a server is "warning" at 90% and "critical" at 95% of its worst metric.
import { num } from './util.js';

export const WARN_AT = 90, CRIT_AT = 95;

export function metricsOf(s) {
  const cpu = num(s?.cpu?.usage_pct);
  const ram = s?.ram?.total_mb ? (100 * num(s.ram.used_mb)) / s.ram.total_mb : 0;
  const mounts = s?.mounts || [];
  const worst = mounts.reduce((a, m) => (num(m.use_pct) > num(a?.use_pct) ? m : a), null);
  const disk = worst ? num(worst.use_pct) : 0;
  const swapT = num(s?.ram?.swap_total_mb), swapU = num(s?.ram?.swap_used_mb);
  return { cpu, ram, disk, diskMount: worst?.mount || '', load: [num(s?.cpu?.load_1), num(s?.cpu?.load_5), num(s?.cpu?.load_15)],
    swap: swapT ? (100 * swapU) / swapT : 0, swapT, swapU };
}
export function serverStatus(s) {
  if (!s || s.status !== 'online') return 'offline';
  const m = metricsOf(s), worst = Math.max(m.cpu, m.ram, m.disk);
  return worst >= CRIT_AT ? 'critical' : worst >= WARN_AT ? 'warning' : 'healthy';
}
// UI class names used by CSS: ok | warn | crit | off
export const tone = st => ({ healthy: 'ok', warning: 'warn', critical: 'crit', offline: 'off' }[st] || 'off');
export const toneLabel = st => ({ healthy: 'OK', warning: 'WARN', critical: 'CRIT', offline: 'OFF' }[st] || '--');
export const levelOf = p => (p >= CRIT_AT ? 'crit' : p >= WARN_AT ? 'warn' : 'ok');
export function groupOf(s) {
  if (s?.group) return s.group;
  if (!s?.os_type) return 'UNKNOWN';
  if (s.os_type === 'AIX') return 'AIX';
  if (s.os_type === 'Linux' || s.os_type === 'SunOS') return 'RHEL';
  return 'UNKNOWN';
}
export const osLabel = s => (s?.os_type === 'AIX' ? 'AIX' : s?.os_type === 'SunOS' ? 'Solaris' : 'RHEL');
export const svcTone = x => { const st = String(x?.status || '').toLowerCase(); return st === 'running' ? 'ok' : st === 'degraded' ? 'warn' : st === 'down' ? 'crit' : 'off'; };
export const svcDown = s => (s?.services || []).filter(x => ['down', 'degraded'].includes(String(x.status || '').toLowerCase()));
export const sevTone = i => (i?.status === 'RESOLVED' ? 'ok' : i?.severity === 'CRITICAL' ? 'crit' : i?.severity === 'WARNING' ? 'warn' : 'info');

export function kpis(servers, incidents) {
  const k = { total: servers.length, healthy: 0, warning: 0, critical: 0, offline: 0, online: 0, rhel: 0, aix: 0, services: 0, running: 0, down: 0, degraded: 0 };
  servers.forEach(s => {
    const st = serverStatus(s);
    if (st === 'offline') k.offline++; else { k.online++; k[st]++; }
    const g = groupOf(s); if (g === 'RHEL') k.rhel++; if (g === 'AIX') k.aix++;
    (s.services || []).forEach(x => { k.services++; const v = String(x.status || '').toLowerCase(); if (v === 'running') k.running++; else if (v === 'down') k.down++; else if (v === 'degraded') k.degraded++; });
  });
  k.alerts = (incidents || []).filter(i => i.status === 'ACTIVE').length;
  k.availability = k.total ? Math.round((k.online / k.total) * 1000) / 10 : 0;
  k.health = k.total ? Math.round((k.healthy / k.total) * 1000) / 10 : 0;
  return k;
}
const ORDER = { critical: 0, warning: 1, healthy: 2, offline: 3 };
export const bySeverity = (a, b) => ORDER[serverStatus(a)] - ORDER[serverStatus(b)] || String(a.name).localeCompare(String(b.name));
export function topRisk(servers) {
  return servers.slice().filter(s => serverStatus(s) !== 'healthy').sort((a, b) => {
    const A = serverStatus(a), B = serverStatus(b), ma = metricsOf(a), mb = metricsOf(b);
    return ORDER[A] - ORDER[B] || Math.max(mb.cpu, mb.ram, mb.disk) - Math.max(ma.cpu, ma.ram, ma.disk);
  })[0] || null;
}
