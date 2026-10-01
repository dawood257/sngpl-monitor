/* ═══════════════════════════════════════════════════════════════
   SNGLP Monitor — Preferences UI (STEP 7)
   Self-contained: injects header button + modal.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var _open = false;
  var _strings = {};

  // ═══ CSS ═══
  function injectCSS(){
    if (document.getElementById('sngplSettingsCSS')) return;
    var st = document.createElement('style');
    st.id = 'sngplSettingsCSS';
    st.textContent = `
      #sngplPrefsBtn{background:#1e293b;color:#e2e8f0;border:1px solid #334155;
        padding:7px 12px;border-radius:6px;cursor:pointer;font-size:13px;
        font-weight:600;transition:.15s;display:inline-flex;align-items:center;
        gap:6px;margin-right:4px}
      #sngplPrefsBtn:hover{background:#334155;border-color:#475569}
      .sngpl-set-overlay{position:fixed;inset:0;background:rgba(2,6,23,.75);
        backdrop-filter:blur(3px);z-index:9500;display:none;
        align-items:flex-start;justify-content:center;padding:80px 20px 20px}
      .sngpl-set-overlay.open{display:flex}
      .sngpl-set-modal{background:#0f172a;border:1px solid #334155;border-radius:12px;
        width:min(620px,100%);max-height:calc(100vh - 120px);display:flex;
        flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6);
        animation:sngplFadeIn .18s ease-out}
      @keyframes sngplFadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
      .sngpl-set-head{padding:18px 22px;border-bottom:1px solid #1e293b;
        display:flex;align-items:center;justify-content:space-between}
      .sngpl-set-head h2{margin:0;font-size:16px;font-weight:700;color:#f1f5f9;
        display:flex;align-items:center;gap:10px}
      .sngpl-set-head .sub{font-size:11px;color:#64748b;font-weight:400}
      .sngpl-set-close{background:transparent;border:0;color:#94a3b8;font-size:20px;
        cursor:pointer;padding:4px 10px;border-radius:6px;line-height:1}
      .sngpl-set-close:hover{background:#1e293b;color:#f1f5f9}
      .sngpl-set-body{padding:18px 22px;overflow:auto;flex:1}
      .sngpl-set-section{margin-bottom:22px}
      .sngpl-set-section:last-child{margin-bottom:0}
      .sngpl-set-label{font-size:11px;color:#94a3b8;font-weight:600;
        text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;
        display:flex;align-items:center;gap:6px}
      .sngpl-set-select{width:100%;background:#1e293b;color:#f1f5f9;
        border:1px solid #334155;border-radius:6px;padding:10px 12px;
        font-size:14px;cursor:pointer;transition:.15s}
      .sngpl-set-select:hover{border-color:#475569}
      .sngpl-set-select:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
      .sngpl-theme-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));
        gap:10px}
      .sngpl-theme-option{background:#1e293b;border:2px solid #334155;border-radius:8px;
        padding:12px;cursor:pointer;transition:.15s;text-align:center;position:relative}
      .sngpl-theme-option:hover{border-color:#475569;transform:translateY(-2px)}
      .sngpl-theme-option.active{border-color:#3b82f6;background:#1e3a8a22}
      .sngpl-theme-option.active::after{content:'✓';position:absolute;top:6px;right:10px;
        color:#3b82f6;font-weight:700}
      .sngpl-theme-swatch{width:100%;height:36px;border-radius:4px;margin-bottom:8px;
        display:flex;gap:2px;overflow:hidden}
      .sngpl-theme-swatch span{flex:1}
      .sngpl-theme-name{font-size:12px;font-weight:600;color:#f1f5f9}
      .sngpl-theme-desc{font-size:10px;color:#64748b;margin-top:2px}
      .sngpl-set-foot{padding:14px 22px;border-top:1px solid #1e293b;
        display:flex;justify-content:space-between;align-items:center;font-size:12px}
      .sngpl-set-status{color:#64748b}
      .sngpl-set-status.ok{color:#22c55e}
      .sngpl-set-status.err{color:#ef4444}
      .sngpl-set-save{background:#3b82f6;color:#fff;border:0;padding:8px 18px;
        border-radius:6px;cursor:pointer;font-size:13px;font-weight:600}
      .sngpl-set-save:hover{background:#2563eb}
      .sngpl-set-save:disabled{background:#475569;cursor:not-allowed}
      @media (max-width:600px){
        .sngpl-set-overlay{padding:20px}
        .sngpl-set-modal{max-height:calc(100vh - 40px)}
      }
    `;
    document.head.appendChild(st);
  }

  // ═══ i18n helper (fallback if __i18n not present) ═══
  function t(key, fallback){
    if (_strings[key]) return _strings[key];
    return fallback || key;
  }

  async function loadStrings(lang){
    try {
      var r = await fetch('/locales/' + lang + '.json');
      if (r.ok) _strings = await r.json();
    } catch(e){}
  }

  // ═══ Inject button ═══
  function injectButton(){
    if (document.getElementById('sngplPrefsBtn')) return true;
    var bell = document.getElementById('bellBtn');
    if (!bell || !bell.parentNode) return false;
    var btn = document.createElement('button');
    btn.id = 'sngplPrefsBtn';
    btn.title = 'Preferences — Language & Theme';
    btn.innerHTML = '🎨';
    btn.onclick = open;
    bell.parentNode.insertBefore(btn, bell);
    return true;
  }

  // ═══ Inject modal ═══
  function injectModal(){
    if (document.getElementById('sngplSetOverlay')) return;
    var ov = document.createElement('div');
    ov.className = 'sngpl-set-overlay';
    ov.id = 'sngplSetOverlay';
    ov.innerHTML = `
      <div class="sngpl-set-modal" onclick="event.stopPropagation()">
        <div class="sngpl-set-head">
          <h2>🎨 <span id="sngplSetTitle">Preferences</span>
            <span class="sub" id="sngplSetSub"></span></h2>
          <button class="sngpl-set-close" id="sngplSetClose">✕</button>
        </div>
        <div class="sngpl-set-body">

          <div class="sngpl-set-section">
            <div class="sngpl-set-label">🌐 <span id="lblLang">Language</span></div>
            <select class="sngpl-set-select" id="sngplLangSelect"></select>
          </div>

          <div class="sngpl-set-section">
            <div class="sngpl-set-label">🎨 <span id="lblTheme">Theme</span></div>
            <div class="sngpl-theme-grid" id="sngplThemeGrid"></div>
          </div>

          <div class="sngpl-set-section">
            <div class="sngpl-set-label">📐 <span id="lblLayout">Layout</span></div>
            <select class="sngpl-set-select" id="sngplLayoutSelect"></select>
          </div>

        </div>
        <div class="sngpl-set-foot">
          <span class="sngpl-set-status" id="sngplSetStatus"></span>
          <button class="sngpl-set-save" id="sngplSetSave">Close</button>
        </div>
      </div>
    `;
    ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
    document.body.appendChild(ov);

    document.getElementById('sngplSetClose').onclick = close;
    document.getElementById('sngplSetSave').onclick = close;

    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && _open) close();
    });
  }

  // ═══ Populate options ═══
  async function populate(){
    var opts = null;
    try {
      var r = await fetch('/api/v1/preferences/options');
      if (r.ok) opts = (await r.json()).data;
    } catch(e){}

    if (!opts) {
      opts = {
        languages: [
          {code:'en-US', label:'English', rtl:false},
          {code:'ur-PK', label:'اردو', rtl:true},
          {code:'es-ES', label:'Español', rtl:false}
        ],
        themes: [
          {id:'default', label:'Default', desc:'Dark blue'},
          {id:'clean', label:'Clean', desc:'Light minimal'},
          {id:'compact', label:'Compact', desc:'Denser'},
          {id:'dark', label:'Dark', desc:'Pure dark'},
          {id:'high-contrast', label:'High Contrast', desc:'Max readability'}
        ],
        layouts: [
          {id:'comfortable', label:'Comfortable'},
          {id:'compact', label:'Compact'},
          {id:'wide', label:'Wide'}
        ]
      };
    }

    // Language dropdown
    var langSel = document.getElementById('sngplLangSelect');
    langSel.innerHTML = opts.languages.map(function(l){
      return '<option value="' + l.code + '">' + l.label + '</option>';
    }).join('');

    // Layout dropdown
    var laySel = document.getElementById('sngplLayoutSelect');
    laySel.innerHTML = opts.layouts.map(function(l){
      return '<option value="' + l.id + '">' + l.label + '</option>';
    }).join('');

    // Theme grid
    var grid = document.getElementById('sngplThemeGrid');
    var swatches = {
      'default':       ['#0f172a','#1e293b','#3b82f6'],
      'clean':         ['#f8fafc','#ffffff','#0ea5e9'],
      'compact':       ['#0f172a','#1e293b','#3b82f6'],
      'dark':          ['#000000','#0a0a0a','#60a5fa'],
      'high-contrast': ['#000000','#ffff00','#ffffff']
    };
    grid.innerHTML = opts.themes.map(function(tm){
      var sw = swatches[tm.id] || ['#222','#444','#666'];
      var swHtml = sw.map(function(c){ return '<span style="background:'+c+'"></span>'; }).join('');
      return '<div class="sngpl-theme-option" data-theme="' + tm.id + '">' +
        '<div class="sngpl-theme-swatch">' + swHtml + '</div>' +
        '<div class="sngpl-theme-name">' + tm.label + '</div>' +
        '<div class="sngpl-theme-desc">' + (tm.desc || '') + '</div>' +
        '</div>';
    }).join('');

    grid.querySelectorAll('.sngpl-theme-option').forEach(function(el){
      el.addEventListener('click', function(){
        setPref({ theme: el.dataset.theme });
      });
    });

    langSel.addEventListener('change', function(){
      setPref({ language: langSel.value });
    });

    laySel.addEventListener('change', function(){
      setPref({ layout: laySel.value });
    });
  }

  // ═══ Sync UI to current state ═══
  function syncUI(){
    var p = window.__prefs ? window.__prefs.get() : { language:'en-US', theme:'default', layout:'comfortable' };
    var lang = document.getElementById('sngplLangSelect');
    var lay  = document.getElementById('sngplLayoutSelect');
    if (lang) lang.value = p.language;
    if (lay)  lay.value  = p.layout;
    document.querySelectorAll('.sngpl-theme-option').forEach(function(el){
      el.classList.toggle('active', el.dataset.theme === p.theme);
    });
  }

  // ═══ Set preference ═══
  async function setPref(patch){
    var status = document.getElementById('sngplSetStatus');
    if (!window.__prefs) {
      if (status) { status.textContent = 'Module not ready'; status.className = 'sngpl-set-status err'; }
      return;
    }
    if (status) { status.textContent = t('settings.saving', 'Saving...'); status.className = 'sngpl-set-status'; }
    try {
      await window.__prefs.set(patch);
      if (status) { status.textContent = t('settings.saved', 'Saved'); status.className = 'sngpl-set-status ok'; }
      syncUI();
      setTimeout(function(){
        if (status && status.textContent === t('settings.saved', 'Saved')) status.textContent = '';
      }, 2000);
    } catch(e){
      if (status) { status.textContent = t('settings.error', 'Error'); status.className = 'sngpl-set-status err'; }
    }
  }

  // ═══ Open / Close ═══
  function open(){
    _open = true;
    document.getElementById('sngplSetOverlay').classList.add('open');
    syncUI();
  }
  function close(){
    _open = false;
    document.getElementById('sngplSetOverlay').classList.remove('open');
  }

  // ═══ Boot ═══
  function boot(){
    injectCSS();
    injectModal();
    populate().then(function(){
      // Retry inserting button until header ready
      var tries = 0;
      function tryInsert(){
        tries++;
        if (injectButton()) {
          console.log('[settings-ui] button injected after', tries, 'tries');
        } else if (tries < 60) {
          setTimeout(tryInsert, 500);
        }
      }
      tryInsert();
    });

    // Sync state on prefs change
    if (window.__prefs && window.__prefs.onChange) {
      window.__prefs.onChange(function(){
        if (_open) syncUI();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose for debug
  window.__settingsUI = { open: open, close: close };
})();
