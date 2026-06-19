-- ============================================================
-- Migration : 20260619130000_fix_rpc_for_multi_payments
-- Objectif  : Harmoniser create_order_atomic et encaisser_atomic
--             avec la nouvelle table order_payments et son
--             CHECK constraint sur payment_method.
--             Normaliser payment_status vers le vocabulaire v2
--             (paid / partial / unpaid / deposit_paid / overpaid).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Helper de normalisation des modes de paiement
--    Appelé par les RPC et le trigger de synchro pour garantir
--    la cohérence avec le CHECK de order_payments.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_payment_method(raw TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(raw, '')))
    WHEN 'espèces'       THEN 'cash'
    WHEN 'especes'        THEN 'cash'
    WHEN 'cash'           THEN 'cash'
    WHEN 'orange money'   THEN 'orange_money'
    WHEN 'orange_money'   THEN 'orange_money'
    WHEN 'wave'           THEN 'wave'
    WHEN 'mtn momo'       THEN 'mobile_money'
    WHEN 'mobile money'   THEN 'mobile_money'
    WHEN 'mobile_money'   THEN 'mobile_money'
    WHEN 'moov money'     THEN 'moov_money'
    WHEN 'moov_money'     THEN 'moov_money'
    WHEN 'virement'       THEN 'bank_transfer'
    WHEN 'virement bancaire' THEN 'bank_transfer'
    WHEN 'bank_transfer'  THEN 'bank_transfer'
    ELSE 'other'
  END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. Réécrire create_order_atomic
-- ────────────────────────────────────────────────────────────
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
  v_actor_id       UUID := COALESCE(auth.uid(), NULLIF(p_order->>'created_by', '')::uuid);
  v_org_id         UUID;
  v_role           TEXT;
  v_order_id       UUID := COALESCE(NULLIF(p_order->>'id', '')::uuid, gen_random_uuid());
  v_customer_id    UUID := NULLIF(p_order->>'customer_id', '')::uuid;
  v_customer_name  TEXT := COALESCE(NULLIF(trim(p_order->>'customer_name'), ''), 'Client Vitrine');
  v_customer_contact TEXT := NULLIF(trim(COALESCE(p_order->>'customer_contact', '')), '');
  v_normalized_phone TEXT;
  v_total_amount   NUMERIC := COALESCE((p_order->>'total_amount')::numeric, 0);
  v_deposit_amount NUMERIC := COALESCE((p_order->>'deposit_amount')::numeric, 0);
  v_total_paid     NUMERIC := 0;
  v_acompte_paid   NUMERIC := 0;
  v_balance        NUMERIC := 0;
  v_payment_status TEXT := 'unpaid';
  v_payment        JSONB;
  v_item           JSONB;
  v_item_product_id UUID;
  v_item_name      TEXT;
  v_product_name   TEXT;
  v_order          public.orders%ROWTYPE;
  v_points         INTEGER;
  v_norm_method    TEXT;
