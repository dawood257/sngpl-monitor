# Mobile App Readiness

Backend is API-first. Endpoints:

| Method | Path | Purpose |
|---|---|---|
| POST | /api/v1/auth/login | JWT login |
| GET  | /api/v1/auth/me | Current user |
| GET  | /api/v1/servers | All servers |
| GET  | /api/v1/servers/{name} | Detail |
| GET  | /api/v1/servers/{name}/history?minutes=60 | Time series |
| GET  | /api/v1/alerts | Alerts |
| WS   | /api/v1/ws/live?token=JWT | Live stream |

OpenAPI docs: http://<host>:3000/api/v1/docs

Auth: POST /api/v1/auth/login → { access_token }
Header: Authorization: Bearer <token>