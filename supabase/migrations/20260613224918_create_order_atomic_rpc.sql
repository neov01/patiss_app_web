-- ============================================================
-- Migration : create_order_atomic_rpc
-- Objectif  : Créer les commandes live de façon atomique
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order    JSONB,
  p_items    JSONB,
  p_payments JSONB DEFAULT '[]'::jsonb,
  p_metrics  JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID;
  v_role TEXT;
  v_order_id UUID := COALESCE(NULLIF(p_order->>'id', '')::uuid, gen_random_uuid());
  v_customer_id UUID := NULLIF(p_order->>'customer_id', '')::uuid;
  v_customer_name TEXT := COALESCE(NULLIF(trim(p_order->>'customer_name'), ''), 'Client Vitrine');
  v_customer_contact TEXT := NULLIF(trim(COALESCE(p_order->>'customer_contact', '')), '');
  v_normalized_phone TEXT;
  v_total_amount NUMERIC := COALESCE((p_order->>'total_amount')::numeric, 0);
  v_deposit_amount NUMERIC := COALESCE((p_order->>'deposit_amount')::numeric, 0);
  v_total_paid NUMERIC := 0;
  v_acompte_paid NUMERIC := 0;
  v_balance NUMERIC := 0;
  v_payment_status TEXT := 'EN_ATTENTE';
  v_payment JSONB;
  v_item JSONB;
  v_item_product_id UUID;
  v_item_name TEXT;
  v_product_name TEXT;
  v_order public.orders%ROWTYPE;
  v_points INTEGER;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié'
      USING ERRCODE = '28000';
  END IF;

  SELECT organization_id, role_slug
  INTO v_org_id, v_role
  FROM public.profiles
  WHERE id = v_actor_id
    AND is_active = true;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Profil actif introuvable'
      USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('gerant', 'super_admin', 'vendeur') THEN
    RAISE EXCEPTION 'Rôle non autorisé pour créer une commande'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_sessions
    WHERE organization_id = v_org_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'La caisse est fermée. Ouvrez une session de vente avant cette opération.'
      USING ERRCODE = '42501';
  END IF;

  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'Commande invalide'
      USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La commande doit contenir au moins une ligne'
      USING ERRCODE = '22023';
  END IF;

  IF v_total_amount < 0 OR v_deposit_amount < 0 OR v_deposit_amount > v_total_amount THEN
    RAISE EXCEPTION 'Montants de commande invalides'
      USING ERRCODE = '22023';
  END IF;

  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers
    WHERE id = v_customer_id
      AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Client introuvable ou hors organisation'
      USING ERRCODE = '42501';
  END IF;

  IF v_customer_id IS NULL AND v_customer_contact IS NOT NULL AND v_customer_name <> 'Client Vitrine' THEN
    v_normalized_phone := regexp_replace(v_customer_contact, '\D', '', 'g');
    IF v_normalized_phone LIKE '225%' AND length(v_normalized_phone) >= 11 THEN
      v_normalized_phone := substring(v_normalized_phone from 4);
    END IF;

    SELECT id
    INTO v_customer_id
    FROM public.customers
    WHERE organization_id = v_org_id
      AND phone IN (
        regexp_replace(v_customer_contact, '\D', '', 'g'),
        v_normalized_phone
      )
    LIMIT 1;

    IF v_customer_id IS NULL THEN
      INSERT INTO public.customers (organization_id, name, phone)
      VALUES (v_org_id, v_customer_name, v_normalized_phone)
      RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    p_payments := '[]'::jsonb;
  END IF;

  IF jsonb_array_length(p_payments) > 0 THEN
    FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
      IF COALESCE((v_payment->>'amount')::numeric, 0) < 0 THEN
        RAISE EXCEPTION 'Montant de paiement invalide'
          USING ERRCODE = '22023';
      END IF;

      v_total_paid := v_total_paid + COALESCE((v_payment->>'amount')::numeric, 0);
      IF COALESCE(v_payment->>'label_type', 'ACOMPTE') = 'ACOMPTE' THEN
        v_acompte_paid := v_acompte_paid + COALESCE((v_payment->>'amount')::numeric, 0);
      END IF;
    END LOOP;
  ELSE
    v_total_paid := v_deposit_amount;
    v_acompte_paid := CASE WHEN v_deposit_amount >= v_total_amount THEN 0 ELSE v_deposit_amount END;
  END IF;

  IF v_total_paid > v_total_amount THEN
    RAISE EXCEPTION 'Le total payé ne peut pas dépasser le montant de la commande'
      USING ERRCODE = '22023';
  END IF;

  v_balance := GREATEST(0, v_total_amount - v_total_paid);
  v_deposit_amount := v_acompte_paid;
  v_payment_status := CASE
    WHEN v_total_paid >= v_total_amount THEN 'SOLDEE'
    WHEN v_total_paid > 0 THEN 'PARTIEL'
    ELSE 'EN_ATTENTE'
  END;

  INSERT INTO public.orders (
    id, organization_id, order_number, customer_id, customer_name,
    customer_contact, pickup_date, total_amount, deposit_amount,
    custom_image_url, priority, reception_type, delivery_address,
    order_channel, subtotal, balance, customization_notes, created_by,
    status, payment_status
  ) VALUES (
    v_order_id,
    v_org_id,
    NULLIF(p_order->>'order_number', ''),
    v_customer_id,
    v_customer_name,
    v_customer_contact,
    (p_order->>'pickup_date')::timestamptz,
    v_total_amount,
    v_deposit_amount,
    NULLIF(p_order->>'custom_image_url', ''),
    COALESCE(NULLIF(p_order->>'priority', ''), 'normale'),
    COALESCE(NULLIF(p_order->>'reception_type', ''), 'retrait'),
    NULLIF(p_order->>'delivery_address', ''),
    NULLIF(p_order->>'order_channel', ''),
    COALESCE((p_order->>'subtotal')::numeric, v_total_amount),
    v_balance,
    NULLIF(p_order->>'customization_notes', ''),
    v_actor_id,
    COALESCE(NULLIF(p_order->>'status', ''), 'pending'),
    v_payment_status
  )
  RETURNING * INTO v_order;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE((v_item->>'quantity')::integer, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantité de ligne invalide'
        USING ERRCODE = '22023';
    END IF;

    IF COALESCE((v_item->>'unit_price')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Prix de ligne invalide'
        USING ERRCODE = '22023';
    END IF;

    v_item_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_product_name := NULL;

    IF v_item_product_id IS NOT NULL THEN
      SELECT name
      INTO v_product_name
      FROM public.products
      WHERE id = v_item_product_id
        AND organization_id = v_org_id;

      IF v_product_name IS NULL THEN
        RAISE EXCEPTION 'Produit introuvable ou hors organisation : %', v_item_product_id
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_item_name := COALESCE(NULLIF(trim(v_item->>'name'), ''), v_product_name, 'Article');

    INSERT INTO public.order_items (
      id, order_id, product_id, name, quantity, unit_price, from_inventory
    ) VALUES (
      COALESCE(NULLIF(v_item->>'id', '')::uuid, gen_random_uuid()),
      v_order_id,
      v_item_product_id,
      v_item_name,
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'from_inventory')::boolean, false)
    );
  END LOOP;

  IF jsonb_array_length(p_payments) > 0 THEN
    FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
      IF COALESCE((v_payment->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO public.transactions (
          organization_id, order_id, customer_id, client_name,
          amount, payment_method, payment_details, label_type, created_by
        ) VALUES (
          v_org_id,
          v_order_id,
          v_customer_id,
          v_customer_name,
          (v_payment->>'amount')::numeric,
          COALESCE(NULLIF(v_payment->>'payment_method', ''), 'Espèces'),
          jsonb_build_object(COALESCE(NULLIF(v_payment->>'payment_method', ''), 'Espèces'), (v_payment->>'amount')::numeric),
          COALESCE(NULLIF(v_payment->>'label_type', ''), 'ACOMPTE'),
          v_actor_id
        );
      END IF;
    END LOOP;
  ELSIF v_total_paid > 0 THEN
    INSERT INTO public.transactions (
      organization_id, order_id, customer_id, client_name,
      amount, payment_method, payment_details, label_type, created_by
    ) VALUES (
      v_org_id,
      v_order_id,
      v_customer_id,
      v_customer_name,
      v_total_paid,
      COALESCE(NULLIF(p_order->>'deposit_payment_method', ''), 'Espèces'),
      jsonb_build_object(COALESCE(NULLIF(p_order->>'deposit_payment_method', ''), 'Espèces'), v_total_paid),
      CASE WHEN v_total_paid >= v_total_amount THEN 'SOLDE' ELSE 'ACOMPTE' END,
      v_actor_id
    );
  END IF;

  IF v_customer_id IS NOT NULL AND v_total_paid > 0 THEN
    v_points := FLOOR(v_total_paid / 1000);
    IF v_points > 0 THEN
      UPDATE public.customers
      SET loyalty_points = COALESCE(loyalty_points, 0) + v_points,
          lifetime_points = COALESCE(lifetime_points, 0) + v_points
      WHERE id = v_customer_id
        AND organization_id = v_org_id;
    END IF;
  END IF;

  IF p_metrics IS NOT NULL AND jsonb_typeof(p_metrics) = 'object' THEN
    INSERT INTO public.order_creation_metrics (
      organization_id, order_id, created_by,
      started_at, completed_at, duration_seconds
    ) VALUES (
      v_org_id,
      v_order_id,
      v_actor_id,
      (p_metrics->>'started_at')::timestamptz,
      (p_metrics->>'completed_at')::timestamptz,
      (p_metrics->>'duration_seconds')::integer
    );
  END IF;

  RETURN jsonb_build_object('order', to_jsonb(v_order));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB, JSONB) TO authenticated;
