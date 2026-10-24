import http from 'http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './server/routes/authRoutes.ts';
import { applicationRouter } from './server/routes/applicationRoutes.ts';
import { notificationRouter } from './server/routes/notificationRoutes.ts';
import { deliveryRouter } from './server/routes/deliveryRoutes.ts';
import { preferenceRouter } from './server/routes/preferenceRoutes.ts';
import { externalApiRouter } from './server/routes/externalApiRoutes.ts';
import { queueRouter } from './server/routes/queueRoutes.ts';
import { analyticsRouter } from './server/routes/analyticsRoutes.ts';
import { securityRouter } from './server/routes/securityRoutes.ts';
import { healthRouter } from './server/routes/healthRoutes.ts';
import { initWebSocketServer } from './server/realtime/websocketServer.ts';
import { startNotificationWorker, stopNotificationWorker } from './server/queue/notificationWorker.ts';
import { recoverPendingNotifications } from './server/queue/notificationQueue.ts';
import { prisma } from './server/db/prisma.ts';
import { applySecurityHeaders, configureCors } from './server/security/securityHeaders.ts';
import { secureErrorHandler } from './server/security/sanitization.ts';
import { validateEnvironment } from './server/config/envValidation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Run configuration audit on startup
validateEnvironment();

const app = express();
// Enable trust proxy for reverse proxies (Cloud Run, Render, ALB, Nginx)
app.set('trust proxy', 1);

const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

// Initialize WebSocket server on the shared HTTP server instance
initWebSocketServer(httpServer);

// Security Headers & Origin CORS Protection
app.use(applySecurityHeaders);
app.use(configureCors);

// Body parser with 1MB payload ceiling (DoS & memory exhaustion protection)
app.use(express.json({ limit: '1mb' }));

// API Routers (Developer console JWT auth)
app.use('/api/auth', authRouter);
app.use('/api/applications', applicationRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/deliveries', deliveryRouter);
app.use('/api/preferences', preferenceRouter);
app.use('/api/queue', queueRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/security', securityRouter);
app.use('/api/health', healthRouter);
app.use('/health', healthRouter);

// External Application API (Bearer <API_KEY> auth)
app.use('/api/v1', externalApiRouter);

// Secure error handler masks database internals and stack traces from clients
app.use('/api', secureErrorHandler);

async function startServer() {
  // 1. Initialize background worker and recover pending notifications sequentially BEFORE accepting traffic
  try {
    await startNotificationWorker();
    const recovered = await recoverPendingNotifications().catch((recErr) => {
      console.warn('⚠️ Notification recovery warning:', recErr.message);
      return 0;
    });
    if (recovered > 0) {
      console.log(`🔄 Recovered ${recovered} pending notifications after startup.`);
    }
  } catch (err: any) {
    console.warn('Worker initialization warning:', err.message);
  }

  // 2. Setup static assets in production or Vite middleware in development
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NotifyX server listening on http://0.0.0.0:${PORT}`);
  });
}

// Graceful shutdown handling (SIGTERM & SIGINT)
let isShuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 [Shutdown] Received ${signal}. Starting graceful shutdown...`);

  const forceTimeout = setTimeout(() => {
    console.warn('⚠️ [Shutdown] Forced shutdown due to timeout (10s)');
    process.exit(1);
  }, 10000);

  try {
    httpServer.close(() => {
      console.log('🚪 [Shutdown] HTTP server closed to new requests.');
    });

    await stopNotificationWorker().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    console.log('💾 [Shutdown] Database connections closed.');

    clearTimeout(forceTimeout);
    console.log('✅ [Shutdown] Clean exit completed.');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ [Shutdown] Error during graceful shutdown:', err.message);
    clearTimeout(forceTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

