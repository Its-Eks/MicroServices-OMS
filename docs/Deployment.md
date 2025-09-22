## Deployment & Operations

### Local
- `pnpm install` or `npm install`
- `npm run dev` (ts-node / nodemon) or `npm run build && npm start`

### Docker (example)
- Build an image from the Node base
- Expose `${PORT}`
- Provide env via secrets/config

### Cloud
- Render/Heroku/Fly.io supported; ensure `CORS_ORIGIN` includes your frontend

### Observability
- Add health endpoint `/health`
- Emit transition events for metrics


