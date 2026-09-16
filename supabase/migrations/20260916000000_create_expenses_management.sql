-- ============================================================
-- Migration : 20260916000000_create_expenses_management.sql
-- Objectif  : Module de Régie d'Avances / Petite Caisse Dépenses
--             Budget hebdomadaire (100 000 FCFA), dépenses quotidiennes,
--             rallonges depuis le tiroir-caisse et clôture hebdomadaire.
-- ============================================================

-- ── 1. Table expense_cycles ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    initial_budget NUMERIC(12,2) NOT NULL DEFAULT 100000.00,
    total_allocated NUMERIC(12,2) NOT NULL DEFAULT 100000.00,
    total_spent NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    current_balance NUMERIC(12,2) NOT NULL DEFAULT 100000.00,
    status TEXT NOT NULL CHECK (status IN ('active', 'closed')) DEFAULT 'active',
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    recharge_amount NUMERIC(12,2) DEFAULT 0.00,
    recharge_source TEXT CHECK (recharge_source IN ('ventes_hebdo', 'apport_externe', 'mixte', 'aucune')),
    closure_summary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour recherche rapide et unicité du cycle actif
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_expense_cycle 
    ON public.expense_cycles(organization_id) 
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_expense_cycles_org_dates 
    ON public.expense_cycles(organization_id, start_date DESC);

-- ── 2. Table expenses ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cycle_id UUID NOT NULL REFERENCES public.expense_cycles(id) ON DELETE RESTRICT,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL CHECK (category IN (
        'ingredients_urgents',
        'emballages',
        'entretien_hygiene',
        'transport_courses',
        'petit_materiel',
        'reparations',
        'autre'
    )),
    description TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN (
        'cash', 'orange_money', 'wave', 'mtn_momo', 'moov_money', 'autre'
    )),
    receipt_url TEXT,
    expense_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_cycle_date 
    ON public.expenses(cycle_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_org_date 
    ON public.expenses(organization_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category 
    ON public.expenses(organization_id, category);

-- ── 3. Table budget_top_ups ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budget_top_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cycle_id UUID NOT NULL REFERENCES public.expense_cycles(id) ON DELETE CASCADE,
    sales_session_id UUID REFERENCES public.sales_sessions(id) ON DELETE SET NULL,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('caisse_du_jour', 'apport_externe_gerant', 'autre')) DEFAULT 'caisse_du_jour',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_top_ups_cycle 
    ON public.budget_top_ups(cycle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_top_ups_org 
    ON public.budget_top_ups(organization_id, created_at DESC);

-- ── 4. RLS (Row Level Security) ──────────────────────────────
ALTER TABLE public.expense_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_top_ups ENABLE ROW LEVEL SECURITY;

-- Politiques pour expense_cycles
DROP POLICY IF EXISTS "expense_cycles_select" ON public.expense_cycles;
CREATE POLICY "expense_cycles_select" ON public.expense_cycles
    FOR SELECT USING (
        public.is_super_admin()
        OR (
            public.get_user_organization_id() IS NOT NULL
            AND organization_id = public.get_user_organization_id()
        )
    );

DROP POLICY IF EXISTS "expense_cycles_insert" ON public.expense_cycles;
CREATE POLICY "expense_cycles_insert" ON public.expense_cycles
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR (
            public.get_user_organization_id() IS NOT NULL
            AND public.get_user_role() IN ('gerant', 'super_admin', 'vendeur')
            AND organization_id = public.get_user_organization_id()
        )
    );

DROP POLICY IF EXISTS "expense_cycles_update" ON public.expense_cycles;
CREATE POLICY "expense_cycles_update" ON public.expense_cycles
    FOR UPDATE USING (
        public.is_super_admin()
        OR (
            public.get_user_organization_id() IS NOT NULL
            AND public.get_user_role() IN ('gerant', 'super_admin', 'vendeur')
            AND organization_id = public.get_user_organization_id()
        )
    );

-- Politiques pour expenses
DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
CREATE POLICY "expenses_select" ON public.expenses
    FOR SELECT USING (
        public.is_super_admin()
        OR (
            public.get_user_organization_id() IS NOT NULL
            AND organization_id = public.get_user_organization_id()
        )
    );

DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
CREATE POLICY "expenses_insert" ON public.expenses
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR (
            public.get_user_organization_id() IS NOT NULL
            AND public.get_user_role() IN ('gerant', 'super_admin', 'vendeur')
            AND organization_id = public.get_user_organization_id()
        )
    );

DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
CREATE POLICY "expenses_update" ON public.expenses
    FOR UPDATE USING (
        public.is_super_admin()
        OR (
            public.get_user_organization_id() IS NOT NULL
            AND public.get_user_role() IN ('gerant', 'super_admin', 'vendeur')
            AND organization_id = public.get_user_organization_id()
        )
    );

-- Politiques pour budget_top_ups
DROP POLICY IF EXISTS "budget_top_ups_select" ON public.budget_top_ups;
CREATE POLICY "budget_top_ups_select" ON public.budget_top_ups
    FOR SELECT USING (
        public.is_super_admin()
        OR (
            public.get_user_organization_id() IS NOT NULL
            AND organization_id = public.get_user_organization_id()
        )
    );

DROP POLICY IF EXISTS "budget_top_ups_insert" ON public.budget_top_ups;
CREATE POLICY "budget_top_ups_insert" ON public.budget_top_ups
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR (
            public.get_user_organization_id() IS NOT NULL
            AND public.get_user_role() IN ('gerant', 'super_admin', 'vendeur')
            AND organization_id = public.get_user_organization_id()
        )
    );

-- ── 5. Procédures stockées atomiques (RPC) ────────────────────

-- A. get_or_create_active_expense_cycle
CREATE OR REPLACE FUNCTION public.get_or_create_active_expense_cycle(
    p_org_id UUID,
    p_default_budget NUMERIC DEFAULT 100000.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cycle RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_new_cycle_id UUID;
BEGIN
    -- 1. Chercher le cycle actif existant
    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE organization_id = p_org_id AND status = 'active'
    LIMIT 1;

    IF FOUND THEN
        RETURN to_jsonb(v_cycle);
    END IF;

    -- 2. Calculer le début (Lundi 00h00) et fin (Dimanche 23h59:59.999) de la semaine courante
    v_start := date_trunc('week', v_now);
    v_end := v_start + INTERVAL '7 days' - INTERVAL '1 millisecond';

    -- 3. Créer le nouveau cycle
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
        p_default_budget,
        p_default_budget,
        0.00,
        p_default_budget,
        'active'
    )
    RETURNING id INTO v_new_cycle_id;

    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE id = v_new_cycle_id;

    RETURN to_jsonb(v_cycle);
