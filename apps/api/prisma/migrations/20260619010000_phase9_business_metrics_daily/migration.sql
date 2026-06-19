CREATE TABLE "business_metrics_daily" (
    "business_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "total_appointments" INTEGER NOT NULL DEFAULT 0,
    "active_appointments" INTEGER NOT NULL DEFAULT 0,
    "completed_appointments" INTEGER NOT NULL DEFAULT 0,
    "cancelled_appointments" INTEGER NOT NULL DEFAULT 0,
    "no_show_appointments" INTEGER NOT NULL DEFAULT 0,
    "estimated_revenue_cents" INTEGER NOT NULL DEFAULT 0,
    "lost_revenue_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_metrics_daily_pkey" PRIMARY KEY ("business_id", "date")
);

CREATE INDEX "business_metrics_daily_business_id_date_idx"
ON "business_metrics_daily"("business_id", "date");

ALTER TABLE "business_metrics_daily"
ADD CONSTRAINT "business_metrics_daily_business_id_fkey"
FOREIGN KEY ("business_id") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
