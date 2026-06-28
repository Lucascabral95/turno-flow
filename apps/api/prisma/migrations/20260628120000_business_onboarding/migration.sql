CREATE TYPE "onboarding_step" AS ENUM ('business', 'service', 'staff', 'availability', 'public_page');

CREATE TABLE "business_onboarding" (
    "business_id" UUID NOT NULL,
    "current_step" "onboarding_step" NOT NULL DEFAULT 'business',
    "completed_at" TIMESTAMPTZ(3),
    "dismissed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_onboarding_pkey" PRIMARY KEY ("business_id"),
    CONSTRAINT "business_onboarding_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
