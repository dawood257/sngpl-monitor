/* ═══════════════════════════════════════════════════════════════
   SNGLP Monitor — User Preferences Module
   STEP 4 — Theme + Language + Layout client
   
   Responsibilities:
   - Cache-first apply (anti-flash)
   - Server fetch (authoritative)
   - WS updates (cross-tab instant)
   - Public API: window.__prefs.{get,set,refresh,applyFromServer}
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ════════ Config ════════
  const API_BASE      = '/api/v1/preferences';
  const CACHE_KEY     = 'sngpl_prefs_cache';
  const TOKEN_KEY     = 'sngpl_token';
  const DEFAULTS      = { language: 'en-US', theme: 'default', layout: 'comfortable' };
  const VALID_LANGS   = ['en-US', 'ur-PK', 'es-ES'];
  const VALID_THEMES  = ['default', 'clean', 'compact', 'dark', 'high-contrast'];
  const VALID_LAYOUTS = ['comfortable', 'compact', 'wide'];

  // ════════ State ════════
  let current = { ...DEFAULTS };
  let listeners = [];
  let initDone = false;

  // ════════ Helpers ════════
  function log(...args) {
    console.log('[prefs]', ...args);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY)
        || sessionStorage.getItem(TOKEN_KEY)
        || '';
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      // Sanity check
      if (!p || typeof p !== 'object') return null;
      return p;
    } catch (e) {
      return null;
    }
  }

  function writeCache(p) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(p));
    } catch (e) {}
  }

  function sanitize(p) {
    const out = {};
    if (p.language && VALID_LANGS.includes(p.language))   out.language = p.language;
    if (p.theme    && VALID_THEMES.includes(p.theme))     out.theme = p.theme;
    if (p.layout   && VALID_LAYOUTS.includes(p.layout))   out.layout = p.layout;
    return out;
  }

  // ════════ DOM Apply ════════
  function applyToDOM(p) {
    const html = document.documentElement;

    // Theme class
    if (p.theme) {
      VALID_THEMES.forEach(t => html.classList.remove('theme-' + t));
      html.classList.add('theme-' + p.theme);
    }

    // Layout density
    if (p.layout) {
      html.setAttribute('data-layout', p.layout);
    }

    // Language + direction
    if (p.language) {
      html.setAttribute('lang', p.language);
      html.setAttribute('dir', p.language === 'ur-PK' ? 'rtl' : 'ltr');
    }

    log('applied to DOM:', p);
  }

  // ════════ Event Dispatch ════════
  function notify(p) {
    listeners.forEach(fn => {
      try { fn(p); } catch (e) { console.error('[prefs] listener error:', e); }
    });
    // Global event for other modules
    try {
      window.dispatchEvent(new CustomEvent('prefs:applied', { detail: p }));
    } catch (e) {}
  }

  // ════════ Server Ops ════════
  async function fetchRemote() {
    const token = getToken();
    if (!token) return null;
    try {
      const r = await fetch(API_BASE + '/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!r.ok) {
        log('fetch failed:', r.status);
        return null;
      }
      const j = await r.json();
      return j && j.data ? j.data : null;
    } catch (e) {
      log('fetch error:', e.message);
      return null;
    }
  }

  async function pushRemote(patch) {
    const token = getToken();
    if (!token) throw new Error('Not logged in');
    const r = await fetch(API_BASE + '/me', {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(patch)
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || ('HTTP ' + r.status));
    }
    const j = await r.json();
    return j && j.data ? j.data : null;
  }

  // ════════ Public API ════════
  function get() {
    return { ...current };
  }

  async function set(patch) {
    const clean = sanitize(patch);
    if (Object.keys(clean).length === 0) {
      throw new Error('No valid fields');
    }

    // Optimistic: apply immediately
    const next = { ...current, ...clean };
    current = next;
    writeCache(next);
    applyToDOM(next);
    notify(next);

    // Sync to server
    try {
      const server = await pushRemote(clean);
      if (server) {
        // Server may normalize — accept server truth
        current = { ...current, ...server };
        writeCache(current);
        applyToDOM(current);
        notify(current);
      }
      log('set OK:', clean);
    } catch (e) {
      log('set FAILED:', e.message);
      // Rollback on failure
      const fresh = await fetchRemote();
      if (fresh) {
        current = { ...fresh };
        writeCache(current);
        applyToDOM(current);
        notify(current);
      }
      throw e;
    }

    return current;
  }

  async function refresh() {
    const remote = await fetchRemote();
    if (remote) {
      const clean = sanitize(remote);
      const merged = { ...current, ...clean, updated_at: remote.updated_at };
      current = merged;
      writeCache(merged);
      applyToDOM(merged);
      notify(merged);
      log('refresh OK:', merged);
    }
    return current;
  }

  // Called from index.html's WS handler (or direct)
  function applyFromServer(p) {
    if (!p) return;
    const clean = sanitize(p);
    current = { ...current, ...clean };
    writeCache(current);
    applyToDOM(current);
    notify(current);
    log('applyFromServer:', clean);
  }

  // ════════ Init ════════
  async function init() {
    if (initDone) return;
    initDone = true;

    // 1. Cache (already applied by inline boot script — just sync state)
    const cached = readCache();
    if (cached) {
      current = { ...current, ...sanitize(cached) };
      log('cache loaded:', current);
    }

    // 2. Server (if logged in)
    if (getToken()) {
      await refresh();
    }

    // 3. Listen for login → fetch remote
    window.addEventListener('login:success', async () => {
      log('login detected, fetching remote prefs...');
      await refresh();
    });

    // 4. Listen for logout → reset to defaults
    window.addEventListener('logout', () => {
      log('logout detected');
      current = { ...DEFAULTS };
      writeCache(current);
      applyToDOM(current);
      notify(current);
    });

    log('initialized');
  }

  // ════════ Public Surface ════════
  window.__prefs = {
    get,
    set,
    refresh,
    applyFromServer,
    onChange(fn) {
      if (typeof fn === 'function') {
        listeners.push(fn);
        // Immediately call with current state
        try { fn({ ...current }); } catch (e) {}
        return () => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        };
      }
    },
    VALID_THEMES: [...VALID_THEMES],
    VALID_LANGS: [...VALID_LANGS],
    VALID_LAYOUTS: [...VALID_LAYOUTS]
  };

  // ════════ Boot ════════
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
