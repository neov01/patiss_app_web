# Enveloppe Dépenses 150 000 FCFA & Budget Paramétrable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Augmenter l'enveloppe de menue caisse hebdomadaire à 150 000 FCFA (avec mise à niveau immédiate de +50 000 FCFA sur les cycles actifs), rendre le budget configurable par établissement dans `organizations` et offrir une modale tactile de gestion budgétaire pour les Gérants et SuperAdmins.

**Architecture:** 
- Migration SQL Supabase pour ajouter `organizations.weekly_expense_budget`, mettre à niveau les cycles actifs et déployer les RPC atomiques (`update_organization_expense_budget`, mise à jour de `get_or_create_active_expense_cycle` et `close_expense_cycle_atomic`).
- Server actions sécurisées (`updateOrganizationWeeklyBudgetAction`) avec validation Zod et vérification des rôles (`gerant`, `super_admin`).
- Interface tactile : nouveau composant `BudgetSettingsModal.tsx`, intégration dans `QuickActionsBar.tsx`, mise à niveau de `WeeklyClosingModal.tsx` et `AdminClient.tsx`.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (PostgreSQL, PL/pgSQL, RPC), Zod, Vitest, Tailwind CSS.

## Global Constraints
- Devise par défaut : FCFA (montant entier positif > 0).
- Valeur de référence : 150 000 FCFA.
- Tous les cycles actifs existants doivent recevoir +50 000 FCFA sur leur `total_allocated` et `current_balance`.
- Contrôles d'accès : modification du budget réservée aux rôles `gerant` et `super_admin`.
- UX Tactile : boutons et cibles tactiles de 44px-48px minimum.

---

### Task 1: Migration Supabase & Évolution BDD

**Files:**
- Create: `supabase/migrations/20260917000000_update_weekly_expense_budget_150k.sql`
- Supabase execution: via `execute_sql` MCP tool sur le projet actif `uwxljrdqrhubtoihmzcb`

**Interfaces:**
- Produces: 
  - Colonne `organizations.weekly_expense_budget NUMERIC(12,2) NOT NULL DEFAULT 150000.00`
  - RPC `update_organization_expense_budget(p_org_id UUID, p_new_budget NUMERIC, p_adjust_active_cycle BOOLEAN, p_user_id UUID)`
  - RPC mise à jour `get_or_create_active_expense_cycle(p_org_id UUID, p_default_budget NUMERIC)`
  - RPC mise à jour `close_expense_cycle_atomic(p_org_id UUID, p_cycle_id UUID, p_recharge_source TEXT, p_user_id UUID, p_new_budget NUMERIC)`

- [ ] **Step 1: Créer le fichier de migration SQL**
  Rédiger `supabase/migrations/20260917000000_update_weekly_expense_budget_150k.sql` avec :
  - L'ajout de colonne sur `organizations`.
  - La mise à jour des defaults sur `expense_cycles`.
  - La mise à niveau immédiate des cycles actifs (+50 000 FCFA au solde et total alloué).
  - Les versions mises à jour des RPC `get_or_create_active_expense_cycle` et `close_expense_cycle_atomic`.
  - La nouvelle RPC atomique `update_organization_expense_budget`.

- [ ] **Step 2: Appliquer la migration sur Supabase via MCP `execute_sql`**
  Exécuter le script SQL sur le projet actif `uwxljrdqrhubtoihmzcb`.

- [ ] **Step 3: Vérifier les cycles actifs et les colonnes en base**
  Vérifier via SQL que les cycles actifs ont bien leur `initial_budget` à 150 000, et `current_balance` augmenté de 50 000 FCFA.

- [ ] **Step 4: Commit**
  ```bash
  git add supabase/migrations/20260917000000_update_weekly_expense_budget_150k.sql
  git commit -m "feat(db): migration budget hebdo 150k et paramétrage par organisation"
  ```

---

### Task 2: Schémas Zod & Tests Unitaires de Domaine

**Files:**
- Modify: `src/lib/schemas/expenses.ts`
- Modify: `src/lib/domain/expenses.test.ts`

**Interfaces:**
- Consumes: `zod`
- Produces:
  - `UpdateWeeklyBudgetSchema`
  - `UpdateWeeklyBudgetInput`
  - `CloseExpenseCycleSchema` mis à jour avec default à 150000.

- [ ] **Step 1: Écrire les tests unitaires pour le nouveau schéma et le calcul de recharge à 150k**
  Dans `src/lib/domain/expenses.test.ts`, tester :
  - La validation de `UpdateWeeklyBudgetSchema` (montant > 0, booléen `adjust_active_cycle`).
  - Le calcul de recharge avec budget cible 150 000 FCFA (ex: solde 35k -> recharge 115k ; solde -8k -> recharge 158k).
  - Le default à 150 000 FCFA pour `CloseExpenseCycleSchema`.

- [ ] **Step 2: Lancer les tests pour vérifier l'échec initial**
  Run: `npm run test:unit`
  Expected: FAIL (types / schémas non définis).

- [ ] **Step 3: Implémenter les modifications dans `src/lib/schemas/expenses.ts`**
  Ajouter `UpdateWeeklyBudgetSchema`, exporter les types, et passer le default de `new_budget` à 150 000.

