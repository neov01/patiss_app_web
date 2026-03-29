-- Migration: Add kiosk_code to organizations table

-- Add the kiosk_code column (unique string, nullable initially)
ALTER TABLE organizations ADD COLUMN kiosk_code text UNIQUE;

-- Generate an 8-character code for existing organizations: 
-- 4 initials (padded if name < 4) + 4 random digits
UPDATE organizations
SET kiosk_code = 
    UPPER(RPAD(REGEXP_REPLACE(name, '[^a-zA-Z]', '', 'g'), 4, 'X')) || 
    LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0')
WHERE kiosk_code IS NULL;