BEGIN
  -- ── Auth ──
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

  -- ── Session de caisse ouverte ──
  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_sessions
    WHERE organization_id = v_org_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'La caisse est fermée. Ouvrez une session de vente avant cette opération.'
      USING ERRCODE = '42501';
  END IF;

  -- ── Validations d'entrée ──
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

  -- ── Résolution client CRM ──
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
    v_normalized_phone := regexp_replace(v_customer_contact, '\\D', '', 'g');
    IF v_normalized_phone LIKE '225%' AND length(v_normalized_phone) >= 11 THEN
      v_normalized_phone := substring(v_normalized_phone from 4);
    END IF;

    SELECT id
    INTO v_customer_id
    FROM public.customers
    WHERE organization_id = v_org_id
      AND phone IN (
        regexp_replace(v_customer_contact, '\\D', '', 'g'),
        v_normalized_phone
      )
    LIMIT 1;

    IF v_customer_id IS NULL THEN
      INSERT INTO public.customers (organization_id, name, phone)
      VALUES (v_org_id, v_customer_name, v_normalized_phone)
      RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  -- ── Calcul des paiements ──
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

  -- ── Statut de paiement normalisé (vocabulaire v2) ──
  v_payment_status := CASE
    WHEN v_total_paid >= v_total_amount THEN 'paid'
    WHEN v_total_paid > 0 THEN 'partial'
    ELSE 'unpaid'
  END;

  -- ── INSERT commande ──
  INSERT INTO public.orders (
    id, organization_id, order_number, customer_id, customer_name,
    customer_contact, pickup_date, total_amount, deposit_amount,
    custom_image_url, priority, reception_type, delivery_address,
    order_channel, subtotal, balance, paid_amount, customization_notes, created_by,
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
    v_total_paid,
    NULLIF(p_order->>'customization_notes', ''),
    v_actor_id,
    COALESCE(NULLIF(p_order->>'status', ''), 'confirmed'),
    v_payment_status
  )
  RETURNING * INTO v_order;

  -- ── INSERT order_items ──
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

  -- ── INSERT transactions (avec payment_method normalisé) ──
  IF jsonb_array_length(p_payments) > 0 THEN
    FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
      IF COALESCE((v_payment->>'amount')::numeric, 0) > 0 THEN
        v_norm_method := public.normalize_payment_method(
          COALESCE(NULLIF(v_payment->>'payment_method', ''), 'cash')
        );
        INSERT INTO public.transactions (
          organization_id, order_id, customer_id, client_name,
          amount, payment_method, payment_details, label_type, created_by
        ) VALUES (
          v_org_id,
          v_order_id,
          v_customer_id,
          v_customer_name,
          (v_payment->>'amount')::numeric,
          v_norm_method,
          jsonb_build_object(v_norm_method, (v_payment->>'amount')::numeric),
          COALESCE(NULLIF(v_payment->>'label_type', ''), 'ACOMPTE'),
          v_actor_id
        );
      END IF;
    END LOOP;
  ELSIF v_total_paid > 0 THEN
    v_norm_method := public.normalize_payment_method(
      COALESCE(NULLIF(p_order->>'deposit_payment_method', ''), 'cash')
    );
    INSERT INTO public.transactions (
      organization_id, order_id, customer_id, client_name,
      amount, payment_method, payment_details, label_type, created_by
    ) VALUES (
      v_org_id,
      v_order_id,
      v_customer_id,
      v_customer_name,
      v_total_paid,
      v_norm_method,
      jsonb_build_object(v_norm_method, v_total_paid),
      CASE WHEN v_total_paid >= v_total_amount THEN 'SOLDE' ELSE 'ACOMPTE' END,
      v_actor_id
    );
  END IF;

  -- ── Fidélité ──
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

  -- ── Métriques de création ──
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

-- ────────────────────────────────────────────────────────────
-- 3. Réécrire encaisser_atomic avec payment_status normalisé
-- ────────────────────────────────────────────────────────────
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
      AND organization_id = p_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Commande introuvable pendant la clôture'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN v_transaction_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. Renforcer le trigger de synchro transactions → order_payments
--    avec normalisation du payment_method
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_transaction_to_order_payment_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_payment_id UUID;
  v_norm_method TEXT;
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.amount > 0 AND NEW.order_payment_id IS NULL THEN
    -- Normaliser le mode de paiement avant toute insertion dans order_payments
    v_norm_method := public.normalize_payment_method(NEW.payment_method);

    -- Vérifier si le order_payment existe déjà
    SELECT id INTO v_order_payment_id
    FROM public.order_payments
    WHERE order_id = NEW.order_id
      AND amount = NEW.amount
      AND payment_method = v_norm_method
      AND payment_date = NEW.created_at;

    IF v_order_payment_id IS NULL THEN
      INSERT INTO public.order_payments (
        organization_id,
        order_id,
        amount,
        payment_method,
        payment_date,
        note,
        created_by,
        created_at
      ) VALUES (
        NEW.organization_id,
        NEW.order_id,
        NEW.amount,
        v_norm_method,
        NEW.created_at,
        'Créé via transaction de caisse',
        NEW.created_by,
        NEW.created_at
      )
      RETURNING id INTO v_order_payment_id;
    END IF;
    
    NEW.order_payment_id := v_order_payment_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. Normaliser les transactions existantes qui ont encore
--    des payment_method non normalisés
-- ────────────────────────────────────────────────────────────
UPDATE public.transactions
SET payment_method = public.normalize_payment_method(payment_method)
WHERE payment_method NOT IN ('cash', 'orange_money', 'wave', 'mobile_money', 'moov_money', 'bank_transfer', 'other');

-- ────────────────────────────────────────────────────────────
-- 6. Permissions
-- ────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.encaisser_atomic(
  UUID, UUID, UUID, UUID, TEXT, NUMERIC, TEXT, JSONB, TEXT, UUID, public.encaisser_item[]
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.encaisser_atomic(
  UUID, UUID, UUID, UUID, TEXT, NUMERIC, TEXT, JSONB, TEXT, UUID, public.encaisser_item[]
) TO authenticated;
