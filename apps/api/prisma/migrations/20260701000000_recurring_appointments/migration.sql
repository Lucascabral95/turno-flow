-- CreateEnum
CREATE TYPE "recurring_interval_unit" AS ENUM ('day', 'week', 'month');

-- CreateEnum
CREATE TYPE "recurring_series_status" AS ENUM ('active', 'paused', 'cancelled', 'completed');

-- CreateTable
CREATE TABLE "recurring_appointment_series" (
    "id"                   UUID        NOT NULL DEFAULT gen_random_uuid(),
    "business_id"          UUID        NOT NULL,
    "customer_id"          UUID        NOT NULL,
    "service_id"           UUID        NOT NULL,
    "staff_member_id"      UUID        NOT NULL,
    "interval_value"       INTEGER     NOT NULL,
    "interval_unit"        "recurring_interval_unit" NOT NULL,
    "next_occurrence_at"   TIMESTAMPTZ(3) NOT NULL,
    "advance_notice_days"  INTEGER     NOT NULL DEFAULT 7,
    "status"               "recurring_series_status" NOT NULL DEFAULT 'active',
    "max_occurrences"      INTEGER,
    "occurrences_created"  INTEGER     NOT NULL DEFAULT 0,
    "created_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_appointment_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_appointment_series_business_id_status_next_occur_idx"
    ON "recurring_appointment_series"("business_id", "status", "next_occurrence_at");

-- AddForeignKey
ALTER TABLE "recurring_appointment_series"
    ADD CONSTRAINT "recurring_appointment_series_business_id_fkey"
    FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recurring_appointment_series"
    ADD CONSTRAINT "recurring_appointment_series_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recurring_appointment_series"
    ADD CONSTRAINT "recurring_appointment_series_service_id_fkey"
    FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recurring_appointment_series"
    ADD CONSTRAINT "recurring_appointment_series_staff_member_id_fkey"
    FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable appointments: add recurring_series_id
ALTER TABLE "appointments"
    ADD COLUMN "recurring_series_id" UUID;

ALTER TABLE "appointments"
    ADD CONSTRAINT "appointments_recurring_series_id_fkey"
    FOREIGN KEY ("recurring_series_id") REFERENCES "recurring_appointment_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
