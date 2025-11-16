-- Migration: Update gender constraint to only accept 'female'
-- Date: 2025-11-10
-- Reason: Align with frontend changes (Female/Male options) and backend validation (female-only acceptance)

BEGIN;

-- Drop existing constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_gender_check;

-- Add new constraint without validating existing data
ALTER TABLE users ADD CONSTRAINT users_gender_check 
  CHECK (LOWER(gender) = 'female') NOT VALID;

-- Optional: Log migration if schema_migrations exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO schema_migrations (version, description, applied_at) 
    VALUES ('002', 'Update gender constraint to female-only', NOW());
  END IF;
END$$;

COMMIT;






