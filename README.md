# NotifyX — Developer Notification Infrastructure Platform

NotifyX is a production-grade, multi-tenant notification infrastructure platform that enables developers to ingest, prioritize, classify, and reliably deliver notifications across In-App, Email, and Push channels with sub-second latency.

---

## 🏛️ System Architecture

```
                    External Application / Developer Client
                                       │
                                       ▼
                   ┌──────────────────────────────────────┐
                   │             NotifyX API              │
                   │        (Node.js + Express + WS)      │
                   └───────────┬──────────────┬───────────┘
                               │              │
                   Ingest &    │              │ BullMQ Job Enqueue
                   Persist     │              │ & Rate Limiting
                               ▼              ▼
                   ┌──────────────────┐  ┌────────────────┐
                   │ PostgreSQL / DB  │  │ Redis / BullMQ │
                   │ (Idempotent Log) │  │  (Job Queue)   │
                   └──────────────────┘  └────────┬───────┘
                                                  │
                                                  ▼
                                         ┌────────────────┐
                                         │ Background     │
                                         │ Worker Process │
                                         └────────┬───────┘
                                                  │
                                                  ▼
                                      ┌───────────────────────┐
                                      │ AI Notification       │
                                      │ Intelligence Engine   │
                                      │ (Classification & P95)│
                                      └───────────┬───────────┘
                                                  │
                                                  ▼
                                      ┌───────────────────────┐
                                      │ Recipient Preference  │
                                      │ Gatekeeper Engine     │
                                      └───────────┬───────────┘
                                                  │
                                                  ▼
                                      ┌───────────────────────┐
                                      │ Multi-Channel Adapters│
                                      │ ├── In-App (WebSocket)│
                                      │ ├── Email (Mock/SMTP) │
                                      │ └── Push (Mock/APNs)  │
                                      └───────────────────────┘
```

---

## 🚀 Key Technical Capabilities

1. **Multi-Tenant Application Management**:
   - Developers create isolated applications with granular API keys.
   - API keys are hashed using SHA-256 with high-entropy salt; raw keys are never stored in plaintext.
   - Key rolling and instant revocation with zero downtime.

2. **Asynchronous Ingestion Pipeline**:
   - `POST /api/v1/notifications` validates schema, checks idempotency keys, persists state to PostgreSQL, enqueues the delivery job into Redis BullMQ, and immediately returns `201 Accepted` (sub-15ms response time).

3. **Background Worker & Resilience**:
   - Independent worker process (`npm run worker`) processes notifications concurrently.
   - Priority-aware channel selection automatically routes urgent alerts to multiple channels.
   - Exponential backoff with jitter on transient carrier errors.
   - Dead-letter queue tracking for permanent carrier failures.

4. **Recipient Preferences**:
   - End-users can toggle In-App, Email, and Push preferences by category (`security`, `payments`, `system`, etc.).
   - Explicit channel exclusions act as authoritative gatekeepers without dropping messages.

5. **AI Notification Intelligence**:
   - Analyzes notification content for canonical classification and priority evaluation.
   - Strict safety rule: AI suggestions never downgrade application-specified critical priorities.
   - 100% deterministic local fallback ensures notifications are never dropped if AI provider is unavailable.

6. **Real-Time Delivery & Analytics**:
   - Persistent WebSocket server routes in-app notifications instantly to active browser sessions.
   - Dedicated `AnalyticsService` computes delivery timeline rollups, latency percentiles, error breakdowns, and worker health metrics.

7. **Security & Rate Limiting**:
   - Distributed sliding-window rate limiting backed by Redis with atomic pipelines.
   - Brute-force protection on authentication endpoints.
   - Defense-in-depth HTTP headers (`X-Frame-Options`, `nosniff`, `HSTS`, `CORS` origin whitelisting).
   - Structured security audit logging with automatic credential redaction.

---

## 🛠️ Quick Start & Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```
Access the NotifyX developer console at `http://localhost:3000`.

### 4. Run Dedicated Worker (Optional)
```bash
npm run worker
```

### 5. Execute Automated Test Suites
```bash
# Run all multi-channel, analytics, security, and AI tests:
npm run test:channels
npm run test:analytics
npm run test:security
npm run test:ai
```

---

## 📦 Production Deployment

For complete production deployment guides (Vercel, Render, Railway, Fly.io, PostgreSQL, and Redis), see [DEPLOYMENT.md](./DEPLOYMENT.md).
