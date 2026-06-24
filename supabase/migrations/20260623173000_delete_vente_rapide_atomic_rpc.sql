-- =========================================================================
-- Migration : 20260623173000_delete_vente_rapide_atomic_rpc
-- Objectif  : Supprimer proprement une vente directe (vitrine), restaurer le stock et recalculer les points fidélité.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.delete_vente_rapide_atomic(
  p_transaction_id  UUID,
  p_organization_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id       UUID := auth.uid();
  v_actor_role     TEXT;
  v_actor_org_id   UUID;
  v_item           RECORD;
  v_customer_id    UUID;
  v_amount         NUMERIC;
  v_points         INTEGER;
BEGIN
  -- 1. Vérifier authentification
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '28000';
  END IF;

  -- 2. Vérifier le rôle de l'utilisateur
  SELECT role_slug, organization_id INTO v_actor_role, v_actor_org_id
  FROM public.profiles WHERE id = v_actor_id AND is_active = true;

  IF v_actor_org_id IS NULL OR v_actor_org_id <> p_organization_id THEN
    RAISE EXCEPTION 'Non autorisé ou mauvaise organisation' USING ERRCODE = '42501';
  END IF;

  IF v_actor_role NOT IN ('gerant', 'super_admin') THEN
    RAISE EXCEPTION 'Rôle non autorisé pour supprimer une vente' USING ERRCODE = '42501';
  END IF;

  -- 3. Vérifier que la transaction existe, appartient à l'organisation, et est bien une vente rapide (order_id IS NULL et label_type = 'VENTE_DIRECTE')
  SELECT customer_id, amount INTO v_customer_id, v_amount
  FROM public.transactions
  WHERE id = p_transaction_id 
    AND organization_id = p_organization_id
    AND order_id IS NULL
    AND label_type = 'VENTE_DIRECTE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vente rapide introuvable ou non supprimable' USING ERRCODE = '44000';
  END IF;

  -- 4. Soustraire les points de fidélité si un client y était rattaché
  IF v_customer_id IS NOT NULL AND v_amount > 0 THEN
    v_points := FLOOR(v_amount / 1000);
    IF v_points > 0 THEN
      UPDATE public.customers
      SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - v_points),
          lifetime_points = GREATEST(0, COALESCE(lifetime_points, 0) - v_points)
      WHERE id = v_customer_id AND organization_id = p_organization_id;
    END IF;
  END IF;

  -- 5. Restaurer le stock des produits vendus (s'ils ont track_stock = true)
  FOR v_item IN 
    SELECT product_id, quantity 
    FROM public.transaction_items 
    WHERE transaction_id = p_transaction_id
  -- (Loop over all products in items)
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      -- Vérifier si le produit a track_stock = true
      IF EXISTS (
        SELECT 1 FROM public.products 
        WHERE id = v_item.product_id AND track_stock = true AND organization_id = p_organization_id
      ) THEN
        UPDATE public.products
        SET current_stock = COALESCE(current_stock, 0) + v_item.quantity
        WHERE id = v_item.product_id AND organization_id = p_organization_id;
      END IF;
    END IF;
  END LOOP;

  -- 6. Supprimer les transaction_items
  DELETE FROM public.transaction_items WHERE transaction_id = p_transaction_id;

  -- 7. Supprimer la transaction
  DELETE FROM public.transactions WHERE id = p_transaction_id;
END;
$$;

-- Rendre exécutable
REVOKE EXECUTE ON FUNCTION public.delete_vente_rapide_atomic(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_vente_rapide_atomic(UUID, UUID) TO authenticated;
