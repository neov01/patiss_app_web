-- ============================================================
-- Migration : 20261117200000_order_number_sequence
-- Cause     : P1 (commandes perdues par collision de order_number)
-- Objectif  : numérotation des commandes ATTRIBUÉE PAR LA BASE, sans
--             trou ni collision, un compteur par pâtisserie et par année.
--             Format : CMD-<CODE>-<ANNEE>-<000001>  (ex. CMD-BAB-2026-000841)
--
-- Rétrocompatible :
--   * ajout d'une colonne nullable organizations.order_code ;
--   * ajout d'une table de compteurs et d'une fonction ;
--   * la contrainte UNIQUE(orders.order_number) et les anciens numéros
--     CMD-2026-xxxx ne sont PAS modifiés.
-- Migration inverse : supabase/rollbacks/20261117200000_order_number_sequence.down.sql
--
-- Sans trou : le compteur est incrémenté dans la transaction de création
-- de la commande ; si la transaction échoue, l'incrément est annulé.
-- (Le verrou de ligne sérialise les créations d'une même pâtisserie, durée
-- de l'ordre de la milliseconde.)
-- ============================================================

-- 1. Code court de la pâtisserie (nullable, rétrocompatible)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS order_code TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_order_code_format'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_order_code_format
      CHECK (order_code IS NULL OR order_code ~ '^[A-Z0-9]{2,6}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_order_code_key
  ON public.organizations (order_code)
  WHERE order_code IS NOT NULL;

-- Valeurs initiales : 3 premières lettres/chiffres du nom (suffixe numérique
-- en cas de doublon). Modifiable ensuite : UPDATE organizations SET order_code='BAB' WHERE id=...
-- (ne change que les numéros FUTURS).
DO $$
DECLARE
  r    RECORD;
  base TEXT;
  cand TEXT;
  i    INT;
BEGIN
  FOR r IN
    SELECT id, name FROM public.organizations
    WHERE order_code IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    base := upper(left(regexp_replace(coalesce(r.name, ''), '[^A-Za-z0-9]', '', 'g'), 3));
    IF length(base) < 2 THEN
      base := 'ORG';
    END IF;
    cand := base;
    i := 1;
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE order_code = cand) LOOP
      i := i + 1;
      cand := base || i::text;
    END LOOP;
    UPDATE public.organizations SET order_code = cand WHERE id = r.id;
  END LOOP;
END $$;

-- 2. Compteurs (accès uniquement via fonctions SECURITY DEFINER)
CREATE TABLE IF NOT EXISTS public.order_number_counters (
  organization_id UUID    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  last_value      INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (organization_id, year)
);

ALTER TABLE public.order_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_number_counters FROM PUBLIC, anon, authenticated;

-- 3. Attribution du prochain numéro (verrou de ligne, annulé avec la transaction)
CREATE OR REPLACE FUNCTION public.next_order_number(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year  INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'UTC'))::integer;
  v_code  TEXT;
  v_value INTEGER;
BEGIN
  SELECT NULLIF(upper(trim(order_code)), '')
  INTO v_code
  FROM public.organizations
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organisation introuvable pour la numérotation'
      USING ERRCODE = '42501';
  END IF;

  -- Repli déterministe si aucun code n'est défini (nouvelle pâtisserie)
  IF v_code IS NULL THEN
    v_code := upper(substr(replace(p_organization_id::text, '-', ''), 1, 6));
  END IF;

  INSERT INTO public.order_number_counters AS c (organization_id, year, last_value)
  VALUES (p_organization_id, v_year, 1)
  ON CONFLICT (organization_id, year)
  DO UPDATE SET last_value = c.last_value + 1
  RETURNING c.last_value INTO v_value;

  RETURN 'CMD-' || v_code || '-' || v_year::text || '-' ||
         CASE WHEN v_value < 1000000 THEN lpad(v_value::text, 6, '0') ELSE v_value::text END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_order_number(UUID) FROM PUBLIC, anon, authenticated;