END;
$$;

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
AS $$
DECLARE
    v_cycle RECORD;
    v_expense_id UUID;
    v_new_balance NUMERIC;
    v_new_spent NUMERIC;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Le montant de la dépense doit être strictement positif.';
    END IF;

    -- Verrou pessimiste sur le cycle actif
    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE id = p_cycle_id AND organization_id = p_org_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cycle de dépense actif introuvable pour cette organisation.';
    END IF;

    -- Insérer la dépense
    INSERT INTO public.expenses (
        organization_id,
        cycle_id,
        amount,
        category,
        description,
        payment_method,
        receipt_url,
        expense_date,
        created_by
    ) VALUES (
        p_org_id,
        p_cycle_id,
        p_amount,
        p_category,
        p_description,
        COALESCE(p_payment_method, 'cash'),
        p_receipt_url,
        COALESCE(p_expense_date, NOW()),
        p_user_id
    )
    RETURNING id INTO v_expense_id;

    v_new_spent := v_cycle.total_spent + p_amount;
    v_new_balance := v_cycle.current_balance - p_amount;

    -- Mettre à jour le cycle
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
AS $$
DECLARE
    v_expense RECORD;
    v_cycle RECORD;
    v_new_spent NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    IF COALESCE(TRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Un motif d''annulation est obligatoire.';
    END IF;

    -- Récupérer et verrouiller la dépense
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

    -- Verrouiller le cycle associé
    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE id = v_expense.cycle_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cycle associé introuvable.';
    END IF;

    -- Marquer la dépense comme annulée
    UPDATE public.expenses
    SET is_cancelled = TRUE,
        cancellation_reason = p_reason,
        cancelled_at = NOW(),
        cancelled_by = p_user_id
    WHERE id = p_expense_id;

    -- Recréditer le cycle
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
AS $$
DECLARE
    v_cycle RECORD;
    v_session RECORD;
    v_tx_id UUID := NULL;
    v_top_up_id UUID;
    v_new_allocated NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Le montant de la rallonge doit être strictement positif.';
    END IF;

    -- Verrou pessimiste sur le cycle
    SELECT * INTO v_cycle
    FROM public.expense_cycles
    WHERE id = p_cycle_id AND organization_id = p_org_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cycle de dépense actif introuvable.';
    END IF;

    -- Si la source est la caisse du jour, vérifier la session ouverte et créer la transaction de débit
    IF p_source = 'caisse_du_jour' THEN
        SELECT * INTO v_session
        FROM public.sales_sessions
        WHERE organization_id = p_org_id AND status = 'open'
        LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Aucune session de caisse ouverte pour prélever la rallonge.';
        END IF;

        -- Insérer la transaction de sortie de caisse physique (montant négatif)
        INSERT INTO public.transactions (
            organization_id,
            order_id,
            client_name,
            amount,
            payment_method,
            payment_details,
            label_type,
            created_by
        ) VALUES (
            p_org_id,
            NULL,
            'Sortie caisse : Rallonge menue dépense',
            -p_amount,
            'Espèces',
            jsonb_build_object('Espèces', -p_amount),
            'SORTIE_CAISSE',
            p_user_id
        )
        RETURNING id INTO v_tx_id;
    END IF;

    -- Insérer l'enregistrement de top-up
    INSERT INTO public.budget_top_ups (
        organization_id,
        cycle_id,
        sales_session_id,
        transaction_id,
        amount,
        reason,
        source,
        created_by
    ) VALUES (
        p_org_id,
        p_cycle_id,
        CASE WHEN p_source = 'caisse_du_jour' THEN v_session.id ELSE NULL END,
        v_tx_id,
        p_amount,
        p_reason,
        p_source,
        p_user_id
    )
    RETURNING id INTO v_top_up_id;

    -- Actualiser le cycle
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

-- E. close_expense_cycle_atomic
CREATE OR REPLACE FUNCTION public.close_expense_cycle_atomic(
    p_org_id UUID,
    p_cycle_id UUID,
    p_recharge_source TEXT,
    p_user_id UUID,
    p_new_budget NUMERIC DEFAULT 100000.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cycle RECORD;
    v_summary JSONB;
    v_recharge NUMERIC;
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

    -- Calculer la recharge nécessaire : p_new_budget - solde restant
    -- Si le solde était négatif, la recharge mathématique est > p_new_budget pour combler le découvert
    v_recharge := GREATEST(0, p_new_budget - v_cycle.current_balance);

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
    -- Si la clôture a lieu le dimanche soir, le prochain cycle commence le lundi suivant
    IF EXTRACT(DOW FROM v_now) = 0 THEN
        v_new_start := date_trunc('week', v_now + INTERVAL '1 day');
    END IF;
    v_new_end := v_new_start + INTERVAL '7 days' - INTERVAL '1 millisecond';

    -- Ouvrir immédiatement le nouveau cycle avec le budget initial
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
        p_new_budget,
        p_new_budget,
        0.00,
        p_new_budget,
        'active'
    )
    RETURNING id INTO v_new_cycle_id;

    RETURN jsonb_build_object(
        'success', true,
        'closed_cycle_id', p_cycle_id,
        'recharge_amount', v_recharge,
        'recharge_source', p_recharge_source,
        'new_cycle_id', v_new_cycle_id,
        'summary', v_summary
    );
END;
$$;
