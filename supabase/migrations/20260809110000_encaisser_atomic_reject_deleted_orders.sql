-- ============================================================
-- Migration : 20260809110000_encaisser_atomic_reject_deleted_orders
-- Objectif  : Empêcher l'encaissement d'une commande déjà supprimée
--             logiquement (deleted_at IS NOT NULL) — sans ce garde-fou,
--             une commande supprimée peut être encaissée via une file de
--             synchronisation hors-ligne rejouée après coup, décrémentant
--             du stock de façon irréversible pour une commande invisible.
-- ============================================================

CREATE OR REPLACE FUNCTION public.encaisser_atomic(
  p_transaction_id  UUID,
  p_organization_id UUID,
  p_order_id        UUID,
  p_customer_id     UUID,
  p_client_name     TEXT,
  p_amount          NUMERIC,
  p_payment_method  TEXT,
  p_payment_details JSONB,
  p_label_type      TEXT,
  p_created_by      UUID,
  p_items           public.encaisser_item[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id       UUID := COALESCE(auth.uid(), p_created_by);
  v_actor_org_id   UUID;
  v_actor_role     TEXT;
  v_transaction_id UUID;
  v_item           public.encaisser_item;
  v_norm_method    TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié'
      USING ERRCODE = '28000';
  END IF;

  IF p_created_by IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Créateur invalide pour cet encaissement'
      USING ERRCODE = '42501';
  END IF;

  SELECT organization_id, role_slug
  INTO v_actor_org_id, v_actor_role
  FROM public.profiles
  WHERE id = v_actor_id
    AND is_active = true;

  IF v_actor_org_id IS NULL THEN
    RAISE EXCEPTION 'Profil actif introuvable'
      USING ERRCODE = '42501';
  END IF;

  IF v_actor_role NOT IN ('gerant', 'super_admin', 'vendeur') THEN
    RAISE EXCEPTION 'Rôle non autorisé pour encaisser'
      USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS DISTINCT FROM v_actor_org_id THEN
    RAISE EXCEPTION 'Organisation invalide pour cet encaissement'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Montant invalide'
      USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR array_length(p_items, 1) IS NULL THEN
    RAISE EXCEPTION 'Aucune ligne à encaisser'
      USING ERRCODE = '22023';
  END IF;

  IF p_order_id IS NOT NULL THEN
    PERFORM 1
    FROM public.orders
    WHERE id = p_order_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Commande introuvable, hors organisation ou supprimée'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers
    WHERE id = p_customer_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Client introuvable ou hors organisation'
      USING ERRCODE = '42501';
  END IF;

  FOREACH v_item IN ARRAY p_items LOOP
    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour %', COALESCE(v_item.name, 'ligne sans nom')
        USING ERRCODE = '22023';
    END IF;

    IF v_item.unit_price IS NULL OR v_item.unit_price < 0 THEN
      RAISE EXCEPTION 'Prix invalide pour %', COALESCE(v_item.name, 'ligne sans nom')
        USING ERRCODE = '22023';
    END IF;

    IF v_item.product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.products
      WHERE id = v_item.product_id
        AND organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Produit introuvable ou hors organisation : %', v_item.product_id
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- Normaliser le mode de paiement
  v_norm_method := public.normalize_payment_method(p_payment_method);

  INSERT INTO public.transactions (
    id, organization_id, order_id, customer_id,
    client_name, amount, payment_method, payment_details,
    label_type, created_by
  ) VALUES (
    p_transaction_id, p_organization_id, p_order_id, p_customer_id,
    COALESCE(NULLIF(trim(p_client_name), ''), 'Vente vitrine'),
    p_amount, v_norm_method, COALESCE(p_payment_details, '{}'::jsonb),
    p_label_type, p_created_by
  )
  RETURNING id INTO v_transaction_id;

  FOREACH v_item IN ARRAY p_items LOOP
    INSERT INTO public.transaction_items (
      id, transaction_id, product_id, name, quantity, unit_price
    ) VALUES (
      COALESCE(v_item.item_id, gen_random_uuid()),
      v_transaction_id,
      v_item.product_id,
      COALESCE(NULLIF(trim(v_item.name), ''), 'Article'),
      v_item.quantity,
      v_item.unit_price
    );
  END LOOP;

  FOREACH v_item IN ARRAY p_items LOOP
    IF v_item.product_id IS NOT NULL THEN
      PERFORM public.decrement_product_stock(v_item.product_id, p_organization_id, v_item.quantity);
    END IF;
  END LOOP;

  IF p_order_id IS NOT NULL THEN
    UPDATE public.orders
    SET status = 'delivered',
        payment_status = 'paid',
        balance = 0
    WHERE id = p_order_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Commande introuvable ou supprimée pendant la clôture'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN v_transaction_id;
END;
$$;
