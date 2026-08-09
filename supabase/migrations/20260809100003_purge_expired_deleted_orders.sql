-- ============================================================
-- Migration : 20260809100003_purge_expired_deleted_orders
-- Objectif  : Purge définitive quotidienne des commandes supprimées
--             depuis plus de 30 jours (calculé individuellement par
--             commande), avec journal d'audit conservé après suppression.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.purge_expired_deleted_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order        RECORD;
  v_tx           RECORD;
  v_points       INTEGER;
  v_purged_count INTEGER := 0;
BEGIN
  FOR v_order IN
    SELECT id, organization_id, order_number
    FROM public.orders
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '30 days'
  LOOP
    BEGIN
      FOR v_tx IN
        SELECT amount, customer_id
        FROM public.transactions
        WHERE order_id = v_order.id AND organization_id = v_order.organization_id
      LOOP
        IF v_tx.customer_id IS NOT NULL AND v_tx.amount > 0 THEN
          v_points := FLOOR(v_tx.amount / 1000);
          IF v_points > 0 THEN
            UPDATE public.customers
            SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - v_points),
                lifetime_points = GREATEST(0, COALESCE(lifetime_points, 0) - v_points)
            WHERE id = v_tx.customer_id AND organization_id = v_order.organization_id;
          END IF;
        END IF;
      END LOOP;

      DELETE FROM public.transactions WHERE order_id = v_order.id AND organization_id = v_order.organization_id;

      INSERT INTO public.order_deletion_audit (
        organization_id, order_id, order_reference, action,
        performed_by, performed_by_name, reason
      ) VALUES (
        v_order.organization_id, v_order.id, COALESCE(v_order.order_number, v_order.id::text), 'purge',
        NULL, 'Système', 'Purge automatique après 30 jours'
      );

      DELETE FROM public.orders WHERE id = v_order.id AND organization_id = v_order.organization_id;

      v_purged_count := v_purged_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error processing order %: %', v_order.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_purged_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_expired_deleted_orders() FROM PUBLIC, anon, authenticated;

-- Idempotent : on retire l'ancien job avant de le recréer, pour permettre de rejouer la migration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-deleted-orders') THEN
    PERFORM cron.unschedule('purge-expired-deleted-orders');
  END IF;
END $$;

SELECT cron.schedule(
  'purge-expired-deleted-orders',
  '0 3 * * *',
  $$SELECT public.purge_expired_deleted_orders();$$
);
