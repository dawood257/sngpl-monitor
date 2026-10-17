import { state, can } from '../core/store.js';
import { esc, fmtDate, initials, $, toCsv, download } from '../core/util.js';
import { t, tx } from '../core/i18n.js';
import { icon } from '../ui/icons.js';
import { api, get } from '../core/api.js';
import { emptyState } from '../ui/parts.js';
import { openDialog, confirmBox } from '../ui/dialog.js';
import { success, failure } from '../ui/toast.js';

const ROLES = ['viewer', 'operator', 'admin'];
const roleBadge = r => `<span class="badge badge--${r === 'admin' ? 'crit' : r === 'operator' ? 'warn' : 'info'}">${esc(r)}</span>`;

export function mount(root) {
  let users = [], audit = [], tab = 'users', q = '', loading = true;
  root.innerHTML = `<div class="page-head"><div><h1>${tx('nav.users', 'Users & audit')}</h1><p class="muted">${tx('users.sub', 'Manage who can sign in and review everything that was done.')}</p></div><span class="spacer"></span><button class="btn btn--primary" id="add" type="button">${icon('plus', 'icon--sm')} ${tx('users.add', 'Add user')}</button></div>
    <div class="toolbar mb-g"><div class="seg" id="tabs" role="group"><button type="button" data-v="users" aria-pressed="true">${tx('users.tab', 'Users')}</button><button type="button" data-v="audit" aria-pressed="false">${tx('audit.tab', 'Audit log')}</button></div>
      <div class="search-wrap search-wrap--md">${icon('search', 'icon--sm')}<input class="input input--search" id="q" type="search" placeholder="${esc(t('common.search', 'Search'))}" maxlength="64" aria-label="${esc(t('common.search', 'Search'))}"></div><span class="spacer"></span><button class="btn" id="csv" type="button">${icon('download', 'icon--sm')} CSV</button></div>
    <div class="card tbl-wrap" id="tbl"></div>`;

  function render() {
    root.querySelectorAll('#tabs [data-v]').forEach(b => { const on = b.dataset.v === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
    $('#add', root).hidden = tab !== 'users';
    const box = $('#tbl', root); if (loading) { box.innerHTML = '<div class="skeleton"></div>'; return; }
    const needle = q.toLowerCase();
    if (tab === 'users') {
      const rows = users.filter(u => !needle || [u.username, u.display_name, u.email, u.role].some(v => String(v || '').toLowerCase().includes(needle)));
      box.innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>${tx('col.user', 'User')}</th><th>${tx('users.email', 'Email')}</th><th>${tx('users.role', 'Role')}</th><th>${tx('col.status', 'Status')}</th><th>${tx('users.last', 'Last login')}</th><th></th></tr></thead><tbody>${rows.map(u => `<tr><td><div class="uname"><span class="av">${esc(initials(u.display_name || u.username))}</span><div><b>${esc(u.username)}</b>${u.username === state.user?.username ? ` <span class="badge badge--info">${tx('users.you', 'you')}</span>` : ''}<div class="muted fs-12">${esc(u.display_name || '')}</div></div></div></td><td class="muted">${esc(u.email || '--')}</td><td>${roleBadge(u.role)}</td><td><span class="badge badge--${u.enabled ? 'ok' : 'off'}">${u.enabled ? tx('users.enabled', 'enabled') : tx('users.disabled', 'disabled')}</span></td><td class="muted">${u.last_login ? esc(fmtDate(u.last_login)) : '--'}</td>
        <td><div class="tbl-actions"><button class="btn btn--sm" data-act="edit" data-id="${u.id}">${icon('edit', 'icon--sm')} ${tx('common.edit', 'Edit')}</button><button class="btn btn--sm" data-act="pwd" data-id="${u.id}">${icon('key', 'icon--sm')} ${tx('users.reset', 'Reset password')}</button><button class="btn btn--sm btn--danger" data-act="del" data-id="${u.id}">${icon('trash', 'icon--sm')}<span class="sr-only">${tx('common.delete', 'Delete')}</span></button></div></td></tr>`).join('')}</tbody></table>` : emptyState(icon('users'), t('users.none', 'No users found'));
    } else {
      const rows = audit.filter(l => !needle || [l.user, l.action, l.target, l.ip].some(v => String(v || '').toLowerCase().includes(needle)));
      box.innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>${tx('audit.time', 'Time')}</th><th>${tx('col.user', 'User')}</th><th>${tx('audit.action', 'Action')}</th><th>${tx('audit.target', 'Target')}</th><th>IP</th><th>${tx('audit.result', 'Result')}</th></tr></thead><tbody>${rows.map(l => {
        const bad = !l.success || /fail/.test(l.action), warn = /delete|reset/.test(l.action);
        return `<tr><td class="mono muted">${esc(fmtDate(l.ts))}</td><td class="mono">${esc(l.user || '-')}</td><td><span class="badge badge--${bad ? 'crit' : warn ? 'warn' : 'off'}">${esc(l.action)}</span></td><td class="mono muted">${esc(l.target || '-')}</td><td class="mono muted">${esc(l.ip || '-')}</td><td>${l.success ? icon('check', 'icon--sm') : icon('x', 'icon--sm')}</td></tr>`; }).join('')}</tbody></table>` : emptyState(icon('shield'), t('audit.none', 'No audit entries'));
    }
  }
  async function load() {
    loading = true; render();
    try { [users, audit] = await Promise.all([get('/api/v1/users'), get('/api/v1/audit?limit=200')]); users = users || []; audit = audit || []; }
    catch (e) { failure(t('common.loadFail', 'Could not load data'), e.detail || e.message); }
    loading = false; render();
  }

  function userDialog(u) {
    const edit = !!u, id = 'u' + Math.random().toString(36).slice(2, 7);
    const body = `<form class="stack" id="${id}" autocomplete="off"><div class="form-grid">
      ${edit ? '' : `<div class="field"><label for="${id}n">${tx('users.username', 'Username')}</label><input class="input" id="${id}n" name="username" required maxlength="40" autocomplete="off"></div><div class="field"><label for="${id}p">${tx('users.password', 'Password (8+ characters)')}</label><input class="input" id="${id}p" name="password" type="password" required minlength="8" autocomplete="new-password"></div>`}
      <div class="field"><label for="${id}d">${tx('users.display', 'Display name')}</label><input class="input" id="${id}d" name="display_name" maxlength="80" value="${esc(u?.display_name || '')}"></div>
      <div class="field"><label for="${id}e">${tx('users.email', 'Email')}</label><input class="input" id="${id}e" name="email" type="email" maxlength="120" value="${esc(u?.email || '')}"></div>
      <div class="field"><label for="${id}r">${tx('users.role', 'Role')}</label><select class="select" id="${id}r" name="role">${ROLES.map(r => `<option${(u?.role || 'viewer') === r ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
      ${edit ? `<div class="field"><label for="${id}s">${tx('col.status', 'Status')}</label><select class="select" id="${id}s" name="enabled"><option value="1"${u.enabled ? ' selected' : ''}>${tx('users.enabled', 'enabled')}</option><option value="0"${!u.enabled ? ' selected' : ''}>${tx('users.disabled', 'disabled')}</option></select></div>` : ''}</div>
      <div class="callout">${icon('info')}<span><b>viewer</b>: ${tx('role.viewer', 'read only')} · <b>operator</b>: ${tx('role.operator', 'acknowledge incidents and use AI')} · <b>admin</b>: ${tx('role.admin', 'everything, including users')}</span></div><p class="form-error" role="alert"></p></form>`;
    const d = openDialog({ title: edit ? t('users.edit', 'Edit user') + ': ' + u.username : t('users.add', 'Add user'), body, width: '640px', foot: [
      { label: t('common.cancel', 'Cancel'), cls: 'btn--ghost' },
      { label: edit ? t('common.save', 'Save changes') : t('users.create', 'Create user'), cls: 'btn--primary', keepOpen: true, onClick: async () => {
        const f = d.body.querySelector('form'), err = f.querySelector('.form-error'); err.textContent = '';
        const v = Object.fromEntries(new FormData(f)); const text = k => (v[k] || '').trim() || null;
        try {
          if (edit) await api('/api/v1/users/' + u.id, { method: 'PUT', body: { display_name: text('display_name'), email: text('email'), role: v.role, enabled: v.enabled === '1' } });
          else { if (!v.username?.trim()) return void (err.textContent = t('users.needName', 'Username required')); if ((v.password || '').length < 8) return void (err.textContent = t('users.pwShort', 'Password must be 8+ characters'));
            await api('/api/v1/users', { method: 'POST', body: { username: v.username.trim(), password: v.password, role: v.role, display_name: text('display_name'), email: text('email') } }); }
          d.close(); success(edit ? t('users.saved', 'User saved') : t('users.created', 'User created')); load();
        } catch (e) { err.textContent = e.detail || e.message; }
      } }] });
  }
  function pwdDialog(u) {
    const d = openDialog({ title: t('users.reset', 'Reset password') + ': ' + u.username, width: '460px',
      body: `<form class="stack" autocomplete="off"><div class="field"><label for="np">${tx('users.newPw', 'New password (8+ characters)')}</label><input class="input" id="np" name="pw" type="password" minlength="8" required autocomplete="new-password"></div><p class="form-error" role="alert"></p></form>`,
      foot: [{ label: t('common.cancel', 'Cancel'), cls: 'btn--ghost' }, { label: t('users.reset', 'Reset password'), cls: 'btn--primary', keepOpen: true, onClick: async () => {
        const pw = d.body.querySelector('#np').value, err = d.body.querySelector('.form-error');
        if (pw.length < 8) { err.textContent = t('users.pwShort', 'Password must be 8+ characters'); return; }
        try { await api('/api/v1/users/' + u.id + '/reset-password', { method: 'POST', body: { new_password: pw } }); d.close(); success(t('users.pwDone', 'Password updated for') + ' ' + u.username); } catch (e) { err.textContent = e.detail || e.message; }
      } }] });
  }
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-act],[data-v]'); if (!b) return;
    if (b.dataset.v) { tab = b.dataset.v; return render(); }
    const u = users.find(x => x.id === +b.dataset.id);
    if (b.dataset.act === 'edit' && u) { try { userDialog((await get('/api/v1/users/' + u.id)) || u); } catch { userDialog(u); } }
    else if (b.dataset.act === 'pwd' && u) pwdDialog(u);
    else if (b.dataset.act === 'del' && u) {
      if (!(await confirmBox({ title: t('users.delTitle', 'Delete user'), message: t('users.delMsg', "Delete '{u}'? This cannot be undone.", { u: u.username }), confirmLabel: t('common.delete', 'Delete'), danger: true }))) return;
      try { await api('/api/v1/users/' + u.id, { method: 'DELETE' }); success(t('users.deleted', 'User deleted')); load(); } catch (err) { failure(t('common.failed', 'Action failed'), err.detail || err.message); }
    }
  });
  $('#add', root).addEventListener('click', () => userDialog(null));
  $('#q', root).addEventListener('input', e => { q = e.target.value.trim(); render(); });
  $('#csv', root).addEventListener('click', () => download(tab + '-' + new Date().toISOString().slice(0, 10) + '.csv', tab === 'users'
    ? toCsv([['username', 'display_name', 'email', 'role', 'enabled', 'last_login'], ...users.map(u => [u.username, u.display_name, u.email, u.role, u.enabled, u.last_login ? fmtDate(u.last_login) : ''])])
    : toCsv([['time', 'user', 'action', 'target', 'ip', 'success'], ...audit.map(l => [fmtDate(l.ts), l.user, l.action, l.target, l.ip, l.success])])));
  load();
  return () => {};
}
