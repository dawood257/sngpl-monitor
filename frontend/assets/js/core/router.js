// Hash router: #/dashboard  #/incidents  #/incidents/12  #/sessions  #/analytics  #/users  #/settings  #/server/<name>
export function parse() {
  const [page = 'dashboard', arg = ''] = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/').map(decodeURIComponent);
  return { page, arg };
}
export const go = (page, arg) => { location.hash = '#/' + page + (arg ? '/' + encodeURIComponent(arg) : ''); };
export const onRoute = fn => { addEventListener('hashchange', fn); return () => removeEventListener('hashchange', fn); };
