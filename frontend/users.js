/* ══════════════════════════════════════════════════════
   User Management UI — Phase 5 RBAC
   ══════════════════════════════════════════════════════ */

window.CURRENT_USER = null;

function showSettingsMenu() {
  const menu = document.getElementById("settingsMenu");
  if (!menu) return;
  const visible = menu.style.display === "block";
  menu.style.display = visible ? "none" : "block";

  // Role-based menu visibility
  const role = (window.CURRENT_USER && window.CURRENT_USER.role) || "viewer";
  const usersBtn = document.getElementById("menuUsersBtn");
  const auditBtn = document.getElementById("menuAuditBtn");
  if (usersBtn) usersBtn.style.display = (role === "admin") ? "" : "none";
  if (auditBtn) auditBtn.style.display = (role === "admin") ? "" : "none";
}

document.addEventListener("click", function (e) {
  const menu = document.getElementById("settingsMenu");
  const btn = document.getElementById("settingsBtn");
  if (!menu || !btn) return;
  if (!menu.contains(e.target) && !btn.contains(e.target)) {
    menu.style.display = "none";
  }
});


/* ───── User Management Modal ───── */
async function openUserManagement() {
  document.getElementById("settingsMenu").style.display = "none";
  const modal = document.getElementById("usersModal");
  modal.classList.add("open");
  await loadUsers();
}

function closeUsersModal() {
  document.getElementById("usersModal").classList.remove("open");
  document.getElementById("userFormContainer").style.display = "none";
}

async function loadUsers() {
  const el = document.getElementById("usersListContainer");
  el.innerHTML = '<div style="color:#a78bfa;padding:20px;text-align:center">Loading users...</div>';
  try {
    const r = await api("/api/v1/users");
    const users = r.data || [];
    if (!users.length) {
      el.innerHTML = '<div style="color:#64748b;padding:20px;text-align:center">No users found</div>';
      return;
    }
    el.innerHTML = users.map(u => {
      const roleClass = "role-" + u.role;
      const created = new Date(u.created_at * 1000).toLocaleDateString();
      const lastLogin = u.last_login ? new Date(u.last_login * 1000).toLocaleString() : "Never";
      const isMe = window.CURRENT_USER && window.CURRENT_USER.username === u.username;
      return '<div class="user-row' + (u.enabled ? '' : ' disabled') + '">' +
        '<div class="user-info">' +
          '<div class="user-name">' + u.username + (isMe ? ' <span style="color:#60a5fa;font-size:10px">(you)</span>' : '') + '</div>' +
          '<div class="user-meta">' + (u.display_name || '-') + ' · Created ' + created + ' · Last login: ' + lastLogin + '</div>' +
        '</div>' +
        '<span class="role-badge ' + roleClass + '">' + u.role + '</span>' +
        '<button class="user-btn" onclick="showEditUserForm(' + u.id + ')">Edit</button>' +
        '<button class="user-btn" onclick="showResetPasswordForm(' + u.id + ',\'' + u.username + '\')">Reset Pwd</button>' +
        (isMe ? '' : '<button class="user-btn danger" onclick="deleteUser(' + u.id + ',\'' + u.username + '\')">Delete</button>') +
      '</div>';
    }).join("");
  } catch (e) {
    el.innerHTML = '<div style="color:#fca5a5;padding:20px">Error: ' + (e.detail || e.message || 'Failed to load') + '</div>';
  }
}

function showAddUserForm() {
  const c = document.getElementById("userFormContainer");
  c.style.display = "block";
  c.innerHTML =
    '<h3 style="margin:0 0 16px;color:#fff;font-size:15px">+ Add New User</h3>' +
    '<div class="form-row"><label>Username</label><input id="newUserUsername" placeholder="e.g. ahmed.khan" autocomplete="off"/></div>' +
    '<div class="form-row"><label>Display Name</label><input id="newUserDisplay" placeholder="e.g. Ahmed Khan"/></div>' +
    '<div class="form-row"><label>Email (optional)</label><input id="newUserEmail" placeholder="user@sngpl.com.pk" type="email"/></div>' +
    '<div class="form-row"><label>Password (min 8 chars)</label><input id="newUserPassword" type="password" placeholder="Strong password"/></div>' +
    '<div class="form-row"><label>Role</label>' +
      '<select id="newUserRole">' +
        '<option value="viewer">Viewer — read-only access</option>' +
        '<option value="operator">Operator — view + AI + acknowledge</option>' +
        '<option value="admin">Admin — full access</option>' +
      '</select>' +
      '<div class="role-info">Viewer: only view | Operator: + AI + ack incidents | Admin: full + user management</div>' +
    '</div>' +
    '<div style="display:flex;gap:10px;margin-top:16px">' +
      '<button class="ai-btn" onclick="submitNewUser()">Create User</button>' +
      '<button class="user-btn" onclick="document.getElementById(\'userFormContainer\').style.display=\'none\'">Cancel</button>' +
    '</div>' +
    '<div id="newUserErr" style="color:#fca5a5;margin-top:10px;font-size:12px"></div>';
  document.getElementById("newUserUsername").focus();
}

