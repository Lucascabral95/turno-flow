CREATE TABLE "customer_portal_login_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_portal_login_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_portal_login_tokens_token_hash_key" ON "customer_portal_login_tokens"("token_hash");

CREATE INDEX "customer_portal_login_tokens_customer_id_created_at_idx" ON "customer_portal_login_tokens"("customer_id", "created_at");

ALTER TABLE "customer_portal_login_tokens" ADD CONSTRAINT "customer_portal_login_tokens_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_portal_login_tokens" ADD CONSTRAINT "customer_portal_login_tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
