CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key"
ON "refresh_tokens"("token_hash");

CREATE INDEX "refresh_tokens_user_id_revoked_at_idx"
ON "refresh_tokens"("user_id", "revoked_at");

CREATE INDEX "refresh_tokens_expires_at_idx"
ON "refresh_tokens"("expires_at");

ALTER TABLE "refresh_tokens"
ADD CONSTRAINT "refresh_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
