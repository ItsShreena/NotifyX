-- AlterTable notification_preferences adding userId and making applicationId/recipientId optional
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "notification_preferences" ALTER COLUMN "applicationId" DROP NOT NULL;
ALTER TABLE "notification_preferences" ALTER COLUMN "recipientId" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_preferences_userId_fkey'
  ) THEN
    ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "notification_preferences_userId_idx" ON "notification_preferences"("userId");
CREATE INDEX IF NOT EXISTS "notification_preferences_category_idx" ON "notification_preferences"("category");
