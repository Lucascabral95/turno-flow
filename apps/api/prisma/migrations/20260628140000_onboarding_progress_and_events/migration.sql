ALTER TABLE "business_onboarding"
ADD COLUMN "progress_data" JSONB;

CREATE TABLE "business_onboarding_events" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "step" "onboarding_step",
    "event_type" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_onboarding_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_onboarding_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "business_onboarding_events_business_id_created_at_idx"
ON "business_onboarding_events"("business_id", "created_at");

CREATE INDEX "business_onboarding_events_business_id_step_created_at_idx"
ON "business_onboarding_events"("business_id", "step", "created_at");
