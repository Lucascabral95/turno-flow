CREATE TYPE "calendar_provider" AS ENUM ('google', 'outlook');
CREATE TYPE "calendar_connection_status" AS ENUM ('not_configured', 'connected', 'expired', 'error');

CREATE TABLE "notification_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "staff_member_id" UUID,
  "provider" "calendar_provider" NOT NULL,
  "status" "calendar_connection_status" NOT NULL DEFAULT 'not_configured',
  "account_email" TEXT,
  "external_calendar_id" TEXT,
  "access_token_encrypted" TEXT,
  "refresh_token_encrypted" TEXT,
  "expires_at" TIMESTAMPTZ(3),
  "last_synced_at" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_templates_business_id_key_key" ON "notification_templates"("business_id", "key");
CREATE INDEX "notification_templates_business_id_active_idx" ON "notification_templates"("business_id", "active");
CREATE UNIQUE INDEX "calendar_connections_business_id_staff_member_id_provider_key" ON "calendar_connections"("business_id", "staff_member_id", "provider");
CREATE INDEX "calendar_connections_business_id_provider_status_idx" ON "calendar_connections"("business_id", "provider", "status");

ALTER TABLE "notification_templates"
  ADD CONSTRAINT "notification_templates_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_connections"
  ADD CONSTRAINT "calendar_connections_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_connections"
  ADD CONSTRAINT "calendar_connections_staff_member_id_fkey"
  FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "notification_templates" ("business_id", "key", "name", "subject", "body", "created_at", "updated_at")
SELECT
  "id",
  'appointment_reminder_24h',
  'Recordatorio 24 horas',
  'Recordatorio de turno',
  'Hola {{customerName}}, te recordamos tu turno de {{serviceName}} el {{startsAt}}. Si no podes asistir, usa este link: {{cancelUrl}}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "businesses"
ON CONFLICT DO NOTHING;
