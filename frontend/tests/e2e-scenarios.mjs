import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const base = process.argv[2], S = process.env.SCENARIO, out = process.env.OUT || './shots'; fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], executablePath: await chromium.executablePath(), headless: 'shell' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const mobile = S === 'mobile';
const p = await b.newPage(); await p.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 1000 });
const errs = []; let pass = 0, fail = 0;
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET|net::/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
await p.evaluateOnNewDocument((lang, theme) => { if (!sessionStorage.getItem('seen')) { localStorage.setItem('sngpl_token', 'mock-token'); sessionStorage.setItem('seen', '1'); } localStorage.setItem('sngpl_sound', 'off'); localStorage.setItem('sngpl_prefs_cache', JSON.stringify({ theme, layout: 'comfortable', language: lang })); }, process.env.MOCK_LANG || 'en-US', process.env.MOCK_THEME || 'default');
const check = (n, c) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const cnt = s => p.$$eval(s, e => e.length), vis = s => p.$eval(s, e => !!(e.offsetParent || e.getClientRects().length)).catch(() => false);
await p.goto(base + '/', { waitUntil: 'networkidle2' }); await wait(2500);
const shot = async n => { await wait(400); await p.screenshot({ path: `${out}/${n}.png` }); };

if (S === 'viewer') {
  check('viewer: dashboard loads', (await cnt('.srv')) === 9);
  check('viewer: Users nav hidden', !(await vis('#nav-users')));
  check('viewer: no Acknowledge/Explain buttons in rail', (await cnt('#incbox [data-act="ack"], #incbox [data-act="explain"]')) === 0);
  check('viewer: copilot shows read-only note', (await cnt('#copilot .callout')) === 1 && (await cnt('#copilot [data-act="ai-server"]')) === 0);
  await p.evaluate(() => { location.hash = '#/users'; }); await wait(800);
  check('viewer: #/users redirects to dashboard', (await p.evaluate(() => location.hash)) === '#/dashboard');
  await p.click('.srv[data-open="aix-devebs"]'); await wait(1200);
  check('viewer: modal has no AI health check button', !(await vis('dialog.sv [data-act="ai-open"]')));
  await p.click('#svt-ai'); await wait(400); check('viewer: AI tab shows note only', (await cnt('dialog.sv #sv-body .callout')) === 1);
  await shot('40-viewer');
}
if (S === 'mobile') {
  check('mobile: cards render', (await cnt('.srv')) === 9);
  check('mobile: sidebar hidden by default', !(await vis('#sidebar')) || (await p.$eval('#sidebar', e => e.getBoundingClientRect().right <= 0)));
  await shot('41-mobile-dash');
  await p.click('#nav-toggle'); await wait(500); check('mobile: menu opens', await p.$eval('#sidebar', e => e.getBoundingClientRect().left >= 0)); await shot('42-mobile-menu');
  await p.click('#sidebar a[data-route="incidents"]'); await wait(900); check('mobile: navigation closes menu and loads page', (await cnt('#tbl')) === 1);
  await p.evaluate(() => { location.hash = '#/server/aix-devebs'; }); await wait(1500); await shot('43-mobile-modal');
  check('mobile: modal covers the viewport width', await p.$eval('dialog.sv .modal', e => e.getBoundingClientRect().width >= 385));
}
if (S === 'rtl') {
  check('rtl: html dir is rtl and lang ur', (await p.evaluate(() => [document.documentElement.dir, document.documentElement.lang])).join() === 'rtl,ur');
  check('rtl: nav is translated', (await p.$eval('a[data-route="dashboard"] span:last-child', e => e.textContent)) === 'ڈیش بورڈ');
  await shot('44-rtl-dash'); await p.click('.srv[data-open="aix-devebs"]'); await wait(1300); await shot('45-rtl-modal');
}
if (S === 'hc') { await shot('46-hc-dash'); await p.click('.srv[data-open="aix-devebs"]'); await wait(1300); await shot('47-hc-modal'); check('hc: theme applied', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'high-contrast'); }
if (S === 'compact') { check('compact layout attr', (await p.evaluate(() => document.documentElement.dataset.layout)) === 'compact'); await shot('48-compact'); }
if (S === 'expiry') {
  await p.evaluate(() => document.dispatchEvent(new CustomEvent('auth:expired'))); await wait(1500);
  check('expiry: back at login with token cleared', (await vis('#login-form')) && (await p.evaluate(() => !localStorage.getItem('sngpl_token'))));
}
if (S === 'offline') {
  await p.setOfflineMode(true); await wait(6500);
  check('offline: error banner appears', !(await p.$eval('#banner', e => e.hidden)));
  await shot('49-banner'); await p.setOfflineMode(false); await wait(6500);
  check('offline: banner clears after recovery', await p.$eval('#banner', e => e.hidden));
}
console.log(`${pass} passed, ${fail} failed`); console.log(errs.length ? errs.join('\n') : 'no console errors'); await b.close();
