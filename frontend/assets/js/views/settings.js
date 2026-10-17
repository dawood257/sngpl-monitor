import { state } from '../core/store.js';
import { esc, $ } from '../core/util.js';
import { t, tx } from '../core/i18n.js';
import { icon } from '../ui/icons.js';
import { api } from '../core/api.js';
import { getPrefs, savePrefs, loadOptions, onPrefs } from '../core/prefs.js';
import { soundOn, setSound, playBeep } from '../core/alerts.js';
import { success, failure } from '../ui/toast.js';

const SWATCH = { default: ['#05070a', '#0d111a', '#10b981'], dark: ['#000000', '#0a0b0e', '#10b981'], clean: ['#f2f4f8', '#ffffff', '#0f9d6a'], compact: ['#05070a', '#0d111a', '#38bdf8'], 'high-contrast': ['#000000', '#ffffff', '#facc15'] };
const DESC = { default: 'Obsidian, dark with glass cards', dark: 'Pure black for dark rooms', clean: 'Light and airy for daytime', compact: 'Obsidian with tighter spacing', 'high-contrast': 'Maximum readability' };

export function mount(root) {
  let opts = null;
  root.innerHTML = `<div class="page-head"><div><h1>${tx('nav.settings', 'Settings')}</h1><p class="muted">${tx('set.sub', 'Preferences are saved to your account and follow you to any browser.')}</p></div></div><div class="settings" id="set"></div>`;
  const box = $('#set', root);

  function render() {
    const p = getPrefs(), u = state.user || {};
    box.innerHTML = `<section class="card card--pad"><span class="card-t">${tx('set.appearance', 'Appearance')}</span>
        <div class="set-row"><div><b>${tx('set.theme', 'Theme')}</b><small>${tx('set.themeHint', 'Changes colours across the whole app.')}</small></div></div>
        <div class="themes">${(opts.themes || []).map(th => { const sw = SWATCH[th.id] || SWATCH.default; return `<button type="button" class="theme-opt" data-theme="${esc(th.id)}" aria-pressed="${p.theme === th.id}"><span class="sw">${sw.map(c => `<i data-c="${c}"></i>`).join('')}</span><b>${esc(th.label)}</b><small>${esc(th.desc || DESC[th.id] || '')}</small></button>`; }).join('')}</div>
        <div class="set-row"><div><b>${tx('set.layout', 'Layout density')}</b><small>${tx('set.layoutHint', 'Comfortable, compact or wide for large NOC displays.')}</small></div><div class="seg" role="group">${(opts.layouts || []).map(l => `<button type="button" data-layout="${esc(l.id)}" class="${p.layout === l.id ? 'is-active' : ''}" aria-pressed="${p.layout === l.id}">${esc(l.label)}</button>`).join('')}</div></div>
        <div class="set-row"><div><b>${tx('set.language', 'Language')}</b><small>${tx('set.languageHint', 'Urdu switches the layout to right-to-left.')}</small></div><select class="select select--auto select--min" id="lang" aria-label="${esc(t('set.language', 'Language'))}">${(opts.languages || []).map(l => `<option value="${esc(l.code)}"${p.language === l.code ? ' selected' : ''}>${esc(l.label)}</option>`).join('')}</select></div></section>
      <section class="card card--pad"><span class="card-t">${tx('set.notify', 'Notifications')}</span>
        <div class="set-row"><div><b>${tx('set.sound', 'Alert sounds')}</b><small>${tx('set.soundHint', 'Beeps for new critical or warning incidents and a chime on recovery.')}</small></div><label class="switch"><input type="checkbox" id="snd" ${soundOn ? 'checked' : ''} aria-label="${esc(t('set.sound', 'Alert sounds'))}"><i></i></label></div>
        <div class="set-row"><div><b>${tx('set.test', 'Test sounds')}</b></div><div class="row row--wrap"><button class="btn btn--sm" data-beep="critical" type="button">${tx('toast.critical', 'Critical')}</button><button class="btn btn--sm" data-beep="warning" type="button">${tx('toast.warning', 'Warning')}</button><button class="btn btn--sm" data-beep="recovery" type="button">${tx('toast.recovered', 'Recovered')}</button></div></div></section>
      <section class="card card--pad"><span class="card-t">${tx('set.account', 'Account')}</span>
        <div class="set-row"><div><b>${esc(u.display_name || u.username || '')}</b><small class="mono">${esc(u.username || '')}</small></div><span class="badge badge--${u.role === 'admin' ? 'crit' : u.role === 'operator' ? 'warn' : 'info'} badge--lg">${esc(u.role || '')}</span></div>
        <form class="stack form-narrow" id="pwform" autocomplete="off"><div class="field"><label for="po">${tx('set.pwOld', 'Current password')}</label><input class="input" id="po" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="pn">${tx('set.pwNew', 'New password (8+ characters)')}</label><input class="input" id="pn" type="password" autocomplete="new-password" minlength="8" required></div>
          <div class="field"><label for="pc">${tx('set.pwConfirm', 'Confirm new password')}</label><input class="input" id="pc" type="password" autocomplete="new-password" required></div>
          <p class="form-error" id="pwerr" role="alert"></p><div><button class="btn btn--primary" type="submit">${icon('key', 'icon--sm')} ${tx('set.pwChange', 'Change password')}</button></div></form></section>`;
  }
  async function save(patch, prev) {
    try { await savePrefs(patch); success(t('set.saved', 'Preferences saved')); }
    catch (e) { failure(t('set.saveFail', 'Could not save preferences'), e.detail || e.message); try { await savePrefs(prev); } catch { /* keep local */ } }
    render(); paint();
  }
  root.addEventListener('click', e => {
    const th = e.target.closest('[data-theme]'), ly = e.target.closest('[data-layout]'), bp = e.target.closest('[data-beep]');
    if (th) save({ theme: th.dataset.theme }, { theme: getPrefs().theme });
    else if (ly) save({ layout: ly.dataset.layout }, { layout: getPrefs().layout });
    else if (bp) playBeep(bp.dataset.beep);
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'lang') save({ language: e.target.value }, { language: getPrefs().language });
    if (e.target.id === 'snd') { setSound(e.target.checked); success(e.target.checked ? t('set.soundOn', 'Alert sounds on') : t('set.soundOff', 'Alert sounds muted')); }
  });
  root.addEventListener('submit', async e => {
    if (e.target.id !== 'pwform') return; e.preventDefault();
    const o = $('#po', root).value, n = $('#pn', root).value, c = $('#pc', root).value, err = $('#pwerr', root); err.textContent = '';
    if (!o) return void (err.textContent = t('set.pwNeedOld', 'Current password required'));
    if (n.length < 8) return void (err.textContent = t('users.pwShort', 'Password must be 8+ characters'));
    if (n !== c) return void (err.textContent = t('set.pwMismatch', 'Passwords do not match'));
    try { await api('/api/v1/auth/change-password', { method: 'POST', body: { old_password: o, new_password: n } }); e.target.reset(); success(t('set.pwDone', 'Password updated')); }
    catch (x) { err.textContent = x.detail || x.message; }
  });
  const paint = () => box.querySelectorAll('[data-c]').forEach(i => { i.style.background = i.dataset.c; });
  loadOptions().then(o => { opts = o; render(); paint(); });
  const off = onPrefs(() => { if (opts) { render(); paint(); } });
  return () => off();
}
