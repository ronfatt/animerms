DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'AssetType' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."AssetType" AS ENUM ('image_raw', 'image_typeset', 'video');
  END IF;
END $$;