async function submitNewUser() {
  const username = document.getElementById("newUserUsername").value.trim();
  const password = document.getElementById("newUserPassword").value;
  const role = document.getElementById("newUserRole").value;
  const display_name = document.getElementById("newUserDisplay").value.trim() || null;
  const email = document.getElementById("newUserEmail").value.trim() || null;
  const err = document.getElementById("newUserErr");
  err.textContent = "";

  if (!username) { err.textContent = "Username required"; return; }
  if (password.length < 8) { err.textContent = "Password must be 8+ characters"; return; }

  try {
    await api("/api/v1/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role, display_name, email })
    });
    document.getElementById("userFormContainer").style.display = "none";
    await loadUsers();
  } catch (e) {
    err.textContent = e.detail || e.message || "Failed to create user";
  }
}

async function deleteUser(id, username) {
  if (!confirm("Delete user '" + username + "'?\n\nThis cannot be undone.")) return;
  try {
    await api("/api/v1/users/" + id, { method: "DELETE" });
    await loadUsers();
  } catch (e) {
    alert("Delete failed: " + (e.detail || e.message));
  }
}

async function showEditUserForm(id) {
  try {
    const r = await api("/api/v1/users/" + id);
    const u = r.data;
    const c = document.getElementById("userFormContainer");
    c.style.display = "block";
    c.innerHTML =
      '<h3 style="margin:0 0 16px;color:#fff;font-size:15px">Edit User: ' + u.username + '</h3>' +
      '<div class="form-row"><label>Display Name</label><input id="editDisplay" value="' + (u.display_name || '') + '"/></div>' +
      '<div class="form-row"><label>Email</label><input id="editEmail" value="' + (u.email || '') + '"/></div>' +
      '<div class="form-row"><label>Role</label>' +
        '<select id="editRole">' +
          '<option value="viewer"' + (u.role === 'viewer' ? ' selected' : '') + '>Viewer</option>' +
          '<option value="operator"' + (u.role === 'operator' ? ' selected' : '') + '>Operator</option>' +
          '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
        '</select></div>' +
      '<div class="form-row"><label>Status</label>' +
        '<select id="editEnabled">' +
          '<option value="1"' + (u.enabled ? ' selected' : '') + '>Enabled</option>' +
          '<option value="0"' + (!u.enabled ? ' selected' : '') + '>Disabled</option>' +
        '</select></div>' +
      '<div style="display:flex;gap:10px;margin-top:16px">' +
        '<button class="ai-btn" onclick="submitEditUser(' + id + ')">Save Changes</button>' +
        '<button class="user-btn" onclick="document.getElementById(\'userFormContainer\').style.display=\'none\'">Cancel</button>' +
      '</div>' +
      '<div id="editUserErr" style="color:#fca5a5;margin-top:10px;font-size:12px"></div>';
  } catch (e) {
    alert("Failed to load user");
  }
}

async function submitEditUser(id) {
  const display_name = document.getElementById("editDisplay").value.trim() || null;
  const email = document.getElementById("editEmail").value.trim() || null;
  const role = document.getElementById("editRole").value;
  const enabled = document.getElementById("editEnabled").value === "1";
  try {
    await api("/api/v1/users/" + id, {
      method: "PUT",
      body: JSON.stringify({ display_name, email, role, enabled })
    });
    document.getElementById("userFormContainer").style.display = "none";
    await loadUsers();
  } catch (e) {
    document.getElementById("editUserErr").textContent = e.detail || e.message;
  }
}

function showResetPasswordForm(id, username) {
  const newPwd = prompt("Enter new password for '" + username + "' (min 8 chars):");
  if (!newPwd) return;
  if (newPwd.length < 8) { alert("Password must be 8+ chars"); return; }
  api("/api/v1/users/" + id + "/reset-password", {
    method: "POST",
    body: JSON.stringify({ new_password: newPwd })
  }).then(() => {
    alert("Password updated for " + username);
  }).catch(e => {
    alert("Failed: " + (e.detail || e.message));
  });
}


