-- =========================================================================
-- Migration : 20260619193000_fix_triggers_and_regularize_data
-- Objectif  : 
--   1. Associer le trigger trg_sync_transaction_to_order_payment à la bonne
--      fonction sync_transaction_to_order_payment_before_insert() pour
--      normaliser les modes de paiement lors des futurs inserts.
--   2. Supprimer la transaction en double pour la commande MOUNA KONE.
--   3. Insérer les acomptes manquants pour les 33 commandes concernées.
-- =========================================================================

-- 1. Réassociation du trigger
DROP TRIGGER IF EXISTS trg_sync_transaction_to_order_payment ON public.transactions;
CREATE TRIGGER trg_sync_transaction_to_order_payment
BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_transaction_to_order_payment_before_insert();

-- 2. Nettoyage du doublon MOUNA KONE (CMD-2026-4376)
DELETE FROM public.order_payments 
WHERE id = '6f8ef7c9-6a54-4900-a4c0-4f089f2942d7';

-- 3. Régularisation uniquement des acomptes historiques (deposit_amount > 0)
INSERT INTO public.order_payments (
  organization_id,
  order_id,
  amount,
  payment_method,
  payment_date,
  note,
  created_by
)
SELECT 
  organization_id,
  id AS order_id,
  deposit_amount AS amount,
  'other' AS payment_method,
  created_at AS payment_date,
  'Régularisation automatique - Acompte historique' AS note,
  created_by
FROM public.orders
WHERE deposit_amount > 0
  AND NOT EXISTS (
    SELECT 1 
    FROM public.order_payments 
    WHERE order_payments.order_id = orders.id
  );
