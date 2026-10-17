# SNGPL Monitor: new frontend ("Command Obsidian")

A ground-up rebuild of the dashboard UI: new layout, design system, components and navigation. It talks to the **existing backend, unchanged**: same endpoints, same login, same WebSocket protocol, same preferences. The current `frontend/` folder is not touched, so production keeps running while you try this one.

Vanilla ES modules, no build step, no framework, no CDN: fonts are self-hosted and the code works under your backend's CSP (`script-src 'self'`, `font-src 'self'`).

## Try it next to production (zero risk)
```bash
cd /ords/sngpl-monitor/frontend-next
python3 serve.py --port 3001 --cert /path/to/fullchain.pem --key /path/to/privkey.pem
# open https://<server>:3001/
```
On port 3001 the UI automatically calls the API on port 3000 of the same host (`config.js`; the backend already allows cross-origin requests). Existing login sessions work too: the token key (`sngpl_token`) is the same.

## Go live, and go back
```bash
cd /ords/sngpl-monitor
mv frontend frontend-classic && mv frontend-next frontend      # new UI live, no config change, no restart
mv frontend frontend-next && mv frontend-classic frontend      # rollback, same two commands reversed
```
(`config.yaml` and nginx point at `/ords/sngpl-monitor/frontend`, so swapping folders is all that is needed.)

## Design
Dark glass "command centre" (Obsidian) with emerald / amber / crimson status colours, violet for AIX, IBM Plex Sans for text and JetBrains Mono for every number, IP and hostname. The existing **Settings -> Theme** picker keeps working:

| Theme id | Look |
|---|---|
| default | Obsidian, dark glass |
| dark | Pure black, for dark rooms |
| clean | Daylight, light theme |
| compact | Obsidian with tighter spacing |
| high-contrast | Black, white borders, yellow accent |

Layout density (comfortable / compact / wide) and language (English, Spanish, Urdu with right-to-left layout) also work and are saved to the user's account, as before.

## What is where (every feature of the old UI is kept)
| Old UI | New UI |
|---|---|
| Login | Split-screen sign-in |
| System health + availability | Hero panel (health ring, auto summary, "Review top risk") + clickable KPI tiles (Servers / Healthy / Warning / Critical / Offline / Services) |
| Filter chips (All, RHEL, AIX, Alerts, Services, Offline) | Same chips with counts, plus a server filter box |
| Server cards | Cards with CPU sparkline, CPU/RAM/Disk bars, service status. Views: Grid, By OS, Heatmap, List |
| Incident center + bell | Incident rail with **live SLA timers**, Explain / Acknowledge, bell dropdown, full Incidents page with search and severity filter |
| Incident detail + timeline + acknowledge | Slide-over drawer with timeline, "Explain this incident" (AI), Acknowledge (with confirmation) |
| Server detail (Overview, Specs, Performance, Storage, Processes, Services) | Server dialog with tabs Specs, Performance (1h/6h/24h/7d, hover charts), Storage, Processes, Services (joined to active incidents), AI diagnostics. Keys 1-6 switch tabs |
| AI: server / incident / trend | Same three endpoints: copilot panel on the dashboard, AI tab, incident drawer, Analytics page. Answers render with copyable commands |
| Sessions modal | Session manager page (filters, search, auto-refresh) |
| User management, audit log, reset/delete | Users & audit page with proper dialogs (no browser prompts) |
| Preferences, change password | Settings page |
| Sound mute + beeps + toasts | Same behaviour: severity beeps, 5-minute per-incident cooldown, recovery chime, toasts |
| Live updates (WebSocket + 5 s polling, incidents every 30 s) | Same: WebSocket (auth message first, close codes 4401 / 4429 handled) with polling fallback and an error banner |
| Role rules (viewer / operator / admin) | Same: viewers cannot acknowledge or use AI; Users page is admin-only. The backend still enforces everything |
| (new) | **Ctrl+K command palette**, Analytics & AI page (fleet ranking, service matrix, hotspots, trend lab), CSV export of servers / incidents / sessions / users / audit / one-server report, deep links such as `#/server/aix-devebs` and `#/incidents/23` |

Status rules are identical to the old UI: a server is *warning* at 90% and *critical* at 95% of its worst metric (CPU, RAM, fullest mount); *offline* when the agent stops reporting.

## Endpoints used (all existing)
`POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`, `GET /servers`, `GET /servers/{name}/history_agg?range=`, `GET /incidents`, `GET /incidents/summary`, `GET /incidents/{id}`, `POST /incidents/{id}/acknowledge`, `POST /ai/analyze_server|incident|trend`, `GET /sessions`, `GET|POST /users`, `GET|PUT|DELETE /users/{id}`, `POST /users/{id}/reset-password`, `GET /audit`, `GET /preferences/options`, `GET|PATCH /preferences/me`, `WS /ws/live`. Request bodies were checked against `backend/main.py`.

## Not included (they need new backend endpoints, which you asked not to add)
Live log tail, terminate session, restart listener, and free-text AI chat. The UI uses only what the backend already offers.

## Code map
`index.html` shell, `config.js` API location, `assets/css/` tokens, base, shell, components, views, `assets/js/core/` api, ws, store, status rules, prefs, i18n, alerts, data, router, `assets/js/ui/` icons, charts, dialogs, toasts, markdown, palette, `assets/js/views/` one file per page plus the server dialog, `locales/` en-US, es-ES, ur-PK.
Security: all server text is escaped before display, AI output is rendered as text with a safe markdown subset, no inline event handlers, CSV export neutralises spreadsheet formulas.

## Tested
`tests/` holds a mock backend and an end-to-end suite (headless Chromium): 42 checks on the main flows plus scenarios for viewer role, phone layout, Urdu right-to-left, high-contrast, compact layout, expired session and server unreachable. All pass. See `tests/README.md`.

**Not tested:** your real backend and data, the real LLM output, Firefox / Safari / Edge (only Chromium), and a real WebSocket server (the mock follows the protocol documented in the old frontend). Minimum browsers: Chrome/Edge 111+, Firefox 113+, Safari 16.2+ (the UI uses `color-mix()` and `<dialog>`).
