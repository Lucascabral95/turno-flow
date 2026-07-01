CREATE TABLE "appointment_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(3),

    CONSTRAINT "appointment_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appointment_reviews_appointment_id_key" ON "appointment_reviews"("appointment_id");

CREATE UNIQUE INDEX "appointment_reviews_token_key" ON "appointment_reviews"("token");

CREATE INDEX "appointment_reviews_business_id_submitted_at_idx" ON "appointment_reviews"("business_id", "submitted_at");

ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
