-- Migration: Enforce NOT NULL on gender after normalizing data
-- Date: 2025-11-10
-- Purpose: Defense-in-depth; ensure gender is always present

BEGIN;

-- Set default 'female' for any NULL genders (should be none, but defensive)
UPDATE users
SET gender = 'female'
WHERE gender IS NULL;

-- Enforce NOT NULL constraint on gender
ALTER TABLE users
  ALTER COLUMN gender SET NOT NULL;

-- Optional: log in schema_migrations if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO schema_migrations (version, description, applied_at) 
    VALUES ('003', 'Enforce NOT NULL on users.gender', NOW());
  END IF;
END$$;

COMMIT;







