CREATE TYPE "customer_risk_level" AS ENUM ('low', 'medium', 'high');

ALTER TABLE "customers"
ADD COLUMN "completed_appointments" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "risk_level" "customer_risk_level" NOT NULL DEFAULT 'low',
ADD COLUMN "risk_score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "requires_deposit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "last_risk_calculated_at" TIMESTAMPTZ(3);

ALTER TABLE "appointments"
ADD COLUMN "attendance_alerted_at" TIMESTAMPTZ(3);

CREATE INDEX "customers_business_id_risk_level_risk_score_idx"
ON "customers"("business_id", "risk_level", "risk_score");

CREATE INDEX "appointments_status_ends_at_attendance_alerted_at_idx"
ON "appointments"("status", "ends_at", "attendance_alerted_at");
