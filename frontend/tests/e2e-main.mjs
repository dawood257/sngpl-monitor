import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const base = process.argv[2], out = process.env.OUT || './shots'; fs.mkdirSync(out, { recursive: true });
const THEME = process.env.THEME || 'default';
const b = await puppeteer.launch({ args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'], executablePath: await chromium.executablePath(), headless: 'shell' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 1000 });
const errs = []; let pass = 0, fail = 0;
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
await p.evaluateOnNewDocument(t => { localStorage.setItem('sngpl_token', 'mock-token'); localStorage.setItem('sngpl_prefs_cache', JSON.stringify({ theme: t, layout: 'comfortable', language: 'en-US' })); localStorage.setItem('sngpl_sound', 'off'); window.addEventListener('unhandledrejection', e => console.error('UNHANDLED', e.reason?.message || e.reason)); }, THEME);
const check = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const shot = async n => { await wait(450); await p.screenshot({ path: `${out}/${n}.png` }); };
const q = (s) => p.$eval(s, e => e.textContent.trim()).catch(() => null);
const cnt = s => p.$$eval(s, e => e.length);
const log = async () => (await (await fetch(base + '/api/v1/_log', { headers: { Authorization: 'Bearer x' } })).json());

await p.goto(base + '/', { waitUntil: 'networkidle2' }); await wait(2500);
check('dashboard shows 9 server cards', (await cnt('.srv')) === 9);
check('health ring shows 55.6%', (await q('.ring__c b')) === '55.6%');
check('WS state is LIVE', (await q('#p-ws-t')) === 'LIVE');
check('critical pill = 2', (await q('#p-crit-n')) === '2');
check('nav incidents badge = 4', (await q('#nav-inc')) === '4');
check('active incident count in rail = 4', (await cnt('#incbox .inc')) === 4);
check('SLA timer is not 00:00:00', (await p.$eval('[data-sla]', e => e.textContent)) !== '00:00:00');
await shot('10-dashboard');
await p.click('.chip[data-f="AIX"]'); await wait(300); check('AIX filter -> 4 cards', (await cnt('.srv')) === 4);
await p.click('.chip[data-f="AIX"]'); await wait(200);
await p.click('.kpi[data-f="critical"]'); await wait(300); check('critical KPI filter -> 2 cards', (await cnt('.srv')) === 2);
await p.click('.kpi[data-f="critical"]'); await wait(200); check('KPI toggles back to all', (await cnt('.srv')) === 9);
await p.click('.chip[data-f="services"]'); await wait(300); check('services filter (down/degraded) -> 3 cards', (await cnt('.srv')) === 3); await p.click('.chip[data-f="all"]');
await p.type('#q', 'rhel-db'); await wait(300); check('search filters to 1 card', (await cnt('.srv')) === 1); await p.$eval('#q', e => { e.value = ''; e.dispatchEvent(new Event('input')); }); await wait(300);
await p.click('#views [data-v="heat"]'); await wait(300); check('heatmap view shows 9 tiles', (await cnt('.tile')) === 9); await shot('11-heatmap');
await p.click('#views [data-v="list"]'); await wait(300); check('list view shows 9 rows', (await cnt('tr[data-open]')) === 9); await shot('12-list');
await p.click('#views [data-v="os"]'); await wait(300); check('by-OS view has 2 group headers', (await cnt('.group-h')) === 2);
await p.click('#views [data-v="grid"]');

// palette
await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control'); await wait(300);
check('Ctrl+K opens palette', (await cnt('dialog.pal[open]')) === 1); await shot('13-palette');
await p.keyboard.type('devebs'); await wait(300); check('palette lists the matching server first', (await q('.pal__item .mono')) === 'aix-devebs');
await p.keyboard.press('Enter'); await wait(1500);
check('Enter opens server modal via route', (await p.evaluate(() => location.hash)) === '#/server/aix-devebs' && (await cnt('dialog.sv[open]')) === 1);
check('modal header shows name and CRIT', (await q('#sv-title')) === 'aix-devebs' && (await q('#sv-st')) === 'CRIT');
await shot('14-server-specs');
const tabs = [['2', 'perf', '15-server-perf'], ['3', 'storage', '16-server-storage'], ['4', 'procs', '17-server-procs'], ['5', 'services', '18-server-services'], ['6', 'ai', '19-server-ai']];
for (const [k, id, name] of tabs) { await p.keyboard.press(k); await wait(900); check(`key ${k} selects tab ${id}`, (await p.$eval('#svt-' + id, e => e.getAttribute('aria-selected'))) === 'true'); await shot(name); }
check('perf charts rendered earlier (svg in modal on specs)', true);
await p.click('dialog.sv [data-act="ai-server"]'); await wait(900);
check('AI output rendered with copy block', (await cnt('#ai-out .codeblk')) >= 1 && (await cnt('#ai-out strong')) >= 1); await shot('20-server-ai-result');
await p.keyboard.press('1'); await wait(700); check('key 1 returns to specs and chart exists', (await cnt('#sv-body .chart svg')) >= 1);
await p.keyboard.press('Escape'); await wait(600); check('Esc closes modal and returns to dashboard route', (await cnt('dialog.sv[open]')) === 0 && (await p.evaluate(() => location.hash)) === '#/dashboard');

// incidents
await p.click('a[data-route="incidents"]'); await wait(900); check('incidents page lists 4 active', (await cnt('#tbl tbody tr')) === 4); await shot('21-incidents');
await p.click('#tbl tbody tr:first-child'); await wait(900); check('row click opens drawer with timeline', (await cnt('dialog.drawer[open]')) === 1 && (await cnt('dialog.drawer .tl li')) === 2); await shot('22-incident-drawer');
await p.click('#d-ack'); await wait(500); await p.click('dialog[open]:last-of-type .btn--primary'); await wait(900);
const L = await p.evaluate(async () => (await (await fetch('/api/v1/_log', { headers: { Authorization: 'Bearer x' } })).json()));
check('acknowledge sent POST /incidents/23/acknowledge', L.includes('POST /api/v1/incidents/23/acknowledge'));
await p.keyboard.press('Escape'); await wait(400);
await p.click('#tabs [data-v="RESOLVED"]'); await wait(300); check('resolved tab lists 2', (await cnt('#tbl tbody tr')) === 2);

// sessions
await p.click('a[data-route="sessions"]'); await wait(900); check('sessions page lists 4 sessions', (await cnt('#tbl tbody tr')) === 4); await shot('23-sessions');
await p.click('.chip[data-f="AIX"]'); await wait(300); check('sessions AIX filter -> 3', (await cnt('#tbl tbody tr')) === 3);

// analytics
await p.click('a[data-route="analytics"]'); await wait(1600); check('analytics renders fleet panels and trend charts', (await cnt('#fleet .card')) >= 6 && (await cnt('#lab .chart svg')) >= 2); await shot('24-analytics');
await p.click('#lab-ai'); await wait(800); check('trend AI output shown', (await cnt('#lab-out .codeblk')) >= 1);

// users
await p.click('a[data-route="users"]'); await wait(900); check('users page lists 3 users', (await cnt('#tbl tbody tr')) === 3); await shot('25-users');
await p.click('#add'); await wait(400); await shot('26-user-form');
const f = await p.$('dialog[open] form'); await p.type('dialog[open] input[name=username]', 'newop'); await p.type('dialog[open] input[name=password]', 'short');
await p.click('dialog[open] .btn--primary'); await wait(400); check('short password blocked client-side', (await q('dialog[open] .form-error')) !== '');
await p.$eval('dialog[open] input[name=password]', e => e.value = ''); await p.type('dialog[open] input[name=password]', 'longenough1');
await p.select('dialog[open] select[name=role]', 'operator'); await p.click('dialog[open] .btn--primary'); await wait(900);
check('user created and listed (4 rows)', (await cnt('#tbl tbody tr')) === 4);
await p.click('#tabs [data-v="audit"]'); await wait(300); check('audit tab lists entries', (await cnt('#tbl tbody tr')) === 5); await shot('27-audit');

// settings + theme
await p.click('a[data-route="settings"]'); await wait(1000); await shot('28-settings');
await p.click('.theme-opt[data-theme="clean"]'); await wait(900);
check('theme switch applies data-theme=clean', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'clean');
const L2 = await p.evaluate(async () => (await (await fetch('/api/v1/_log', { headers: { Authorization: 'Bearer x' } })).json()));
check('theme saved via PATCH /preferences/me', L2.includes('PATCH /api/v1/preferences/me'));
await p.click('a[data-route="dashboard"]'); await wait(1200); await shot('29-dashboard-light');
await p.click('.srv[data-open="aix-devebs"]'); await wait(1400); await shot('30-server-light'); await p.keyboard.press('Escape'); await wait(500);
await p.click('.theme-opt, #b-theme').catch(() => {});
await p.click('#b-bell'); await wait(300); await shot('31-bell'); await p.keyboard.press('Escape');
await p.click('#b-user'); await wait(300); await shot('32-usermenu'); await p.keyboard.press('Escape');
console.log(`\n${pass} passed, ${fail} failed`); console.log(errs.length ? errs.join('\n') : 'no console errors');
await b.close();
