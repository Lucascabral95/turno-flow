-- Add BusinessMemberStatus enum
CREATE TYPE "business_member_status" AS ENUM ('pending_invite', 'active', 'inactive');

-- Extend business_members: nullable user_id, status, invite fields
ALTER TABLE "business_members"
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN "status" "business_member_status" NOT NULL DEFAULT 'active',
  ADD COLUMN "invite_email" TEXT,
  ADD COLUMN "invite_token_hash" TEXT,
  ADD COLUMN "invite_expires_at" TIMESTAMPTZ;

-- Index for invite email lookups
CREATE INDEX "business_members_business_id_invite_email_idx"
  ON "business_members"("business_id", "invite_email");

-- Create service_staff_members join table
CREATE TABLE "service_staff_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "service_id" UUID NOT NULL,
  "staff_member_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_staff_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_staff_members_service_id_staff_member_id_key" UNIQUE ("service_id", "staff_member_id")
);

ALTER TABLE "service_staff_members"
  ADD CONSTRAINT "service_staff_members_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_staff_members"
  ADD CONSTRAINT "service_staff_members_staff_member_id_fkey"
  FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create staff_member_metrics_daily table
CREATE TABLE "staff_member_metrics_daily" (
  "business_id" UUID NOT NULL,
  "staff_member_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "total_appointments" INTEGER NOT NULL DEFAULT 0,
  "completed_appointments" INTEGER NOT NULL DEFAULT 0,
  "cancelled_appointments" INTEGER NOT NULL DEFAULT 0,
  "no_show_appointments" INTEGER NOT NULL DEFAULT 0,
  "estimated_revenue_cents" INTEGER NOT NULL DEFAULT 0,
  "occupancy_minutes" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_member_metrics_daily_pkey" PRIMARY KEY ("business_id", "staff_member_id", "date")
);

ALTER TABLE "staff_member_metrics_daily"
  ADD CONSTRAINT "staff_member_metrics_daily_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_member_metrics_daily"
  ADD CONSTRAINT "staff_member_metrics_daily_staff_member_id_fkey"
  FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "staff_member_metrics_daily_business_id_staff_member_id_date_idx"
  ON "staff_member_metrics_daily"("business_id", "staff_member_id", "date");
