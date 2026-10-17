// Runs before first paint: apply the cached theme/layout so there is no flash of the wrong colours.
try {
  var p = JSON.parse(localStorage.getItem('sngpl_prefs_cache') || '{}'), r = document.documentElement;
  r.dataset.theme = p.theme || 'default'; r.dataset.layout = p.layout || 'comfortable';
  if (p.language === 'ur-PK') r.dir = 'rtl';
} catch (e) { /* defaults */ }
