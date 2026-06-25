CREATE TYPE "business_member_role" AS ENUM ('owner', 'receptionist', 'professional');

CREATE TABLE "business_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "staff_member_id" UUID,
  "role" "business_member_role" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "business_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "user_id" UUID,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "request_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

INSERT INTO "business_members" ("business_id", "user_id", "role", "created_at", "updated_at")
SELECT "id", "owner_id", 'owner'::"business_member_role", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "businesses"
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "business_members_business_id_user_id_key" ON "business_members"("business_id", "user_id");
CREATE INDEX "business_members_business_id_role_idx" ON "business_members"("business_id", "role");
CREATE INDEX "business_members_user_id_active_idx" ON "business_members"("user_id", "active");
CREATE INDEX "audit_logs_business_id_created_at_idx" ON "audit_logs"("business_id", "created_at");
CREATE INDEX "audit_logs_business_id_entity_entity_id_idx" ON "audit_logs"("business_id", "entity", "entity_id");
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

ALTER TABLE "business_members"
  ADD CONSTRAINT "business_members_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_members"
  ADD CONSTRAINT "business_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_members"
  ADD CONSTRAINT "business_members_staff_member_id_fkey"
  FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
