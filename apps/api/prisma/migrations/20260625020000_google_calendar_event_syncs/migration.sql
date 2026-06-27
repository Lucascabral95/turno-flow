CREATE TYPE "calendar_event_sync_status" AS ENUM ('pending', 'synced', 'deleted', 'failed');

CREATE TABLE "calendar_event_syncs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "appointment_id" UUID NOT NULL,
  "calendar_connection_id" UUID NOT NULL,
  "google_event_id" TEXT,
  "status" "calendar_event_sync_status" NOT NULL DEFAULT 'pending',
  "last_error" TEXT,
  "last_synced_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "calendar_event_syncs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendar_event_syncs_appointment_id_calendar_connection_id_key"
  ON "calendar_event_syncs"("appointment_id", "calendar_connection_id");

CREATE INDEX "calendar_event_syncs_business_id_status_idx"
  ON "calendar_event_syncs"("business_id", "status");

CREATE INDEX "calendar_event_syncs_calendar_connection_id_status_idx"
  ON "calendar_event_syncs"("calendar_connection_id", "status");

ALTER TABLE "calendar_event_syncs"
  ADD CONSTRAINT "calendar_event_syncs_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_event_syncs"
  ADD CONSTRAINT "calendar_event_syncs_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_event_syncs"
  ADD CONSTRAINT "calendar_event_syncs_calendar_connection_id_fkey"
  FOREIGN KEY ("calendar_connection_id") REFERENCES "calendar_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