-- 4. create_order_atomic : numéro attribué par la base + idempotence sur l'id
--    (corps identique à la production du 2026-11-17, aux 3 modifications près)
CREATE OR REPLACE FUNCTION public.create_order_atomic(p_order jsonb, p_items jsonb, p_payments jsonb DEFAULT '[]'::jsonb, p_metrics jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_order_number   TEXT;
  v_existing       public.orders%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '28000';
  END IF;

  SELECT organization_id, role_slug INTO v_org_id, v_role
  FROM public.profiles WHERE id = v_actor_id AND is_active = true;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Profil actif introuvable' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('gerant', 'super_admin', 'vendeur') THEN
    RAISE EXCEPTION 'Rôle non autorisé pour créer une commande' USING ERRCODE = '42501';
  END IF;

  -- ── Idempotence : un id déjà enregistré renvoie la commande existante ──
  -- (rejeu réseau / hors ligne) sans consommer de nouveau numéro.
  IF NULLIF(p_order->>'id', '') IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.orders WHERE id = v_order_id;
    IF FOUND THEN
      IF v_existing.organization_id IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'Identifiant de commande déjà utilisé'
          USING ERRCODE = '42501';
      END IF;
      RETURN jsonb_build_object('order', to_jsonb(v_existing));
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sales_sessions
    WHERE organization_id = v_org_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'La caisse est fermée. Ouvrez une session de vente avant cette opération.' USING ERRCODE = '42501';
  END IF;

  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'Commande invalide' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La commande doit contenir au moins une ligne' USING ERRCODE = '22023';
  END IF;

  IF v_total_amount < 0 OR v_deposit_amount < 0 OR v_deposit_amount > v_total_amount THEN
    RAISE EXCEPTION 'Montants de commande invalides' USING ERRCODE = '22023';
  END IF;

  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = v_customer_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Client introuvable ou hors organisation' USING ERRCODE = '42501';
  END IF;

  IF v_customer_id IS NULL AND v_customer_contact IS NOT NULL AND v_customer_name <> 'Client Vitrine' THEN
    v_normalized_phone := regexp_replace(v_customer_contact, '\D', '', 'g');
    IF v_normalized_phone LIKE '225%' AND length(v_normalized_phone) >= 11 THEN
      v_normalized_phone := substring(v_normalized_phone from 4);
    END IF;
    SELECT id INTO v_customer_id FROM public.customers
    WHERE organization_id = v_org_id AND phone IN (regexp_replace(v_customer_contact, '\D', '', 'g'), v_normalized_phone)
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
        RAISE EXCEPTION 'Montant de paiement invalide' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'Le total payé ne peut pas dépasser le montant de la commande' USING ERRCODE = '22023';
  END IF;

  v_balance := GREATEST(0, v_total_amount - v_total_paid);
  v_deposit_amount := v_acompte_paid;
  v_payment_status := CASE
    WHEN v_total_paid >= v_total_amount THEN 'paid'
    WHEN v_total_paid > 0 THEN 'partial'
    ELSE 'unpaid'
  END;

  -- ── Numéro définitif, sans trou : attribué dans la même transaction ──
  -- (annulé avec elle en cas d'échec). Le numéro envoyé par le client est ignoré.
  v_order_number := public.next_order_number(v_org_id);

  INSERT INTO public.orders (
    id, organization_id, order_number, customer_id, customer_name,
    customer_contact, pickup_date, total_amount, deposit_amount,
    custom_image_url, priority, reception_type, delivery_address,
    order_channel, subtotal, balance, paid_amount, customization_notes, created_by,
    status, payment_status
  ) VALUES (
    v_order_id, v_org_id, v_order_number, v_customer_id, v_customer_name,
    v_customer_contact, (p_order->>'pickup_date')::timestamptz, v_total_amount, v_deposit_amount,
    NULLIF(p_order->>'custom_image_url', ''),
    COALESCE(NULLIF(p_order->>'priority', ''), 'normale'),
    COALESCE(NULLIF(p_order->>'reception_type', ''), 'retrait'),
    NULLIF(p_order->>'delivery_address', ''),
    NULLIF(p_order->>'order_channel', ''),
    COALESCE((p_order->>'subtotal')::numeric, v_total_amount),
    v_balance, v_total_paid,
    NULLIF(p_order->>'customization_notes', ''),
    v_actor_id,
    COALESCE(NULLIF(p_order->>'status', ''), 'confirmed'),
    v_payment_status
  )
  RETURNING * INTO v_order;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE((v_item->>'quantity')::integer, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantité de ligne invalide' USING ERRCODE = '22023';
    END IF;
    IF COALESCE((v_item->>'unit_price')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Prix de ligne invalide' USING ERRCODE = '22023';
    END IF;
    v_item_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_product_name := NULL;
    IF v_item_product_id IS NOT NULL THEN
      SELECT name INTO v_product_name FROM public.products
      WHERE id = v_item_product_id AND organization_id = v_org_id;
      IF v_product_name IS NULL THEN
        RAISE EXCEPTION 'Produit introuvable ou hors organisation : %', v_item_product_id USING ERRCODE = '42501';
      END IF;
    END IF;
    v_item_name := COALESCE(NULLIF(trim(v_item->>'name'), ''), v_product_name, 'Article');
    INSERT INTO public.order_items (id, order_id, product_id, name, quantity, unit_price, from_inventory)
    VALUES (
      COALESCE(NULLIF(v_item->>'id', '')::uuid, gen_random_uuid()),
      v_order_id, v_item_product_id, v_item_name,
      (v_item->>'quantity')::integer, (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'from_inventory')::boolean, false)
    );
  END LOOP;

  IF jsonb_array_length(p_payments) > 0 THEN
    FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
      IF COALESCE((v_payment->>'amount')::numeric, 0) > 0 THEN
        v_norm_method := public.normalize_payment_method(COALESCE(NULLIF(v_payment->>'payment_method', ''), 'cash'));
        INSERT INTO public.transactions (
          organization_id, order_id, customer_id, client_name,
          amount, payment_method, payment_details, label_type, created_by
        ) VALUES (
          v_org_id, v_order_id, v_customer_id, v_customer_name,
          (v_payment->>'amount')::numeric, v_norm_method,
          jsonb_build_object(v_norm_method, (v_payment->>'amount')::numeric),
          COALESCE(NULLIF(v_payment->>'label_type', ''), 'ACOMPTE'), v_actor_id
        );
      END IF;
    END LOOP;
  ELSIF v_total_paid > 0 THEN
    v_norm_method := public.normalize_payment_method(COALESCE(NULLIF(p_order->>'deposit_payment_method', ''), 'cash'));
    INSERT INTO public.transactions (
      organization_id, order_id, customer_id, client_name,
      amount, payment_method, payment_details, label_type, created_by
    ) VALUES (
      v_org_id, v_order_id, v_customer_id, v_customer_name,
      v_total_paid, v_norm_method,
      jsonb_build_object(v_norm_method, v_total_paid),
      CASE WHEN v_total_paid >= v_total_amount THEN 'SOLDE' ELSE 'ACOMPTE' END, v_actor_id
    );
  END IF;

  IF v_customer_id IS NOT NULL AND v_total_paid > 0 THEN
    v_points := FLOOR(v_total_paid / 1000);
    IF v_points > 0 THEN
      UPDATE public.customers
      SET loyalty_points = COALESCE(loyalty_points, 0) + v_points,
          lifetime_points = COALESCE(lifetime_points, 0) + v_points
      WHERE id = v_customer_id AND organization_id = v_org_id;
    END IF;
  END IF;

  IF p_metrics IS NOT NULL AND jsonb_typeof(p_metrics) = 'object' THEN
    INSERT INTO public.order_creation_metrics (
      organization_id, order_id, created_by, started_at, completed_at, duration_seconds
    ) VALUES (
      v_org_id, v_order_id, v_actor_id,
      (p_metrics->>'started_at')::timestamptz,
      (p_metrics->>'completed_at')::timestamptz,
      (p_metrics->>'duration_seconds')::integer
    );
  END IF;

  RETURN jsonb_build_object('order', to_jsonb(v_order));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB, JSONB, JSONB) TO authenticated;
