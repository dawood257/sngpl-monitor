/* Where the API lives. Empty = same origin as this page.
   When the new UI runs on port 3001 next to the production app on port 3000, it talks to port 3000 automatically.
   Override by editing apiBase (example: 'https://172.21.110.135:3000'). */
window.SNGPL = {
  apiBase: location.port === '3001' ? location.protocol + '//' + location.hostname + ':3000' : ''
};
