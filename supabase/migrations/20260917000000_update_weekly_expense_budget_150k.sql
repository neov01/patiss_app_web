-- ============================================================
-- Migration : 20260917000000_update_weekly_expense_budget_150k.sql
-- Objectif  : Passage de l'enveloppe dépenses à 150 000 FCFA,
--             paramétrage du budget hebdomadaire par organisation,
--             mise à niveau des cycles actifs (+50 000 FCFA) et
--             RPC atomique de mise à jour du budget.
-- ============================================================

-- ── 1. Ajout de la colonne weekly_expense_budget sur organizations ──
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS weekly_expense_budget NUMERIC(12,2) NOT NULL DEFAULT 150000.00;

-- Mettre à jour les organisations existantes
UPDATE public.organizations 
SET weekly_expense_budget = 150000.00 
WHERE weekly_expense_budget IS NULL OR weekly_expense_budget = 100000.00;

-- ── 2. Mise à jour des valeurs par défaut sur expense_cycles ──
ALTER TABLE public.expense_cycles ALTER COLUMN initial_budget SET DEFAULT 150000.00;
ALTER TABLE public.expense_cycles ALTER COLUMN total_allocated SET DEFAULT 150000.00;
ALTER TABLE public.expense_cycles ALTER COLUMN current_balance SET DEFAULT 150000.00;

-- ── 3. Mise à niveau immédiate des cycles actifs en base (+50 000 FCFA) ──
-- Les cycles actifs commencés avec 100 000 FCFA reçoivent la rallonge de 50 000 FCFA
UPDATE public.expense_cycles
SET initial_budget = 150000.00,
    total_allocated = total_allocated + 50000.00,
    current_balance = current_balance + 50000.00,
    updated_at = NOW()
WHERE status = 'active' AND initial_budget < 150000.00;

