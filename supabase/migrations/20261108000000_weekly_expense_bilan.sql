-- ============================================================
-- Migration : 20261108000000_weekly_expense_bilan.sql
-- Objectif  : Bilan hebdomadaire de la régie dépenses intégré à la
--             clôture de caisse du dimanche.
--   1. Helper d'autorisation pour les RPC de la régie
--   2. Nouvelles valeurs de recharge_source (non_enregistree, reinitialisation)
--   3. Bascule automatique d'un cycle dépassé (get_or_create_active_expense_cycle)
--   4. Nouvelle RPC weekly_expense_closing_atomic (recharge = sortie de caisse)
--   5. Contrôle organisation / rôle dans toutes les RPC SECURITY DEFINER
--      de la régie (auparavant appelables par tout utilisateur authentifié)
-- Spec : docs/superpowers/specs/2026-11-08-bilan-hebdo-depenses-design.md
-- ============================================================

-- ── 1. Helper d'autorisation ────────────────────────────────
-- Vérifie que l'appelant appartient à l'organisation avec un rôle autorisé.
-- - Appel via service_role (serveur de confiance, sans auth.uid()) : accepté,
--   l'acteur est p_user_id.
-- - Sinon : auth.uid() obligatoire, p_user_id (s'il est fourni) doit être
--   l'appelant lui-même.
-- Retourne l'identifiant de l'acteur.
CREATE OR REPLACE FUNCTION public.assert_expense_actor(
    p_org_id UUID,
    p_user_id UUID,
    p_roles TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
    v_org UUID;
BEGIN
    IF v_uid IS NULL THEN
        IF COALESCE(auth.jwt() ->> 'role', '') = 'service_role' THEN
            RETURN p_user_id;
        END IF;
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '28000';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> v_uid THEN
        RAISE EXCEPTION 'Acteur invalide' USING ERRCODE = '42501';
    END IF;

    SELECT role_slug, organization_id INTO v_role, v_org
    FROM public.profiles
    WHERE id = v_uid AND is_active = true;

    IF v_org IS NULL OR v_org <> p_org_id THEN
        RAISE EXCEPTION 'Accès refusé : organisation invalide' USING ERRCODE = '42501';
    END IF;

    IF v_role IS NULL OR NOT (v_role = ANY (p_roles)) THEN
        RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
    END IF;

    RETURN v_uid;
END;
$$;

-- Résumé d'un cycle (montants + ventilation par catégorie), utilisé à la clôture.
CREATE OR REPLACE FUNCTION public.build_expense_cycle_summary(p_cycle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_cycle RECORD;
    v_breakdown JSONB;
BEGIN
    SELECT * INTO v_cycle FROM public.expense_cycles WHERE id = p_cycle_id;

    SELECT COALESCE(jsonb_object_agg(category, cat_total), '{}'::jsonb)
    INTO v_breakdown
    FROM (
        SELECT category, SUM(amount) AS cat_total
        FROM public.expenses
        WHERE cycle_id = p_cycle_id AND is_cancelled = FALSE
        GROUP BY category
    ) sub;

    RETURN jsonb_build_object(
        'initial_budget', v_cycle.initial_budget,
        'total_allocated', v_cycle.total_allocated,
        'total_spent', v_cycle.total_spent,
        'current_balance', v_cycle.current_balance,
        'category_breakdown', v_breakdown
    );
END;
$$;

-- ── 2. Valeurs de recharge_source ───────────────────────────
ALTER TABLE public.expense_cycles
    DROP CONSTRAINT IF EXISTS expense_cycles_recharge_source_check;

ALTER TABLE public.expense_cycles
    ADD CONSTRAINT expense_cycles_recharge_source_check
    CHECK (recharge_source IN (
        'ventes_hebdo', 'apport_externe', 'mixte', 'aucune',
        'non_enregistree', 'reinitialisation'
    ));

-- ── 3. get_or_create_active_expense_cycle + bascule automatique ──
CREATE OR REPLACE FUNCTION public.get_or_create_active_expense_cycle(
    p_org_id UUID,
    p_default_budget NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_cycle RECORD;
    v_budget NUMERIC;
    v_now TIMESTAMPTZ := NOW();
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
BEGIN
    PERFORM public.assert_expense_actor(
        p_org_id, NULL, ARRAY['vendeur', 'gerant', 'super_admin', 'patissier']
    );

    -- 1. Cycle actif existant (verrouillé pour une éventuelle bascule)
    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE organization_id = p_org_id AND status = 'active'
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        IF v_cycle.end_date >= v_now THEN
            RETURN to_jsonb(v_cycle);
        END IF;

        -- 2. Bascule automatique : la semaine est terminée sans bilan.
        --    Aucune recharge n'est enregistrée (personne n'a déplacé d'argent).
        UPDATE public.expense_cycles
        SET status = 'closed',
            closed_at = v_now,
            closed_by = NULL,
            recharge_amount = 0,
            recharge_source = 'non_enregistree',
            closure_summary = public.build_expense_cycle_summary(v_cycle.id)
                || jsonb_build_object('closing_type', 'auto', 'closed_at', v_now),
            updated_at = v_now
        WHERE id = v_cycle.id;
    END IF;

    -- 3. Budget de référence (paramètre > configuration organisation > 150 000)
    IF p_default_budget IS NOT NULL AND p_default_budget > 0 THEN
        v_budget := p_default_budget;
    ELSE
        SELECT COALESCE(weekly_expense_budget, 150000.00) INTO v_budget
        FROM public.organizations
        WHERE id = p_org_id;
        v_budget := COALESCE(v_budget, 150000.00);
    END IF;

    -- 4. Semaine courante : lundi 00h00 → dimanche 23h59:59.999
    v_start := date_trunc('week', v_now);
    v_end := v_start + INTERVAL '7 days' - INTERVAL '1 millisecond';

    BEGIN
        INSERT INTO public.expense_cycles (
            organization_id, start_date, end_date,
            initial_budget, total_allocated, total_spent, current_balance, status
        ) VALUES (
            p_org_id, v_start, v_end,
            v_budget, v_budget, 0.00, v_budget, 'active'
        )
        RETURNING * INTO v_cycle;
    EXCEPTION WHEN unique_violation THEN
        -- Un appel concurrent a déjà créé le cycle actif : on le renvoie.
        SELECT * INTO v_cycle
        FROM public.expense_cycles
        WHERE organization_id = p_org_id AND status = 'active'
        LIMIT 1;
    END;

    RETURN to_jsonb(v_cycle);
END;
$$;

-- ── 4. Bilan hebdomadaire (clôture de caisse du dimanche) ────
CREATE OR REPLACE FUNCTION public.weekly_expense_closing_atomic(
    p_org_id UUID,
    p_cycle_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID;
    v_cycle RECORD;
    v_session_id UUID;
    v_budget NUMERIC;
    v_recharge NUMERIC;
    v_tx_id UUID := NULL;
    v_now TIMESTAMPTZ := NOW();
    v_new_start TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_new_cycle_id UUID;
BEGIN
    v_actor := public.assert_expense_actor(
        p_org_id, NULL, ARRAY['vendeur', 'gerant', 'super_admin']
    );

    -- 1. Verrouiller le cycle (empêche un double bilan)
    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE id = p_cycle_id AND organization_id = p_org_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cette semaine est déjà clôturée ou introuvable. Rechargez la page.';
    END IF;

    -- 2. Le bilan se fait le dernier jour de la semaine (dimanche) ou après
    IF v_now < date_trunc('day', v_cycle.end_date) THEN
        RAISE EXCEPTION 'Le bilan de la semaine se fait le dimanche, à la clôture de caisse.';
    END IF;

    -- 3. La recharge est prélevée dans le tiroir : une caisse ouverte est requise
    SELECT id INTO v_session_id
    FROM public.sales_sessions
    WHERE organization_id = p_org_id AND status = 'open'
    LIMIT 1;

    IF v_session_id IS NULL THEN
        RAISE EXCEPTION 'Ouvrez la caisse pour faire le bilan de la semaine.';
    END IF;

    -- 4. Budget cible (jamais fourni par le client)
    SELECT COALESCE(weekly_expense_budget, 150000.00) INTO v_budget
    FROM public.organizations
    WHERE id = p_org_id;
    v_budget := COALESCE(v_budget, 150000.00);

    v_recharge := GREATEST(0, v_budget - v_cycle.current_balance);

    -- 5. Sortie d'espèces du tiroir (même format que les rallonges)
    IF v_recharge > 0 THEN
        INSERT INTO public.transactions (
            organization_id, order_id, client_name, amount,
            payment_method, payment_details, label_type, created_by
        ) VALUES (
            p_org_id,
            NULL,
            'Sortie caisse : Recharge enveloppe dépenses (semaine du '
                || to_char(v_cycle.start_date, 'DD/MM') || ')',
            -v_recharge,
            'Espèces',
            jsonb_build_object('Espèces', -v_recharge),
            'SORTIE_CAISSE',
            v_actor
        )
        RETURNING id INTO v_tx_id;
    END IF;

    -- 6. Clôturer la semaine
    UPDATE public.expense_cycles
    SET status = 'closed',
        closed_at = v_now,
        closed_by = v_actor,
        recharge_amount = v_recharge,
        recharge_source = 'ventes_hebdo',
        closure_summary = public.build_expense_cycle_summary(v_cycle.id)
            || jsonb_build_object(
                'closing_type', 'bilan_caisse',
                'closed_at', v_now,
                'closed_by', v_actor,
                'target_budget', v_budget,
                'recharge_transaction_id', v_tx_id,
                'sales_session_id', v_session_id
            ),
        updated_at = v_now
    WHERE id = v_cycle.id;

    -- 7. Ouvrir la semaine suivante (lundi qui suit la semaine clôturée)
    v_new_start := date_trunc('week', v_cycle.end_date) + INTERVAL '7 days';
    IF v_new_start + INTERVAL '7 days' <= v_now THEN
        v_new_start := date_trunc('week', v_now);
    END IF;
    v_new_end := v_new_start + INTERVAL '7 days' - INTERVAL '1 millisecond';

    INSERT INTO public.expense_cycles (
        organization_id, start_date, end_date,
        initial_budget, total_allocated, total_spent, current_balance, status
    ) VALUES (
        p_org_id, v_new_start, v_new_end,
        v_budget, v_budget, 0.00, v_budget, 'active'
    )
    RETURNING id INTO v_new_cycle_id;

    RETURN jsonb_build_object(
        'success', true,
        'closed_cycle_id', v_cycle.id,
        'recharge_amount', v_recharge,
        'recharge_transaction_id', v_tx_id,
        'sales_session_id', v_session_id,
        'new_cycle_id', v_new_cycle_id,
        'new_budget', v_budget
    );
END;
$$;

-- ── 5. RPC existantes : mêmes corps + contrôle d'autorisation ──

-- B. record_expense_atomic
CREATE OR REPLACE FUNCTION public.record_expense_atomic(
    p_org_id UUID,
    p_cycle_id UUID,
    p_amount NUMERIC,
    p_category TEXT,
    p_description TEXT,
    p_payment_method TEXT,
    p_receipt_url TEXT,
    p_user_id UUID,
    p_expense_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID;
    v_cycle RECORD;
    v_expense_id UUID;
    v_new_balance NUMERIC;
    v_new_spent NUMERIC;
BEGIN
    v_actor := public.assert_expense_actor(
        p_org_id, p_user_id, ARRAY['vendeur', 'gerant', 'super_admin']
    );

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Le montant de la dépense doit être strictement positif.';
    END IF;

    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE id = p_cycle_id AND organization_id = p_org_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cycle de dépense actif introuvable pour cette organisation.';
    END IF;

    INSERT INTO public.expenses (
        organization_id, cycle_id, amount, category, description,
        payment_method, receipt_url, expense_date, created_by
    ) VALUES (
        p_org_id, p_cycle_id, p_amount, p_category, p_description,
        COALESCE(p_payment_method, 'cash'), p_receipt_url,
        COALESCE(p_expense_date, NOW()), v_actor
    )
    RETURNING id INTO v_expense_id;

    v_new_spent := v_cycle.total_spent + p_amount;
    v_new_balance := v_cycle.current_balance - p_amount;

    UPDATE public.expense_cycles
    SET total_spent = v_new_spent,
        current_balance = v_new_balance,
        updated_at = NOW()
    WHERE id = p_cycle_id;

    RETURN jsonb_build_object(
        'success', true,
        'expense_id', v_expense_id,
        'total_spent', v_new_spent,
        'current_balance', v_new_balance
    );
END;
$$;

-- C. cancel_expense_atomic
CREATE OR REPLACE FUNCTION public.cancel_expense_atomic(
    p_org_id UUID,
    p_expense_id UUID,
    p_reason TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID;
    v_expense RECORD;
    v_cycle RECORD;
    v_new_spent NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    v_actor := public.assert_expense_actor(
        p_org_id, p_user_id, ARRAY['vendeur', 'gerant', 'super_admin']
    );

    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Un motif d''annulation est obligatoire.';
    END IF;

    SELECT * INTO v_expense
    FROM public.expenses
    WHERE id = p_expense_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dépense introuvable.';
    END IF;

    IF v_expense.is_cancelled THEN
        RAISE EXCEPTION 'Cette dépense est déjà annulée.';
    END IF;

    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE id = v_expense.cycle_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cycle associé introuvable.';
    END IF;

    UPDATE public.expenses
    SET is_cancelled = TRUE,
        cancellation_reason = p_reason,
        cancelled_at = NOW(),
        cancelled_by = v_actor
    WHERE id = p_expense_id;

    v_new_spent := GREATEST(0, v_cycle.total_spent - v_expense.amount);
    v_new_balance := v_cycle.current_balance + v_expense.amount;

    UPDATE public.expense_cycles
    SET total_spent = v_new_spent,
        current_balance = v_new_balance,
        updated_at = NOW()
    WHERE id = v_cycle.id;

    RETURN jsonb_build_object(
        'success', true,
        'expense_id', p_expense_id,
        'amount_refunded', v_expense.amount,
        'total_spent', v_new_spent,
        'current_balance', v_new_balance
    );
END;
$$;

-- D. record_top_up_atomic
CREATE OR REPLACE FUNCTION public.record_top_up_atomic(
    p_org_id UUID,
    p_cycle_id UUID,
    p_amount NUMERIC,
    p_reason TEXT,
    p_source TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID;
    v_cycle RECORD;
    v_session RECORD;
    v_tx_id UUID := NULL;
    v_top_up_id UUID;
    v_new_allocated NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    v_actor := public.assert_expense_actor(
        p_org_id, p_user_id, ARRAY['vendeur', 'gerant', 'super_admin']
    );

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Le montant de la rallonge doit être strictement positif.';
    END IF;

    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE id = p_cycle_id AND organization_id = p_org_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cycle de dépense actif introuvable.';
    END IF;

    IF p_source = 'caisse_du_jour' THEN
        SELECT * INTO v_session
        FROM public.sales_sessions
        WHERE organization_id = p_org_id AND status = 'open'
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Aucune session de caisse ouverte pour prélever la rallonge.';
        END IF;

        INSERT INTO public.transactions (
            organization_id, order_id, client_name, amount,
            payment_method, payment_details, label_type, created_by
        ) VALUES (
            p_org_id, NULL, 'Sortie caisse : Rallonge menue dépense', -p_amount,
            'Espèces', jsonb_build_object('Espèces', -p_amount), 'SORTIE_CAISSE', v_actor
        )
        RETURNING id INTO v_tx_id;
    END IF;

    INSERT INTO public.budget_top_ups (
        organization_id, cycle_id, sales_session_id, transaction_id,
        amount, reason, source, created_by
    ) VALUES (
        p_org_id,
        p_cycle_id,
        CASE WHEN p_source = 'caisse_du_jour' THEN v_session.id ELSE NULL END,
        v_tx_id,
        p_amount,
        p_reason,
        p_source,
        v_actor
    )
    RETURNING id INTO v_top_up_id;

    v_new_allocated := v_cycle.total_allocated + p_amount;
    v_new_balance := v_cycle.current_balance + p_amount;

    UPDATE public.expense_cycles
    SET total_allocated = v_new_allocated,
        current_balance = v_new_balance,
        updated_at = NOW()
    WHERE id = p_cycle_id;

    RETURN jsonb_build_object(
        'success', true,
        'top_up_id', v_top_up_id,
        'transaction_id', v_tx_id,
        'total_allocated', v_new_allocated,
        'current_balance', v_new_balance
    );
END;
$$;

-- E. close_expense_cycle_atomic (plus appelée par l'interface ; réservée gérant)
CREATE OR REPLACE FUNCTION public.close_expense_cycle_atomic(
    p_org_id UUID,
    p_cycle_id UUID,
    p_recharge_source TEXT,
    p_user_id UUID,
    p_new_budget NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID;
    v_cycle RECORD;
    v_summary JSONB;
    v_recharge NUMERIC;
    v_target_budget NUMERIC;
    v_new_cycle_id UUID;
    v_new_start TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    v_actor := public.assert_expense_actor(
        p_org_id, p_user_id, ARRAY['gerant', 'super_admin']
    );

    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE id = p_cycle_id AND organization_id = p_org_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cycle actif introuvable pour clôture.';
    END IF;

    IF p_new_budget IS NOT NULL AND p_new_budget > 0 THEN
        v_target_budget := p_new_budget;
    ELSE
        SELECT COALESCE(weekly_expense_budget, 150000.00) INTO v_target_budget
        FROM public.organizations
        WHERE id = p_org_id;
        v_target_budget := COALESCE(v_target_budget, 150000.00);
    END IF;

    v_recharge := GREATEST(0, v_target_budget - v_cycle.current_balance);

    v_summary := public.build_expense_cycle_summary(p_cycle_id)
        || jsonb_build_object('closed_at', v_now, 'closed_by', v_actor);

    UPDATE public.expense_cycles
    SET status = 'closed',
        closed_at = v_now,
        closed_by = v_actor,
        recharge_amount = v_recharge,
        recharge_source = p_recharge_source,
        closure_summary = v_summary,
        updated_at = v_now
    WHERE id = p_cycle_id;

    v_new_start := date_trunc('week', v_now);
    IF EXTRACT(DOW FROM v_now) = 0 THEN
        v_new_start := date_trunc('week', v_now + INTERVAL '1 day');
    END IF;
    v_new_end := v_new_start + INTERVAL '7 days' - INTERVAL '1 millisecond';

    INSERT INTO public.expense_cycles (
        organization_id, start_date, end_date,
        initial_budget, total_allocated, total_spent, current_balance, status
    ) VALUES (
        p_org_id, v_new_start, v_new_end,
        v_target_budget, v_target_budget, 0.00, v_target_budget, 'active'
    )
    RETURNING id INTO v_new_cycle_id;

    RETURN jsonb_build_object(
        'success', true,
        'closed_cycle_id', p_cycle_id,
        'recharge_amount', v_recharge,
        'recharge_source', p_recharge_source,
        'new_cycle_id', v_new_cycle_id,
        'new_budget', v_target_budget,
        'summary', v_summary
    );
END;
$$;

-- F. update_organization_expense_budget (réservée gérant)
CREATE OR REPLACE FUNCTION public.update_organization_expense_budget(
    p_org_id UUID,
    p_new_budget NUMERIC,
    p_adjust_active_cycle BOOLEAN DEFAULT FALSE,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_old_budget NUMERIC;
    v_diff NUMERIC;
    v_active_cycle RECORD;
BEGIN
    PERFORM public.assert_expense_actor(
        p_org_id, p_user_id, ARRAY['gerant', 'super_admin']
    );

    IF p_new_budget <= 0 THEN
        RAISE EXCEPTION 'Le montant du budget hebdomadaire doit être supérieur à 0.';
    END IF;

    SELECT weekly_expense_budget INTO v_old_budget
    FROM public.organizations
    WHERE id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Organisation introuvable.';
    END IF;

    UPDATE public.organizations
    SET weekly_expense_budget = p_new_budget,
        updated_at = NOW()
    WHERE id = p_org_id;

    IF p_adjust_active_cycle THEN
        SELECT * INTO v_active_cycle
        FROM public.expense_cycles
        WHERE organization_id = p_org_id AND status = 'active'
        FOR UPDATE;

        IF FOUND THEN
            v_diff := p_new_budget - v_active_cycle.initial_budget;
            UPDATE public.expense_cycles
            SET initial_budget = p_new_budget,
                total_allocated = total_allocated + v_diff,
                current_balance = current_balance + v_diff,
                updated_at = NOW()
            WHERE id = v_active_cycle.id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_org_id,
        'old_budget', v_old_budget,
        'new_budget', p_new_budget,
        'active_cycle_adjusted', p_adjust_active_cycle
    );
END;
$$;

-- ── 6. Permissions d'exécution ──────────────────────────────
-- Helpers internes : appelés uniquement depuis les RPC ci-dessus.
REVOKE EXECUTE ON FUNCTION public.assert_expense_actor(UUID, UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.build_expense_cycle_summary(UUID) FROM PUBLIC, anon, authenticated;

-- RPC publiques de la régie : utilisateurs connectés (contrôle dans le corps) + serveur.
REVOKE EXECUTE ON FUNCTION public.get_or_create_active_expense_cycle(UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.weekly_expense_closing_atomic(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_expense_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_expense_atomic(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_top_up_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_expense_cycle_atomic(UUID, UUID, TEXT, UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_organization_expense_budget(UUID, NUMERIC, BOOLEAN, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_or_create_active_expense_cycle(UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.weekly_expense_closing_atomic(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_expense_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_expense_atomic(UUID, UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_top_up_atomic(UUID, UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_expense_cycle_atomic(UUID, UUID, TEXT, UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_organization_expense_budget(UUID, NUMERIC, BOOLEAN, UUID) TO authenticated, service_role;
