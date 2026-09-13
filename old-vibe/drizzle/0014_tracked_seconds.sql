ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tracked_seconds" integer DEFAULT 0 NOT NULL;
