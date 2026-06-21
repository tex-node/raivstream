CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "projectId" TEXT,
  "eventName" TEXT NOT NULL,
  "properties" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "analytics_events_userId_idx" ON "analytics_events"("userId");
CREATE INDEX IF NOT EXISTS "analytics_events_projectId_idx" ON "analytics_events"("projectId");
CREATE INDEX IF NOT EXISTS "analytics_events_eventName_idx" ON "analytics_events"("eventName");
CREATE INDEX IF NOT EXISTS "analytics_events_createdAt_idx" ON "analytics_events"("createdAt");
CREATE INDEX IF NOT EXISTS "analytics_events_eventName_createdAt_idx" ON "analytics_events"("eventName", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_events_userId_fkey'
  ) THEN
    ALTER TABLE "analytics_events"
      ADD CONSTRAINT "analytics_events_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
