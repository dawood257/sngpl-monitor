# End-to-end tests

`mock_backend.py` imitates your backend (same routes and response shapes, plus the WebSocket) so the UI can be tested without touching production.

```bash
pip install aiohttp
npm i puppeteer-core @sparticuz/chromium        # in any folder, then copy the .mjs files there (or run from here)
python3 tests/mock_backend.py . 8901 &          # serves this folder on :8901 (log in with any user + password "secret123")
node tests/e2e-main.mjs http://127.0.0.1:8901    # 42 checks: dashboard, filters, palette, server modal, incidents, users, settings
MOCK_ROLE=viewer SCENARIO=viewer node tests/e2e-scenarios.mjs http://127.0.0.1:8901   # also: mobile, rtl, hc, compact, expiry, offline
```
Set `OUT=./shots` to choose where screenshots go. Scenario env: `MOCK_ROLE`, `MOCK_LANG`, `MOCK_THEME`, `MOCK_LAYOUT`.