-- ── 4. Mise à jour de la RPC get_or_create_active_expense_cycle ──
CREATE OR REPLACE FUNCTION public.get_or_create_active_expense_cycle(
    p_org_id UUID,
    p_default_budget NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cycle RECORD;
    v_budget NUMERIC;
    v_now TIMESTAMPTZ := NOW();
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
BEGIN
    -- 1. Chercher le cycle actif existant
    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE organization_id = p_org_id AND status = 'active'
    LIMIT 1;

    IF FOUND THEN
        RETURN to_jsonb(v_cycle);
    END IF;

    -- 2. Déterminer le budget de référence (paramètre > configuration organisation > 150 000)
    IF p_default_budget IS NOT NULL AND p_default_budget > 0 THEN
        v_budget := p_default_budget;
    ELSE
        SELECT COALESCE(weekly_expense_budget, 150000.00) INTO v_budget
        FROM public.organizations
        WHERE id = p_org_id;
        v_budget := COALESCE(v_budget, 150000.00);
    END IF;

    -- 3. Calculer début (Lundi 00h00) et fin (Dimanche 23h59:59.999) de la semaine courante
    v_start := date_trunc('week', v_now);
    v_end := v_start + INTERVAL '7 days' - INTERVAL '1 millisecond';

    -- 4. Créer le nouveau cycle
    INSERT INTO public.expense_cycles (
        organization_id,
        start_date,
        end_date,
        initial_budget,
        total_allocated,
        total_spent,
        current_balance,
        status
    ) VALUES (
        p_org_id,
        v_start,
        v_end,
        v_budget,
        v_budget,
        0.00,
        v_budget,
        'active'
    )
    RETURNING * INTO v_cycle;

    RETURN to_jsonb(v_cycle);
END;
$$;

-- ── 5. Mise à jour de la RPC close_expense_cycle_atomic ──
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
AS $$
DECLARE
    v_cycle RECORD;
    v_summary JSONB;
    v_recharge NUMERIC;
    v_target_budget NUMERIC;
    v_new_cycle_id UUID;
    v_new_start TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_now TIMESTAMPTZ := NOW();
    v_cat_breakdown JSONB;
BEGIN
    -- Verrouiller le cycle à clôturer
    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE id = p_cycle_id AND organization_id = p_org_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cycle actif introuvable pour clôture.';
    END IF;

    -- Déterminer le budget cible du prochain cycle
    IF p_new_budget IS NOT NULL AND p_new_budget > 0 THEN
        v_target_budget := p_new_budget;
    ELSE
        SELECT COALESCE(weekly_expense_budget, 150000.00) INTO v_target_budget
        FROM public.organizations
        WHERE id = p_org_id;
        v_target_budget := COALESCE(v_target_budget, 150000.00);
    END IF;

    -- Calculer la recharge nécessaire : v_target_budget - solde restant
    -- Si solde négatif (découvert), la recharge comble le découvert
    v_recharge := GREATEST(0, v_target_budget - v_cycle.current_balance);

    -- Ventilation des dépenses actives par catégorie
    SELECT COALESCE(
        jsonb_object_agg(category, cat_total),
        '{}'::jsonb
    ) INTO v_cat_breakdown
    FROM (
        SELECT category, SUM(amount) as cat_total
        FROM public.expenses
        WHERE cycle_id = p_cycle_id AND is_cancelled = FALSE
        GROUP BY category
    ) sub;

    v_summary := jsonb_build_object(
        'initial_budget', v_cycle.initial_budget,
        'total_allocated', v_cycle.total_allocated,
        'total_spent', v_cycle.total_spent,
        'current_balance', v_cycle.current_balance,
        'category_breakdown', v_cat_breakdown,
        'closed_at', v_now,
        'closed_by', p_user_id
    );

    -- Clôturer le cycle existant
    UPDATE public.expense_cycles
    SET status = 'closed',
        closed_at = v_now,
        closed_by = p_user_id,
        recharge_amount = v_recharge,
        recharge_source = p_recharge_source,
        closure_summary = v_summary,
        updated_at = v_now
    WHERE id = p_cycle_id;

    -- Calculer la période du nouveau cycle (Lundi 00h00 au Dimanche 23h59:59.999)
    v_new_start := date_trunc('week', v_now);
    IF EXTRACT(DOW FROM v_now) = 0 THEN
        v_new_start := date_trunc('week', v_now + INTERVAL '1 day');
    END IF;
    v_new_end := v_new_start + INTERVAL '7 days' - INTERVAL '1 millisecond';

    -- Ouvrir immédiatement le nouveau cycle avec le budget initial cible
    INSERT INTO public.expense_cycles (
        organization_id,
        start_date,
        end_date,
        initial_budget,
        total_allocated,
        total_spent,
        current_balance,
        status
    ) VALUES (
        p_org_id,
        v_new_start,
        v_new_end,
        v_target_budget,
        v_target_budget,
        0.00,
        v_target_budget,
        'active'
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

-- ── 6. Nouvelle RPC update_organization_expense_budget ──
CREATE OR REPLACE FUNCTION public.update_organization_expense_budget(
    p_org_id UUID,
    p_new_budget NUMERIC,
    p_adjust_active_cycle BOOLEAN DEFAULT FALSE,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_budget NUMERIC;
    v_diff NUMERIC;
    v_active_cycle RECORD;
BEGIN
    IF p_new_budget <= 0 THEN
        RAISE EXCEPTION 'Le montant du budget hebdomadaire doit être supérieur à 0.';
    END IF;

    -- 1. Lire et verrouiller l'organisation
    SELECT weekly_expense_budget INTO v_old_budget
    FROM public.organizations
    WHERE id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Organisation introuvable.';
    END IF;

    -- 2. Mettre à jour la configuration de l'organisation
    UPDATE public.organizations
    SET weekly_expense_budget = p_new_budget,
        updated_at = NOW()
    WHERE id = p_org_id;

    -- 3. Répercussion éventuelle sur le cycle actif
    IF p_adjust_active_cycle THEN
        SELECT * INTO v_active_cycle
        FROM public.expense_cycles
        WHERE organization_id = p_org_id AND status = 'active'
        FOR UPDATE;

        IF FOUND THEN
            -- Calcul de la différence entre le nouveau budget et le budget de départ
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

-- ── 7. Permissions d'exécution ──
GRANT EXECUTE ON FUNCTION public.get_or_create_active_expense_cycle TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_expense_cycle_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_organization_expense_budget TO authenticated, service_role;
