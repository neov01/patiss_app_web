-- ============================================================
-- Migration : 20260517000002_atomic_encaissement_rpc.sql
-- Objectif  : Créer les RPC pour un encaissement atomique
--
-- Problème résolu :
--   Dans l'implémentation précédente, le stock était décrémenté
--   APRÈS l'insertion de la transaction. En cas de concurrence
--   (deux caisses simultanées) ou d'erreur réseau, le stock pouvait
--   aller en négatif ou rester incohérent avec les transactions.
--
--   Cette migration crée 2 RPC :
--   1. decrement_product_stock : décrémente avec vérification et verrou
--   2. encaisser_atomic        : encaissement complet en une transaction
-- ============================================================

-- ── 1. decrement_product_stock ───────────────────────────────
-- Décrémente le stock d'un produit avec SELECT FOR UPDATE
-- pour éviter les conditions de course.
-- Retourne une erreur si le stock est insuffisant.

CREATE OR REPLACE FUNCTION public.decrement_product_stock(
  p_product_id UUID,
  p_qty        INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_track_stock BOOLEAN;
  v_current_stock INTEGER;
BEGIN
  -- Verrou pessimiste sur la ligne produit
  SELECT track_stock, current_stock
  INTO v_track_stock, v_current_stock
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable : %', p_product_id;
  END IF;

  -- Ne décrémenter que si le produit a le suivi de stock activé
  IF v_track_stock THEN
    IF v_current_stock < p_qty THEN
      RAISE EXCEPTION 'Stock insuffisant pour le produit % (disponible: %, demandé: %)',
        p_product_id, v_current_stock, p_qty
        USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.products
    SET current_stock = current_stock - p_qty
    WHERE id = p_product_id;
  END IF;
END;
$$;

-- ── 2. encaisser_atomic ──────────────────────────────────────
-- Encaissement complet en une seule transaction PostgreSQL :
--   a) Insert transaction
--   b) Insert transaction_items
--   c) Décrémentation stocks (avec verrou)
--   d) Mise à jour commande (si applicable)
-- Les points de fidélité restent côté applicatif (plus complexes).

CREATE TYPE public.encaisser_item AS (
  item_id     UUID,
  product_id  UUID,
  name        TEXT,
  quantity    INTEGER,
  unit_price  NUMERIC
);

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
AS $$
DECLARE
  v_transaction_id UUID;
  v_item           public.encaisser_item;
BEGIN
  -- a. Insérer la transaction
  INSERT INTO public.transactions (
    id, organization_id, order_id, customer_id,
    client_name, amount, payment_method, payment_details,
    label_type, created_by
  ) VALUES (
    p_transaction_id, p_organization_id, p_order_id, p_customer_id,
    p_client_name, p_amount, p_payment_method, p_payment_details,
    p_label_type, p_created_by
  )
  RETURNING id INTO v_transaction_id;

  -- b. Insérer les lignes de transaction
  FOREACH v_item IN ARRAY p_items LOOP
    INSERT INTO public.transaction_items (
      id, transaction_id, product_id, name, quantity, unit_price
    ) VALUES (
      COALESCE(v_item.item_id, gen_random_uuid()),
      v_transaction_id,
      v_item.product_id,
      v_item.name,
      v_item.quantity,
      v_item.unit_price
    );
  END LOOP;

  -- c. Décrémenter les stocks (avec verrou, dans la même transaction)
  FOREACH v_item IN ARRAY p_items LOOP
    IF v_item.product_id IS NOT NULL THEN
      PERFORM public.decrement_product_stock(v_item.product_id, v_item.quantity);
    END IF;
  END LOOP;

  -- d. Mettre à jour la commande si elle existe
  IF p_order_id IS NOT NULL THEN
    UPDATE public.orders
    SET status = 'completed', payment_status = 'SOLDEE', balance = 0
    WHERE id = p_order_id;
  END IF;

  RETURN v_transaction_id;
END;
$$;
