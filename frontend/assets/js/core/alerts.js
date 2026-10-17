// Sound + toast + change detection. Behaviour matches the production UI: beeps by severity, 5-minute cooldown per incident.
import { toast } from '../ui/toast.js';
import { t } from './i18n.js';
import { nowSec } from './util.js';

export let soundOn = localStorage.getItem('sngpl_sound') !== 'off';
export function setSound(on) { soundOn = on; localStorage.setItem('sngpl_sound', on ? 'on' : 'off'); }

const COOLDOWN = 300, last = {};
const canAlert = id => { const n = nowSec(); if (n - (last[id] || 0) < COOLDOWN) return false; last[id] = n; return true; };

export function playBeep(type) {
  if (!soundOn) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), now = ctx.currentTime;
    const tone = (freq, at, dur, wave, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = wave; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, now + at); g.gain.exponentialRampToValueAtTime(0.001, now + at + dur);
      o.connect(g); g.connect(ctx.destination); o.start(now + at); o.stop(now + at + dur);
    };
    if (type === 'critical') [0, 0.18].forEach(o => tone(880, o, 0.15, 'square', 0.15));
    else if (type === 'warning') tone(600, 0, 0.25, 'sine', 0.12);
    else if (type === 'recovery') [523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.2, 'sine', 0.12));
  } catch { /* audio blocked until the user interacts with the page */ }
}

export function detectIncidentChanges(oldList, newList, open) {
  const prev = new Map((oldList || []).map(i => [i.id, i]));
  newList.forEach(inc => {
    const p = prev.get(inc.id);
    if (inc.status === 'ACTIVE' && !p && canAlert(inc.id)) {
      const kind = inc.severity === 'WARNING' ? 'warn' : inc.severity === 'INFO' ? 'info' : 'crit';
      playBeep(kind === 'warn' ? 'warning' : 'critical');
      toast(kind, inc.message || inc.service || inc.category, inc.server + (inc.service ? ' · ' + inc.service : ''), () => open(inc.id));
    }
    if (inc.status === 'RESOLVED' && p && p.status === 'ACTIVE' && canAlert('resolved-' + inc.id)) {
      playBeep('recovery');
      toast('ok', (inc.service || inc.category || t('inc.incident', 'Incident')) + ' ' + t('inc.recovered', 'recovered'), inc.server + ' · ' + t('inc.resolved', 'resolved'), () => open(inc.id));
    }
  });
}
