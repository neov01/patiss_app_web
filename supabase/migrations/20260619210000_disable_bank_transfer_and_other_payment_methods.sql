-- ============================================================
-- Migration : 20260619210000_disable_bank_transfer_and_other_payment_methods
-- Objectif  : Supprimer les modes 'bank_transfer' et 'other'
--             et migrer les données existantes vers 'cash'.
-- ============================================================

-- 1. Migrer les lignes existantes dans order_payments
UPDATE public.order_payments
SET payment_method = 'cash'
WHERE payment_method IN ('other', 'bank_transfer');

-- 2. Migrer les lignes existantes dans transactions
UPDATE public.transactions
SET payment_method = 'cash'
WHERE payment_method IN ('other', 'bank_transfer');

-- 3. Mettre à jour payment_details dans transactions pour fusionner 'other' et 'bank_transfer' dans 'cash'
UPDATE public.transactions
SET payment_details = 
  (payment_details - 'other' - 'bank_transfer') || 
  jsonb_build_object('cash', COALESCE((payment_details->>'cash')::numeric, 0) + COALESCE((payment_details->>'other')::numeric, 0) + COALESCE((payment_details->>'bank_transfer')::numeric, 0))
WHERE payment_details ? 'other' OR payment_details ? 'bank_transfer';

-- 4. Redéfinir la fonction de normalisation pour éliminer 'bank_transfer' et 'other'
CREATE OR REPLACE FUNCTION public.normalize_payment_method(raw TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(raw, '')))
    WHEN 'espèces'       THEN 'cash'
    WHEN 'especes'        THEN 'cash'
    WHEN 'cash'           THEN 'cash'
    WHEN 'orange money'   THEN 'orange_money'
    WHEN 'orange_money'   THEN 'orange_money'
    WHEN 'wave'           THEN 'wave'
    WHEN 'mtn momo'       THEN 'mobile_money'
    WHEN 'mobile money'   THEN 'mobile_money'
    WHEN 'mobile_money'   THEN 'mobile_money'
    WHEN 'moov money'     THEN 'moov_money'
    WHEN 'moov_money'     THEN 'moov_money'
    ELSE 'cash' -- Fallback vers cash puisque other et bank_transfer sont désactivés
  END;
$$;

-- 5. Modifier la contrainte CHECK sur public.order_payments
ALTER TABLE public.order_payments
DROP CONSTRAINT IF EXISTS order_payments_payment_method_check;

ALTER TABLE public.order_payments
ADD CONSTRAINT order_payments_payment_method_check 
CHECK (payment_method IN ('cash', 'orange_money', 'wave', 'mobile_money', 'moov_money'));