/* ───── Change Password (own) ───── */
function openChangePassword() {
  document.getElementById("settingsMenu").style.display = "none";
  document.getElementById("changePwdModal").classList.add("open");
  document.getElementById("pwdOld").value = "";
  document.getElementById("pwdNew").value = "";
  document.getElementById("pwdConfirm").value = "";
  document.getElementById("pwdErr").textContent = "";
}

function closeChangePwd() {
  document.getElementById("changePwdModal").classList.remove("open");
}

async function submitChangePassword() {
  const oldP = document.getElementById("pwdOld").value;
  const newP = document.getElementById("pwdNew").value;
  const conf = document.getElementById("pwdConfirm").value;
  const err = document.getElementById("pwdErr");
  err.textContent = "";

  if (!oldP) { err.textContent = "Current password required"; return; }
  if (newP.length < 8) { err.textContent = "New password must be 8+ chars"; return; }
  if (newP !== conf) { err.textContent = "Passwords do not match"; return; }

  try {
    await api("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password: oldP, new_password: newP })
    });
    alert("✅ Password updated successfully!");
    closeChangePwd();
  } catch (e) {
    err.textContent = e.detail || e.message || "Failed";
  }
}


/* ───── Audit Log Viewer ───── */
async function openAuditLog() {
  document.getElementById("settingsMenu").style.display = "none";
  document.getElementById("auditModal").classList.add("open");
  const c = document.getElementById("auditLogContainer");
  c.innerHTML = '<div style="color:#a78bfa;text-align:center;padding:20px">Loading...</div>';
  try {
    const r = await api("/api/v1/audit?limit=200");
    const logs = r.data || [];
    if (!logs.length) {
      c.innerHTML = '<div style="color:#64748b;text-align:center;padding:20px">No audit entries</div>';
      return;
    }
    c.innerHTML =
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
      '<thead><tr style="border-bottom:1px solid #334155"><th style="text-align:left;padding:8px;color:#94a3b8">Time</th>' +
      '<th style="text-align:left;padding:8px;color:#94a3b8">User</th>' +
      '<th style="text-align:left;padding:8px;color:#94a3b8">Action</th>' +
      '<th style="text-align:left;padding:8px;color:#94a3b8">Target</th>' +
      '<th style="text-align:left;padding:8px;color:#94a3b8">IP</th></tr></thead><tbody>' +
      logs.map(l => {
        const ts = new Date(l.ts * 1000).toLocaleString();
        const status = l.success ? '🟢' : '🔴';
        const actionColor = l.action.includes('fail') ? '#fca5a5' : (l.action.includes('delete') ? '#fcd34d' : '#e2e8f0');
        return '<tr style="border-bottom:1px solid #1e293b">' +
          '<td style="padding:8px;color:#64748b">' + ts + '</td>' +
          '<td style="padding:8px;color:#e2e8f0">' + (l.user || '-') + '</td>' +
          '<td style="padding:8px;color:' + actionColor + '">' + status + ' ' + l.action + '</td>' +
          '<td style="padding:8px;color:#94a3b8">' + (l.target || '-') + '</td>' +
          '<td style="padding:8px;color:#64748b">' + (l.ip || '-') + '</td>' +
        '</tr>';
      }).join("") +
      '</tbody></table>';
  } catch (e) {
    c.innerHTML = '<div style="color:#fca5a5;text-align:center;padding:20px">Error: ' + (e.detail || e.message) + '</div>';
  }
}

function closeAuditModal() {
  document.getElementById("auditModal").classList.remove("open");
}


/* ───── Role-based UI restrictions ───── */
function applyRoleRestrictions(role) {
  const isAdmin = role === "admin";
  const isOperator = role === "operator" || isAdmin;
  // AI buttons hidden for viewers
  document.querySelectorAll(".ai-btn").forEach(b => {
    if (b.id === "aiAskTrendBtn" || b.id === "aiAskServerBtn") {
      b.style.display = isOperator ? "" : "none";
    }
  });
  // Disable Acknowledge for viewers
  window.__CAN_ACK = isOperator;
  window.__CAN_AI = isOperator;
  window.__IS_ADMIN = isAdmin;
}

console.log("[users.js] loaded");
