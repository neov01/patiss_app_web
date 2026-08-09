-- ============================================================
-- Migration : 20260809110006_restore_and_purge_polish
-- Objectif  : Deux corrections mineures issues de la revue finale :
--             1) restore_order_atomic ne doit jamais faire passer un stock
--                sous zéro lors de l'inversion exacte du recrédit.
--             2) La purge définitive doit aussi expurger les données
--                personnelles (nom/contact client) conservées dans le
--                snapshot des événements de suppression de la commande
--                purgée, pour ne pas les conserver indéfiniment au-delà
--                de la fenêtre de rétention de 30 jours annoncée.
-- ============================================================

CREATE OR REPLACE FUNCTION public.restore_order_atomic(
  p_order_id        UUID,
  p_organization_id UUID,
  p_reason          TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id      UUID := auth.uid();
  v_actor_role    TEXT;
  v_actor_org_id  UUID;
  v_actor_name    TEXT;
  v_order         RECORD;
  v_last_delete   RECORD;
  v_adjustment    RECORD;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '28000';
  END IF;

  SELECT role_slug, organization_id, full_name INTO v_actor_role, v_actor_org_id, v_actor_name
  FROM public.profiles WHERE id = v_actor_id AND is_active = true;

  IF v_actor_org_id IS NULL OR v_actor_org_id <> p_organization_id THEN
    RAISE EXCEPTION 'Non autorisé ou mauvaise organisation' USING ERRCODE = '42501';
  END IF;

  IF v_actor_role NOT IN ('vendeur', 'gerant', 'super_admin') THEN
    RAISE EXCEPTION 'Rôle non autorisé pour restaurer une commande' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Un commentaire est obligatoire pour restaurer une commande' USING ERRCODE = '22023';
  END IF;

  SELECT id, deleted_at INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette commande a été définitivement supprimée, restauration impossible' USING ERRCODE = '44000';
  END IF;

  IF v_order.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Cette commande n''est pas supprimée' USING ERRCODE = '44000';
  END IF;

  IF v_order.deleted_at < NOW() - INTERVAL '30 days' THEN
    RAISE EXCEPTION 'Le délai de restauration de 30 jours est dépassé, la purge définitive est imminente' USING ERRCODE = '44000';
  END IF;

  SELECT stock_adjustment, order_reference INTO v_last_delete
  FROM public.order_deletion_audit
  WHERE order_id = p_order_id AND organization_id = p_organization_id AND action = 'delete'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_delete.stock_adjustment IS NOT NULL THEN
    FOR v_adjustment IN
      SELECT key AS product_id, value::text::numeric AS quantity
      FROM jsonb_each(v_last_delete.stock_adjustment)
    LOOP
      UPDATE public.products
      SET current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_adjustment.quantity)
      WHERE id = v_adjustment.product_id::uuid AND organization_id = p_organization_id;
    END LOOP;
  END IF;

  UPDATE public.orders
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_order_id AND organization_id = p_organization_id;

  INSERT INTO public.order_deletion_audit (
    organization_id, order_id, order_reference, action,
    performed_by, performed_by_name, reason
  ) VALUES (
    p_organization_id, p_order_id, COALESCE(v_last_delete.order_reference, p_order_id::text), 'restore',
    v_actor_id, COALESCE(v_actor_name, 'Utilisateur inconnu'), p_reason
  );
END;
$$;

-- ────────────────────────────────────────────────────────────

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

      -- Expurge les données personnelles (nom/contact client) conservées dans le
      -- snapshot des événements de suppression de cette commande : la commande
      -- disparaît définitivement, son historique d'audit ne doit pas conserver
      -- ces informations au-delà de la fenêtre de rétention annoncée.
      UPDATE public.order_deletion_audit
      SET order_snapshot = jsonb_set(
            jsonb_set(
              order_snapshot,
              '{order,customer_name}', '"[purgé]"'::jsonb, false
            ),
            '{order,customer_contact}', '"[purgé]"'::jsonb, false
          )
      WHERE order_id = v_order.id
        AND organization_id = v_order.organization_id
        AND order_snapshot IS NOT NULL
        AND order_snapshot ? 'order';

      DELETE FROM public.orders WHERE id = v_order.id AND organization_id = v_order.organization_id;

      v_purged_count := v_purged_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error processing order %: %', v_order.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_purged_count;
END;
$$;
