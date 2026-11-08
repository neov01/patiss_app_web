-- ============================================================
-- Opération ponctuelle (PAS une migration) : remise à zéro de la régie
-- dépenses de CAKE DESIGNER 2 BABI au lundi 9 novembre 2026.
-- Spec : docs/superpowers/specs/2026-11-08-bilan-hebdo-depenses-design.md §4.6
--
-- Ordre impératif :
--   1. Appliquer la migration 20261108000000_weekly_expense_bilan.sql
--   2. Lancer ce script AUSSITÔT (avant que quelqu'un ouvre l'écran Dépenses,
--      sinon la bascule automatique clôturera l'ancien cycle en « Bilan non fait »)
--
-- Rien n'est supprimé : dépenses, rallonges, transactions et justificatifs restent
-- consultables dans Archives (badge « Réinitialisé »).
-- ============================================================

-- ── ÉTAPE 1 : APERÇU (lancer seul, vérifier les chiffres) ───
SELECT
    o.id   AS organization_id,
    o.name AS organisation,
    c.id   AS cycle_id,
    c.start_date,
    c.end_date,
    c.total_allocated,
    c.total_spent,
    c.current_balance,
    (SELECT count(*) FROM public.expenses e
      WHERE e.cycle_id = c.id AND e.is_cancelled = FALSE) AS nb_depenses
FROM public.organizations o
JOIN public.expense_cycles c
  ON c.organization_id = o.id AND c.status = 'active'
WHERE o.name ILIKE '%CAKE DESIGNER 2%';

-- ── ÉTAPE 2 : REMISE À ZÉRO ─────────────────────────────────
-- Remplacer <ORG_ID> par l'organization_id affiché à l'étape 1.
DO $$
DECLARE
    v_org_id UUID := '<ORG_ID>';
    v_cycle RECORD;
    v_budget NUMERIC;
    v_closed INT := 0;
BEGIN
    SELECT COALESCE(weekly_expense_budget, 150000.00) INTO v_budget
    FROM public.organizations WHERE id = v_org_id;

    IF v_budget IS NULL THEN
        RAISE EXCEPTION 'Organisation % introuvable', v_org_id;
    END IF;

    -- Archiver le(s) cycle(s) actif(s) antérieur(s) au 9 novembre, sans recharge
    FOR v_cycle IN
        SELECT * FROM public.expense_cycles
        WHERE organization_id = v_org_id
          AND status = 'active'
          AND start_date < '2026-11-09T00:00:00Z'
        FOR UPDATE
    LOOP
        UPDATE public.expense_cycles
        SET status = 'closed',
            closed_at = NOW(),
            closed_by = NULL,
            recharge_amount = 0,
            recharge_source = 'reinitialisation',
            closure_summary = public.build_expense_cycle_summary(v_cycle.id)
                || jsonb_build_object(
                    'closing_type', 'reinitialisation',
                    'closed_at', NOW(),
                    'reason', 'Suivi interrompu depuis septembre — reprise au 09/11/2026'
                ),
            updated_at = NOW()
        WHERE id = v_cycle.id;
        v_closed := v_closed + 1;
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM public.expense_cycles
        WHERE organization_id = v_org_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Un cycle actif postérieur au 9 novembre existe déjà : vérifier avant de continuer.';
    END IF;

    -- Nouvelle semaine propre : lundi 9 nov. 00h00 → dimanche 15 nov. 23h59:59.999
    INSERT INTO public.expense_cycles (
        organization_id, start_date, end_date,
        initial_budget, total_allocated, total_spent, current_balance, status
    ) VALUES (
        v_org_id,
        '2026-11-09T00:00:00Z',
        '2026-11-15T23:59:59.999Z',
        v_budget, v_budget, 0.00, v_budget, 'active'
    );

    RAISE NOTICE 'Cycles archivés : %, nouvelle semaine ouverte à % FCFA', v_closed, v_budget;
END;
$$;
