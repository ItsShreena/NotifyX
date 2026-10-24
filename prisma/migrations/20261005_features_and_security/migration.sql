-- AlterTable notifications adding idempotencyKey, attemptCount, lastError, retryHistory, AI columns
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "retryHistory" JSONB;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "aiProcessed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "aiCategory" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "aiPriority" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "aiSummary" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "aiShouldGroup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "aiProcessedAt" TIMESTAMP(3);

-- Create unique index for idempotency per application
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_applicationId_idempotencyKey_key" ON "notifications"("applicationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "notifications_status_idx" ON "notifications"("status");
CREATE INDEX IF NOT EXISTS "notifications_applicationId_createdAt_idx" ON "notifications"("applicationId", "createdAt");
CREATE INDEX IF NOT EXISTS "notifications_aiProcessed_idx" ON "notifications"("aiProcessed");

-- AlterTable notification_deliveries indexes
CREATE INDEX IF NOT EXISTS "notification_deliveries_deliveredAt_idx" ON "notification_deliveries"("deliveredAt");
CREATE INDEX IF NOT EXISTS "notification_deliveries_failedAt_idx" ON "notification_deliveries"("failedAt");
CREATE INDEX IF NOT EXISTS "notification_deliveries_channel_status_idx" ON "notification_deliveries"("channel", "status");

-- CreateTable audit_logs
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "applicationId" TEXT,
    "eventType" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX IF NOT EXISTS "audit_logs_applicationId_idx" ON "audit_logs"("applicationId");
CREATE INDEX IF NOT EXISTS "audit_logs_eventType_idx" ON "audit_logs"("eventType");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
