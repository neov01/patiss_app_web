-- Add optional note field to inventory_logs for movement justification
ALTER TABLE public.inventory_logs
    ADD COLUMN IF NOT EXISTS note TEXT;

COMMENT ON COLUMN public.inventory_logs.note IS 'Raison ou note libre optionnelle pour le mouvement de stock';
