# NotifyX — Production Deployment & Operations Guide

NotifyX is a high-throughput, multi-channel developer notification infrastructure platform designed to run reliably on modern Node.js environments and cloud platforms with free or low-cost infrastructure.

---

## 1. Production Architecture Overview

```
                          Users / External Applications
                                       │
                                       ▼
                   ┌──────────────────────────────────────┐
                   │        Frontend Web Console          │
                   │            (React + Vite)            │
                   └──────────────────┬───────────────────┘
                                      │ HTTPS / WSS
                                      ▼
                   ┌──────────────────────────────────────┐
                   │             NotifyX API              │
                   │        (Node.js + Express + WS)      │
                   └───────┬──────────────────────┬───────┘
                           │                      │
                           ▼                      ▼
            ┌────────────────────────┐  ┌─────────────────────────┐
            │   PostgreSQL + Prisma  │  │     Redis + BullMQ      │
            │     (Persistent DB)    │  │  (Queues & Rate Limit)  │
            └────────────────────────┘  └────────────┬────────────┘
                                                     │
                                                     ▼
                                        ┌─────────────────────────┐
                                        │    Background Worker    │
                                        │   (BullMQ Job Engine)   │
                                        └────────────┬────────────┘
                                                     │
                                                     ▼
                                        ┌─────────────────────────┐
                                        │   Multi-Channel Delivery│
                                        │  ├── In-App (WebSocket) │
                                        │  ├── Email (Adapters)   │
                                        │  └── Push (Adapters)    │
                                        └─────────────────────────┘
```

---

## 2. Component Deployment Details

### A. Frontend (React + Vite)
- **Build Command**: `npm run build`
- **Output Directory**: `dist/`
- **Recommended Free Hosting**: Vercel, Netlify, Cloudflare Pages, or served statically from Express in single-container mode.
- **Environment Variables**:
  - `VITE_API_URL`: Fully qualified production URL of the backend API (e.g., `https://api.notifyx.yourdomain.com`). Leave empty if frontend and backend are hosted on the same domain.
  - `VITE_WS_URL`: (Optional) WebSocket URL if different from API domain (e.g., `wss://api.notifyx.yourdomain.com`).
- **Single-Container Mode**: When `NODE_ENV=production` is set on the Express server, Express automatically serves the compiled `dist/` static bundle and routes SPA client paths to `dist/index.html`.

### B. Backend API (Node.js + Express + WebSockets)
- **Build Command**: `npm run build`
- **Start Command**: `npm start` (executes `node server.ts` natively on Node 22+ with zero transpilation overhead) or `npm run dev` (`tsx server.ts`)
- **Port**: Bound dynamically to `process.env.PORT` (defaults to 3000, listens on `0.0.0.0`).
- **Reverse Proxy**: Express has `trust proxy = 1` enabled out of the box, correctly honoring `X-Forwarded-For` and `X-Forwarded-Proto` behind Cloud Run, Render, ALB, Nginx, or Cloudflare.
- **Boot Audit**: Automatically runs `validateEnvironment()` at boot, safely auditing database, queue, auth secret, and CORS settings with actionable warnings without leaking credentials.
- **Recommended Free/Low-Cost Hosting**: Render (Web Service), Railway, Fly.io, or Google Cloud Run (with WebSocket & session affinity enabled).
- **Requirements**: Long-running Node.js process supporting HTTP and persistent WebSocket (`/ws`) connections. Serverless functions without persistent WebSocket connections cannot maintain live in-app notification streaming.

### C. Background Worker Process
- **Worker Command**: `npm run worker` (executes `server/worker.ts`)
- **Architecture Role**:
  - Pulls jobs from the Redis BullMQ queue (`notification-delivery`).
  - Executes AI notification analysis (with graceful fallback).
  - Enforces recipient category preferences.
  - Dispatches via channel adapters (In-App, Email, Push).
  - Updates delivery statuses and handles retries with exponential backoff.
- **Embedded Engine**: In local environments without Redis, NotifyX automatically falls back to its embedded asynchronous delivery engine without throwing errors.

### D. Persistent Database (PostgreSQL)
- **Recommended Free Tier**: Supabase, Neon.tech, ElephantSQL, or Render PostgreSQL.
- **Migration Command**:
  ```bash
  npx prisma migrate deploy
  ```
- **Safety**: Never run `prisma db push --force-reset` in production. Always commit Prisma migrations and use `prisma migrate deploy` in CI/CD pipelines.

### E. Redis & BullMQ
- **Recommended Free Tier**: Upstash Redis, Redis Cloud (free 30MB tier), or Railway Redis.
- **Connection String**: `REDIS_URL="redis://default:password@host:port"`
- **Dual Functionality**: Handles BullMQ queue state and distributed sliding-window rate limit counters.

---

## 3. Environment Variables Reference

