ALTER TABLE "customers" ADD COLUMN "last_appointment_at" TIMESTAMPTZ(3);
ALTER TABLE "customers" ADD COLUMN "last_reactivation_sent_at" TIMESTAMPTZ(3);
ALTER TABLE "customers" ADD COLUMN "marketing_opt_out" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "customers" ADD COLUMN "unsubscribe_token" TEXT;

CREATE UNIQUE INDEX "customers_unsubscribe_token_key" ON "customers"("unsubscribe_token");

UPDATE "customers" c
SET "last_appointment_at" = sub.max_starts_at
FROM (
  SELECT "customer_id", MAX("starts_at") AS max_starts_at
  FROM "appointments"
  WHERE "status" IN ('completed', 'no_show', 'confirmed')
  GROUP BY "customer_id"
) sub
WHERE c."id" = sub."customer_id";

CREATE INDEX "customers_business_id_risk_level_last_appointment_at_idx"
  ON "customers"("business_id", "risk_level", "last_appointment_at");
