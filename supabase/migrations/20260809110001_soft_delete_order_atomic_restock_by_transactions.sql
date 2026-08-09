-- ============================================================
-- Migration : 20260809110001_soft_delete_order_atomic_restock_by_transactions
-- Objectif  : Ne plus conditionner le recrédit de stock au statut mutable
--             'delivered' de la commande (qui peut changer après
--             l'encaissement, ex: updateOrderStatus / finaliserCommandeDejaPayee
--             passent à 'completed'). Le recrédit doit dépendre uniquement du
--             fait que du stock ait réellement été décrémenté, ce que la
--             présence de transaction_items reflète déjà exactement : une
--             commande jamais encaissée n'a aucune ligne dans cette requête,
--             donc aucune double-comptabilisation possible.
-- ============================================================

CREATE OR REPLACE FUNCTION public.soft_delete_order_atomic(
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
  v_actor_id         UUID := auth.uid();
  v_actor_role       TEXT;
  v_actor_org_id     UUID;
  v_actor_name       TEXT;
  v_order            RECORD;
  v_item             RECORD;
  v_stock_adjustment JSONB := '{}'::jsonb;
  v_snapshot         JSONB;
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
    RAISE EXCEPTION 'Rôle non autorisé pour supprimer une commande' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Un commentaire est obligatoire pour supprimer une commande' USING ERRCODE = '22023';
  END IF;

  SELECT id, order_number, status, deleted_at
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable' USING ERRCODE = '44000';
  END IF;

  IF v_order.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cette commande est déjà supprimée' USING ERRCODE = '44000';
  END IF;

  -- Le stock n'est décrémenté qu'à l'encaissement (encaisser_atomic). On recrédite
  -- donc en se basant sur les transaction_items réellement décrémentés pour cette
  -- commande, quel que soit le statut actuel (qui peut avoir évolué depuis) :
  -- une commande jamais encaissée n'a simplement aucune ligne ici.
  FOR v_item IN
    SELECT ti.product_id, SUM(ti.quantity) AS quantity
    FROM public.transaction_items ti
    JOIN public.transactions t ON t.id = ti.transaction_id
    WHERE t.order_id = p_order_id
      AND t.organization_id = p_organization_id
      AND ti.product_id IS NOT NULL
    GROUP BY ti.product_id
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_item.product_id AND track_stock = true AND organization_id = p_organization_id
    ) THEN
      UPDATE public.products
      SET current_stock = COALESCE(current_stock, 0) + v_item.quantity
      WHERE id = v_item.product_id AND organization_id = p_organization_id;

      v_stock_adjustment := v_stock_adjustment || jsonb_build_object(v_item.product_id::text, v_item.quantity);
    END IF;
  END LOOP;

  -- Snapshot complet (commande + lignes) pour l'affichage détaillé dans la page d'audit
  SELECT jsonb_build_object(
    'order', to_jsonb(o.*),
    'items', COALESCE(jsonb_agg(to_jsonb(oi.*)) FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_snapshot
  FROM public.orders o
  LEFT JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.id = p_order_id
  GROUP BY o.id;

  UPDATE public.orders
  SET deleted_at = NOW(), deleted_by = v_actor_id
  WHERE id = p_order_id AND organization_id = p_organization_id;

  INSERT INTO public.order_deletion_audit (
    organization_id, order_id, order_reference, action,
    performed_by, performed_by_name, reason, order_snapshot, stock_adjustment
  ) VALUES (
    p_organization_id, p_order_id, COALESCE(v_order.order_number, p_order_id::text), 'delete',
    v_actor_id, COALESCE(v_actor_name, 'Utilisateur inconnu'), p_reason, v_snapshot, v_stock_adjustment
  );
END;
$$;
