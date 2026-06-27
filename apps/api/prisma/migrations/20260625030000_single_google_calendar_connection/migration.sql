WITH ranked_connections AS (
  SELECT
    "id",
    "business_id",
    "provider",
    ROW_NUMBER() OVER (
      PARTITION BY "business_id", "provider"
      ORDER BY
        CASE WHEN "status" = 'connected' THEN 0 ELSE 1 END,
        "updated_at" DESC,
        "created_at" DESC,
        "id" DESC
    ) AS row_number
  FROM "calendar_connections"
),
canonical_connections AS (
  SELECT "id", "business_id", "provider"
  FROM ranked_connections
  WHERE row_number = 1
),
duplicate_connections AS (
  SELECT ranked_connections."id", ranked_connections."business_id", ranked_connections."provider", canonical_connections."id" AS canonical_id
  FROM ranked_connections
  JOIN canonical_connections
    ON canonical_connections."business_id" = ranked_connections."business_id"
    AND canonical_connections."provider" = ranked_connections."provider"
  WHERE ranked_connections.row_number > 1
)
DELETE FROM "calendar_event_syncs" syncs
USING duplicate_connections duplicates
WHERE syncs."calendar_connection_id" = duplicates."id"
  AND EXISTS (
    SELECT 1
    FROM "calendar_event_syncs" canonical_syncs
    WHERE canonical_syncs."appointment_id" = syncs."appointment_id"
      AND canonical_syncs."calendar_connection_id" = duplicates.canonical_id
  );

WITH ranked_connections AS (
  SELECT
    "id",
    "business_id",
    "provider",
    ROW_NUMBER() OVER (
      PARTITION BY "business_id", "provider"
      ORDER BY
        CASE WHEN "status" = 'connected' THEN 0 ELSE 1 END,
        "updated_at" DESC,
        "created_at" DESC,
        "id" DESC
    ) AS row_number
  FROM "calendar_connections"
),
canonical_connections AS (
  SELECT "id", "business_id", "provider"
  FROM ranked_connections
  WHERE row_number = 1
),
duplicate_connections AS (
  SELECT ranked_connections."id", ranked_connections."business_id", ranked_connections."provider", canonical_connections."id" AS canonical_id
  FROM ranked_connections
  JOIN canonical_connections
    ON canonical_connections."business_id" = ranked_connections."business_id"
    AND canonical_connections."provider" = ranked_connections."provider"
  WHERE ranked_connections.row_number > 1
)
UPDATE "calendar_event_syncs" syncs
SET "calendar_connection_id" = duplicates.canonical_id,
    "updated_at" = CURRENT_TIMESTAMP
FROM duplicate_connections duplicates
WHERE syncs."calendar_connection_id" = duplicates."id";

WITH ranked_connections AS (
  SELECT
    "id",
    "business_id",
    "provider",
    ROW_NUMBER() OVER (
      PARTITION BY "business_id", "provider"
      ORDER BY
        CASE WHEN "status" = 'connected' THEN 0 ELSE 1 END,
        "updated_at" DESC,
        "created_at" DESC,
        "id" DESC
    ) AS row_number
  FROM "calendar_connections"
)
DELETE FROM "calendar_connections"
WHERE "id" IN (
  SELECT "id"
  FROM ranked_connections
  WHERE row_number > 1
);

UPDATE "calendar_connections"
SET "staff_member_id" = NULL,
    "updated_at" = CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "calendar_connections_business_id_staff_member_id_provider_key";

CREATE UNIQUE INDEX "calendar_connections_business_id_provider_key"
  ON "calendar_connections"("business_id", "provider");
