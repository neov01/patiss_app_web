-- ============================================================
-- Migration : 20260809100002_restore_order_atomic_rpc
-- Objectif  : Restaurer une commande supprimée logiquement, en inversant
--             exactement le recrédit de stock effectué à la suppression.
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
      SET current_stock = COALESCE(current_stock, 0) - v_adjustment.quantity
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

REVOKE EXECUTE ON FUNCTION public.restore_order_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_atomic(UUID, UUID, TEXT) TO authenticated;
