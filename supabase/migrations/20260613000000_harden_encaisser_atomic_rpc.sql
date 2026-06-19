-- ============================================================
-- Migration : 20260613000000_harden_encaisser_atomic_rpc.sql
-- Objectif  : Durcir l'encaissement atomique multi-tenant
--
-- Ne modifie pas l'historique des migrations : remplace les RPC publics
-- existants avec des gardes internes sur auth.uid(), rôle et organisation.
-- ============================================================

DO $$
BEGIN
  CREATE TYPE public.encaisser_item AS (
    item_id     UUID,
    product_id  UUID,
    name        TEXT,
    quantity    INTEGER,
    unit_price  NUMERIC
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_product_stock(
  p_product_id       UUID,
  p_organization_id  UUID,
  p_qty              INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_track_stock BOOLEAN;
  v_current_stock INTEGER;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantité invalide pour le produit %', p_product_id
      USING ERRCODE = '22023';
  END IF;

  SELECT track_stock, current_stock
  INTO v_track_stock, v_current_stock
  FROM public.products
  WHERE id = p_product_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable ou hors organisation : %', p_product_id
      USING ERRCODE = '42501';
  END IF;

  IF v_track_stock THEN
    IF v_current_stock < p_qty THEN
      RAISE EXCEPTION 'Stock insuffisant pour le produit % (disponible: %, demandé: %)',
        p_product_id, v_current_stock, p_qty
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.products
    SET current_stock = current_stock - p_qty
    WHERE id = p_product_id
      AND organization_id = p_organization_id;
  END IF;
END;
$$;

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
  v_actor_id       UUID := auth.uid();
  v_actor_org_id   UUID;
  v_actor_role     TEXT;
  v_transaction_id UUID;
  v_item           public.encaisser_item;
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
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Commande introuvable ou hors organisation'
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

  INSERT INTO public.transactions (
    id, organization_id, order_id, customer_id,
    client_name, amount, payment_method, payment_details,
    label_type, created_by
  ) VALUES (
    p_transaction_id, p_organization_id, p_order_id, p_customer_id,
    COALESCE(NULLIF(trim(p_client_name), ''), 'Vente vitrine'),
    p_amount, p_payment_method, COALESCE(p_payment_details, '{}'::jsonb),
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
    SET status = 'completed',
        payment_status = 'SOLDEE',
        balance = 0
    WHERE id = p_order_id
      AND organization_id = p_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Commande introuvable pendant la clôture'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decrement_product_stock(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_product_stock(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encaisser_atomic(
  UUID, UUID, UUID, UUID, TEXT, NUMERIC, TEXT, JSONB, TEXT, UUID, public.encaisser_item[]
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.encaisser_atomic(
  UUID, UUID, UUID, UUID, TEXT, NUMERIC, TEXT, JSONB, TEXT, UUID, public.encaisser_item[]
) TO authenticated;
