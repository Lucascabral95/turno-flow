CREATE TYPE "deposit_mode" AS ENUM ('fixed', 'percentage');

CREATE TYPE "appointment_payment_type" AS ENUM ('deposit');

CREATE TYPE "appointment_payment_status" AS ENUM ('submitted', 'confirmed', 'rejected', 'voided');

ALTER TABLE "businesses"
  ADD COLUMN "manual_deposits_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "payment_alias" TEXT,
  ADD COLUMN "payment_account_holder" TEXT,
  ADD COLUMN "payment_account_label" TEXT,
  ADD COLUMN "payment_instructions" TEXT;

ALTER TABLE "services"
  ADD COLUMN "deposit_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deposit_mode" "deposit_mode" NOT NULL DEFAULT 'fixed',
  ADD COLUMN "deposit_amount_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deposit_percentage" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deposit_description" TEXT;

CREATE TABLE "appointment_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "appointment_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "type" "appointment_payment_type" NOT NULL DEFAULT 'deposit',
  "status" "appointment_payment_status" NOT NULL DEFAULT 'submitted',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "reference" TEXT,
  "customer_note" TEXT,
  "internal_note" TEXT,
  "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_at" TIMESTAMPTZ(3),
  "rejected_at" TIMESTAMPTZ(3),
  "voided_at" TIMESTAMPTZ(3),
  "confirmed_by_user_id" UUID,
  "rejected_by_user_id" UUID,
  "voided_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "appointment_payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "appointment_payments"
  ADD CONSTRAINT "appointment_payments_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointment_payments"
  ADD CONSTRAINT "appointment_payments_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointment_payments"
  ADD CONSTRAINT "appointment_payments_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "appointment_payments_business_id_status_submitted_at_idx"
  ON "appointment_payments"("business_id", "status", "submitted_at");

CREATE INDEX "appointment_payments_appointment_id_status_idx"
  ON "appointment_payments"("appointment_id", "status");

CREATE INDEX "appointment_payments_customer_id_status_idx"
  ON "appointment_payments"("customer_id", "status");

ALTER TABLE "appointment_payments"
  ADD CONSTRAINT "appointment_payments_amount_cents_check" CHECK ("amount_cents" > 0);

ALTER TABLE "services"
  ADD CONSTRAINT "services_deposit_amount_cents_check" CHECK ("deposit_amount_cents" >= 0),
  ADD CONSTRAINT "services_deposit_percentage_check" CHECK ("deposit_percentage" >= 0 AND "deposit_percentage" <= 100);