- [ ] **Step 4: Lancer les tests pour vérifier le passage au vert**
  Run: `npm run test:unit`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/schemas/expenses.ts src/lib/domain/expenses.test.ts
  git commit -m "feat(expenses): schémas zod et tests unitaires pour le budget 150k"
  ```

---

### Task 3: Server Actions Backend

**Files:**
- Modify: `src/lib/actions/expenses.ts`
- Modify: `src/lib/actions/admin.ts`

**Interfaces:**
- Consumes: `UpdateWeeklyBudgetSchema`, Supabase client, `requireOrgRole`
- Produces:
  - `updateOrganizationWeeklyBudgetAction(data: UpdateWeeklyBudgetInput)`
  - `getActiveExpenseCycleData()` étendu pour renvoyer `org_budget`
  - `updateOrganization()` dans `admin.ts` acceptant `weekly_expense_budget?: number`

- [ ] **Step 1: Ajouter `updateOrganizationWeeklyBudgetAction` dans `src/lib/actions/expenses.ts`**
  - Contrôle d'accès : `requireOrgRole(['gerant', 'super_admin'])`.
  - Validation du payload avec `UpdateWeeklyBudgetSchema.parse(data)`.
  - Appel RPC `update_organization_expense_budget`.
  - `revalidatePath('/depenses')`, `revalidatePath('/dashboard')`, `revalidatePath('/admin')`.

- [ ] **Step 2: Mettre à jour `getActiveExpenseCycleData` dans `src/lib/actions/expenses.ts`**
  - Récupérer `weekly_expense_budget` depuis `organizations`.
  - Appeler `get_or_create_active_expense_cycle` sans budget codé en dur à 100 000 (ou en lui passant le budget de l'org).
  - Renvoyer `org_weekly_budget: number` dans le retour de l'action.

- [ ] **Step 3: Mettre à jour `updateOrganization` dans `src/lib/actions/admin.ts`**
  - Ajouter `weekly_expense_budget?: number` dans le type du paramètre `data`.

- [ ] **Step 4: Valider le typecheck**
  Run: `npm run typecheck`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/actions/expenses.ts src/lib/actions/admin.ts
  git commit -m "feat(expenses): server actions pour le paramétrage du budget hebdomadaire"
  ```

---

### Task 4: Composants UI & Expérience Tactile

**Files:**
- Create: `src/components/depenses/BudgetSettingsModal.tsx`
- Modify: `src/components/depenses/QuickActionsBar.tsx`
- Modify: `src/components/depenses/WeeklyClosingModal.tsx`
- Modify: `src/components/depenses/BudgetHeroGauge.tsx`
- Modify: `src/components/depenses/DepensesClient.tsx`
- Modify: `src/components/admin/AdminClient.tsx`
- Modify: `src/app/(pâtisserie)/depenses/page.tsx`

**Interfaces:**
- Consumes: `updateOrganizationWeeklyBudgetAction`, `useCurrency`, `TouchInput`, Lucide icons.

- [ ] **Step 1: Créer le composant `BudgetSettingsModal.tsx`**
  - Modale tactile avec saisie du budget via `TouchInput`.
  - Toggle / Case à cocher : *« Répercuter la différence immédiatement sur la semaine en cours »*.
  - Calcul dynamique en temps réel du différentiel (+/- X FCFA) et impact sur le solde restant.
  - Boutons d'action tactiles 48px avec gestion des états de chargement (toast Sonner).

- [ ] **Step 2: Intégrer le bouton dans `QuickActionsBar.tsx`**
  - Ajouter le bouton *« Budget régie »* avec icône `SlidersHorizontal` (visible si `isGerantOrAdmin`).
  - Passer le callback `onOpenBudgetSettings`.

- [ ] **Step 3: Mettre à jour `WeeklyClosingModal.tsx`**
  - Utiliser la valeur dynamique `orgWeeklyBudget` ou `cycle.initial_budget` (fallback 150 000 au lieu de 100 000) comme placeholder et cible initiale.

- [ ] **Step 4: Mettre à jour `DepensesClient.tsx` et `BudgetHeroGauge.tsx`**
  - Intégrer `BudgetSettingsModal` et stocker `orgWeeklyBudget`.
  - Mettre à jour les sous-titres et fallbacks résiduels de 100 000 vers la valeur dynamique ou 150 000 FCFA.

- [ ] **Step 5: Ajouter le champ dans `AdminClient.tsx`**
  - Ajouter le champ *« Budget régie hebdomadaire (FCFA) »* dans la gestion des détails d'organisation pour le SuperAdmin.

- [ ] **Step 6: Mettre à jour la metadata dans `src/app/(pâtisserie)/depenses/page.tsx`**
  - Aligner la description de la page sur 150 000 FCFA.

- [ ] **Step 7: Valider le build et linting**
  Run: `npm run lint && npm run build`
  Expected: PASS sans erreur.

- [ ] **Step 8: Commit**
  ```bash
  git add src/components/depenses/ src/components/admin/AdminClient.tsx src/app/\(pâtisserie\)/depenses/page.tsx
  git commit -m "feat(depenses): interface tactile de gestion du budget hebdomadaire et adaptations 150k"
  ```

---

### Task 5: Documentation & Vérification Complète

**Files:**
- Modify: `PROJECT_SNAPSHOT.md`

- [ ] **Step 1: Mettre à jour `PROJECT_SNAPSHOT.md`**
  - Mettre à jour la ligne du module Dépenses pour refléter l'enveloppe par défaut à 150 000 FCFA et le paramétrage par organisation.

- [ ] **Step 2: Exécuter la suite complète de vérification**
  - `npm run test:unit`
  - `npm run typecheck`
  - `npm run build`
  - Vérifier par requête SQL Supabase que les données de production sont conformes.

- [ ] **Step 3: Commit final**
  ```bash
  git add PROJECT_SNAPSHOT.md
  git commit -m "docs: mise à jour du snapshot projet avec l'enveloppe dépenses 150k"
  ```
