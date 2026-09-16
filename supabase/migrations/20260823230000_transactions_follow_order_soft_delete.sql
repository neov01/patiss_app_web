-- ============================================================
-- Migration : 20260823230000_transactions_follow_order_soft_delete
-- Objectif  : Une commande supprimée logiquement laissait derrière elle
--             toutes ses transactions (acomptes / soldes) bien vivantes.
--             Résultat : l'argent d'une commande supprimée continuait
--             d'apparaître dans l'« Historique récent » de la caisse, dans
--             le CA encaissé du jour, dans la clôture de session, dans le
--             rapport quotidien par e-mail et dans le contexte financier
--             de Croustik.
--
--             `orders.deleted_at` seul ne suffit pas : PostgREST ne sait pas
--             exprimer « la commande parente n'est pas supprimée » sur une
--             table dont la moitié des lignes n'a pas de commande parente
--             (les ventes rapides ont order_id IS NULL). On propage donc
--             l'état de suppression sur `transactions.deleted_at`, écrit
--             uniquement par soft_delete_order_atomic / restore_order_atomic,
--             dans la même transaction que la commande.
--
--             La purge définitive à 30 jours continue de supprimer
--             physiquement ces lignes (purge_expired_deleted_orders) : cette
--             colonne ne couvre que la fenêtre de rétention.
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.transactions.deleted_at IS
  'Renseignée quand la commande parente est supprimée logiquement. Écrite uniquement par soft_delete_order_atomic / restore_order_atomic.';

-- Les lectures financières filtrent toutes sur (organization_id, deleted_at IS NULL, created_at)
CREATE INDEX IF NOT EXISTS idx_transactions_org_created_active
  ON public.transactions (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Rattrapage : les commandes déjà supprimées avant cette migration
UPDATE public.transactions t
SET deleted_at = o.deleted_at
FROM public.orders o
WHERE t.order_id = o.id
  AND o.deleted_at IS NOT NULL
  AND t.deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────
-- soft_delete_order_atomic : marque aussi les transactions liées
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.soft_delete_order_atomic(
  p_order_id        UUID,
  p_organization_id UUID,
  p_reason          TEXT,
  p_actor_id        UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id         UUID := COALESCE(auth.uid(), p_actor_id);
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

  IF auth.uid() IS NOT NULL AND p_actor_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Acteur invalide pour cette suppression' USING ERRCODE = '42501';
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

  -- L'argent encaissé pour cette commande sort des agrégats financiers tant
  -- que la commande reste supprimée (restauration possible pendant 30 jours).
  UPDATE public.transactions
  SET deleted_at = NOW()
  WHERE order_id = p_order_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;

  INSERT INTO public.order_deletion_audit (
    organization_id, order_id, order_reference, action,
    performed_by, performed_by_name, reason, order_snapshot, stock_adjustment
  ) VALUES (
    p_organization_id, p_order_id, COALESCE(v_order.order_number, p_order_id::text), 'delete',
    v_actor_id, COALESCE(v_actor_name, 'Utilisateur inconnu'), p_reason, v_snapshot, v_stock_adjustment
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- restore_order_atomic : remet les transactions liées en circulation
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.restore_order_atomic(
  p_order_id        UUID,
  p_organization_id UUID,
  p_reason          TEXT,
  p_actor_id        UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id      UUID := COALESCE(auth.uid(), p_actor_id);
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

  IF auth.uid() IS NOT NULL AND p_actor_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Acteur invalide pour cette restauration' USING ERRCODE = '42501';
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

  -- Inverse exact du marquage fait à la suppression : seule cette fonction et
  -- soft_delete_order_atomic écrivent transactions.deleted_at.
  UPDATE public.transactions
  SET deleted_at = NULL
  WHERE order_id = p_order_id
    AND organization_id = p_organization_id
    AND deleted_at IS NOT NULL;

  INSERT INTO public.order_deletion_audit (
    organization_id, order_id, order_reference, action,
    performed_by, performed_by_name, reason
  ) VALUES (
    p_organization_id, p_order_id, COALESCE(v_last_delete.order_reference, p_order_id::text), 'restore',
    v_actor_id, COALESCE(v_actor_name, 'Utilisateur inconnu'), p_reason
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soft_delete_order_atomic(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_order_atomic(UUID, UUID, TEXT, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.restore_order_atomic(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_order_atomic(UUID, UUID, TEXT, UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- get_daily_metrics : le CA encaissé ignore les transactions supprimées
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_daily_metrics(p_org_id uuid, p_target_date date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ca_encaisse numeric;
  v_volume_affaires numeric;
BEGIN
  SELECT COALESCE(sum(amount), 0)
  INTO v_ca_encaisse
  FROM transactions
  WHERE organization_id = p_org_id
  AND created_at::date = p_target_date
  AND deleted_at IS NULL;

  SELECT COALESCE(sum(total_amount), 0)
  INTO v_volume_affaires
  FROM orders
  WHERE organization_id = p_org_id
  AND created_at::date = p_target_date
  AND deleted_at IS NULL;

  RETURN json_build_object(
    'ca_encaisse', v_ca_encaisse,
    'volume_affaires', v_volume_affaires
  );
END;
$$;