| Variable | Required in Prod | Description | Example |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | Runtime mode (`production`, `development`, `test`) | `production` |
| `PORT` | Yes | HTTP listen port assigned by host | `3000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://usr:pwd@host:5432/db?schema=public` |
| `REDIS_URL` | Yes | Redis connection string for BullMQ & rate limiter | `redis://default:pwd@host:6379` |
| `JWT_SECRET` | Yes | Cryptographic secret for signing developer JWTs | `min-32-random-hex-characters` |
| `JWT_EXPIRES_IN`| No | Token expiry duration (default: `7d`) | `7d` |
| `FRONTEND_URL` | Yes | Allowed frontend origin for CORS | `https://notifyx.yourdomain.com` |
| `API_URL` | No | Public backend URL | `https://api.notifyx.yourdomain.com` |
| `VITE_API_URL` | No | React API base URL (empty if same origin) | `https://api.notifyx.yourdomain.com` |
| `EMAIL_PROVIDER`| No | Email adapter (`mock`, `resend`, `sendgrid`) | `mock` |
| `PUSH_PROVIDER` | No | Push adapter (`mock`, `fcm`, `apns`) | `mock` |
| `AI_API_KEY` | No | Gemini API key or OpenAI key (optional) | `AIzaSy...` |
| `RATE_LIMIT_WINDOW_MS` | No | Rate limit window in ms (default: `60000`) | `60000` |
| `RATE_LIMIT_MAX_REQUESTS`| No | Max requests/window/app (default: `100`) | `100` |
| `AUTH_RATE_LIMIT_MAX` | No | Max auth failures/15m/IP (default: `5`) | `5` |

---

## 4. Production Readiness Checklist

Before pushing to production, verify each item:

- [x] **PostgreSQL Configured**: PostgreSQL URI defined in `DATABASE_URL`.
- [x] **Migrations Deployed**: `npx prisma migrate deploy` executed successfully.
- [x] **Redis Configured**: `REDIS_URL` points to an authenticated Redis instance.
- [x] **JWT Secret Configured**: High-entropy `JWT_SECRET` configured in environment (never committed).
- [x] **Frontend URL Configured**: `FRONTEND_URL` points to production domain; CORS origin whitelist active.
- [x] **CORS Tested**: Authenticated endpoints reject unauthorized external origins.
- [x] **Worker Process Running**: BullMQ worker active via `npm run worker` (or unified process).
- [x] **WebSockets Functional**: Persistent WebSocket route `/ws` accessible and responding to heartbeats.
- [x] **Health Check Working**: `GET /api/health`, `GET /api/health/live`, and `GET /api/health/ready` return 200.
- [x] **Rate Limits Enforced**: Application quota and auth brute-force protections active.
- [x] **AI Fallback Verified**: System operates reliably even if `AI_API_KEY` is omitted or provider times out.
- [x] **Zero Secrets in Repository**: `.env*` excluded in `.gitignore` (only `.env.example` committed).
- [x] **All Test Suites Passing**: Multi-channel, analytics, security, and AI test suites green.
- [x] **Production Build Clean**: TypeScript checks pass (`tsc --noEmit`) and Vite bundle compiles.

---

## 5. Graceful Degradation & Failure Handling

| Component Failure | System Behavior & Mitigation |
| :--- | :--- |
| **PostgreSQL Unreachable** | Health endpoint reports `status: degraded`. Ingestion rejects writes cleanly; read endpoints return structured `503` rather than leaking connection strings. |
| **Redis Down / Unreachable** | System transparently falls back to embedded asynchronous queue engine and in-memory rate-limiting buckets. Zero dropped notifications or crashes. |
| **AI Provider Timeout / Down** | Deterministic fallback classification activates immediately (<1ms). Categorization and priority default to payload fields; delivery continues uninterrupted. |
| **Downstream Carrier Failure** | Worker catches carrier error (e.g. SMTP 500), records failure in `notification_deliveries`, increments attempt count, and schedules exponential backoff retry. |
| **WebSocket Client Disconnect** | Notifications remain durably stored in PostgreSQL. Web client reconnects automatically with exponential backoff and synchronizes unread items on open. |
| **Worker Process Crash** | Unacknowledged jobs remain in Redis. BullMQ's lock mechanism re-assigns pending jobs to other worker instances or picks them up when the worker restarts. |

---

## 6. Interview Architecture Explanation Guide

When presenting this project in a system design or software engineering interview:

1. **Decoupled Architecture**: Emphasize how ingestion (`POST /api/v1/notifications`) returns `201 Accepted` in ~10ms by deferring slow carrier delivery (SMTP, APNs) and AI classification to background workers.
2. **Persistence First**: Every notification is written to PostgreSQL with an idempotency key *before* enqueueing to Redis, preventing data loss if Redis experiences failover.
3. **Multi-Channel & Gatekeeper**: Explain the distinction between candidate channels (selected by priority policy) and dispatched channels (filtered by recipient preferences).
4. **Security & Rate Limiting**: Highlight distributed token-bucket rate limiting in Redis, constant-time API key verification using SHA-256 hashes, and defense-in-depth security headers.
5. **Observability**: Mention health probes (`/live` vs `/ready`), structured audit logs, and analytical SQL aggregations designed to give real-time operational visibility.
