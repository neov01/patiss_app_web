# Spécification Technique : Enveloppe Dépenses 150 000 FCFA & Budget Paramétrable par Établissement

- **Date** : 2026-09-17
- **Statut** : Validé (En attente de plan d'implémentation)
- **Auteur** : Antigravity & Équipe Pâtiss'App
- **Module** : Régie d'avances & Dépenses du quotidien (`/depenses`)

---

## 1. Contexte & Objectifs

Le module de gestion des dépenses opérationnelles et de la menue caisse mis en place le 16 septembre 2026 fonctionnait initialement avec une enveloppe hebdomadaire codée en dur à 100 000 FCFA.

Cette spécification formalise :
1. **L'augmentation du montant de base de l'enveloppe à 150 000 FCFA**.
2. **La mise à niveau immédiate du cycle hebdomadaire actif en production** (+50 000 FCFA alloués et ajoutés au solde restant).
3. **La personnalisation du budget hebdomadaire par établissement** : ajout d'un paramètre configurable au niveau de chaque organisation (`weekly_expense_budget`), initialisé à 150 000 FCFA.
4. **L'interface de gestion du budget** :
   - Une modale tactile accessible au Gérant et SuperAdmin depuis `/depenses`.
   - La possibilité lors d'une modification de choisir d'appliquer immédiatement le différentiel sur le cycle actif ou de l'appliquer au prochain cycle.
   - Un champ dédié dans la fiche organisation de l'espace SuperAdmin (`/admin`).

---

## 2. Architecture des Données & Base de Données

### 2.1 Nouvelle migration SQL : `supabase/migrations/20260917000000_update_weekly_expense_budget_150k.sql`

#### A. Évolution du schéma `organizations`
```sql
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS weekly_expense_budget NUMERIC(12,2) NOT NULL DEFAULT 150000.00;
```

#### B. Mise à jour des valeurs par défaut sur `expense_cycles`
```sql
ALTER TABLE public.expense_cycles ALTER COLUMN initial_budget SET DEFAULT 150000.00;
ALTER TABLE public.expense_cycles ALTER COLUMN total_allocated SET DEFAULT 150000.00;
ALTER TABLE public.expense_cycles ALTER COLUMN current_balance SET DEFAULT 150000.00;
```

#### C. Mise à niveau immédiate des cycles actifs en production
Les cycles actifs de la semaine en cours reçoivent le complément de 50 000 FCFA :
```sql
UPDATE public.expense_cycles
SET initial_budget = 150000.00,
    total_allocated = total_allocated + 50000.00,
    current_balance = current_balance + 50000.00,
    updated_at = NOW()
WHERE status = 'active';
```

#### D. Mise à jour de la RPC `get_or_create_active_expense_cycle`
La procédure stockée lit désormais en priorité le budget configuré sur l'organisation :
```sql
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

    -- 2. Déterminer le budget de référence (paramètre explicite > config organisation > 150 000)
    IF p_default_budget IS NOT NULL AND p_default_budget > 0 THEN
        v_budget := p_default_budget;
    ELSE
        SELECT COALESCE(weekly_expense_budget, 150000.00) INTO v_budget
        FROM public.organizations
        WHERE id = p_org_id;
        v_budget := COALESCE(v_budget, 150000.00);
    END IF;

    -- 3. Période hebdomadaire (Lundi 00h00 au Dimanche 23h59:59.999)
    v_start := date_trunc('week', v_now);
    v_end := v_start + INTERVAL '7 days' - INTERVAL '1 millisecond';

    -- 4. Création du cycle
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
```

#### E. Mise à jour de la RPC `close_expense_cycle_atomic`
Si `p_new_budget` est omis ou nul lors de la clôture, la RPC applique le `weekly_expense_budget` configuré de l'organisation.

#### F. Nouvelle RPC atomique `update_organization_expense_budget`
Permet la modification du budget cible avec ou sans répercussion immédiate sur le cycle en cours :
```sql
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

    -- 1. Lire et mettre à jour le budget de l'organisation
    SELECT weekly_expense_budget INTO v_old_budget
    FROM public.organizations
    WHERE id = p_org_id
    FOR UPDATE;

    UPDATE public.organizations
    SET weekly_expense_budget = p_new_budget,
        updated_at = NOW()
    WHERE id = p_org_id;

    -- 2. Répercussion éventuelle sur le cycle actif
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
```

---

## 3. Couche Métier & Server Actions (`src/lib/`)

### 3.1 Schémas Zod (`src/lib/schemas/expenses.ts`)
- Ajout du schéma `UpdateWeeklyBudgetSchema` :
  ```ts
  export const UpdateWeeklyBudgetSchema = z.object({
    new_budget: z.number().positive('Le budget doit être supérieur à 0 FCFA'),
    adjust_active_cycle: z.boolean().default(false),
  })
  export type UpdateWeeklyBudgetInput = z.infer<typeof UpdateWeeklyBudgetSchema>
  ```
- Mise à jour du fallback par défaut dans `CloseWeeklyCycleSchema` : `default(150000)`.

### 3.2 Server Actions (`src/lib/actions/expenses.ts`)
- Mise à jour de `getActiveExpenseCycleData()` :
  - Ne passe plus `p_default_budget: 100000.0` en dur, mais interroge la RPC en lui laissant résoudre le budget configuré de l'organisation.
  - Retourne également le `weekly_expense_budget` de l'organisation.
- Nouvelle action `updateOrganizationWeeklyBudgetAction(data: UpdateWeeklyBudgetInput)` :
  - Contrôle d'autorisation strict : `requireOrgRole(['gerant', 'super_admin'])`.
  - Exécute `update_organization_expense_budget`.
  - Revalide les chemins Next.js `/depenses` et `/admin`.

### 3.3 Server Actions Admin (`src/lib/actions/admin.ts`)
- Mise à jour de `updateOrganization(orgId, data)` pour accepter `weekly_expense_budget?: number`.

---

## 4. Expérience Utilisateur & Interface Frontend

### 4.1 Nouveau composant : `BudgetSettingsModal.tsx` (`src/components/depenses/`)
- Accessible aux rôles Gérant et SuperAdmin.
- Saisie via `TouchInput` du nouveau montant cible (défaut prérempli avec la valeur actuelle).
- Sélecteur clair / Switch tactile :
  - **Option 1** : *« Appliquer la différence immédiatement sur la semaine en cours »* (ex: +30 000 FCFA sur le solde restant si passage de 150k à 180k).
  - **Option 2** : *« Prendre effet à la prochaine clôture hebdomadaire »* (conserve le solde actuel de la semaine).
- Affichage de l'impact financier en temps réel avant validation.

### 4.2 Barre d'actions rapides : `QuickActionsBar.tsx`
- Ajout d'un bouton discret pour les Gérants et SuperAdmins :
  - Icône `SlidersHorizontal` ou `Settings`.
  - Libellé : `Budget régie` ou `Paramètres budget`.
  - Hauteur tactile 44px conforme aux standards tactiles.

### 4.3 Clôture hebdomadaire : `WeeklyClosingModal.tsx`
- Le placeholder et la valeur par défaut du budget suivant utilisent la valeur dynamique de l'organisation (avec fallback 150 000 au lieu de 100 000).

### 4.4 Panneau SuperAdmin : `AdminClient.tsx`
- Ajout du champ numérique *« Budget régie hebdomadaire (FCFA) »* dans le formulaire de détails de l'organisation.

### 4.5 En-tête et KPI : `DepensesClient.tsx` & `page.tsx`
- Textes et descriptions alignés sur « enveloppe hebdomadaire de 150 000 FCFA » (ou dynamique selon l'établissement).

---

## 5. Plan de Tests & Vérification

1. **Tests unitaires de domaine** :
   - Mise à jour de `src/lib/domain/expenses.test.ts` avec la valeur de référence de 150 000 FCFA.
   - Exécution de la suite de tests (`npm test` ou script vitest/jest).
2. **Vérification base de données Supabase** :
   - Application de la migration `20260917000000_update_weekly_expense_budget_150k.sql`.
   - Vérification que les cycles actifs existants ont bien vu leur solde et leur budget alloué passer à `+50 000 FCFA`.
3. **Vérification compilation & linting** :
   - `npm run build`
   - `npm run lint`
