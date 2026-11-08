# Bilan hebdomadaire de la régie dépenses — Plan d'implémentation

> Exécution : inline dans la session (pas de sous-agents). Spec : `docs/superpowers/specs/2026-11-08-bilan-hebdo-depenses-design.md`.

**Goal :** bilan hebdo intégré à la clôture de caisse du dimanche, bascule auto le lundi, dépenses du jour dans la clôture quotidienne, RPC de la régie sécurisées.

**Architecture :** une migration SQL (helper d'autorisation + RPC `weekly_expense_closing_atomic` + bascule auto dans `get_or_create_active_expense_cycle` + redéfinition sécurisée des RPC existantes) ; fonctions pures dans `src/lib/domain/expenses.ts` ; deux server actions (`getWeeklyBilanPreviewAction`, `weeklyExpenseClosingAction`) ; un composant partagé `WeeklyBilanSummary` utilisé par `SessionMaster` et `WeeklyClosingModal`.

**Tech :** Next.js server actions, Supabase (Postgres plpgsql, RLS), Vitest, Zod.

## Global Constraints

- Fuseau : UTC+0 (Africa/Abidjan) ; semaine = lundi 00h00 → dimanche 23h59:59.999.
- Jamais de montant, d'organisation ou d'auteur fourni par le client dans le bilan.
- RPC `SECURITY DEFINER` : `SET search_path = ''`, noms schéma-qualifiés, contrôle org/rôle dans le corps, `REVOKE ... FROM public, anon`.
- Contrôles tactiles 48px, libellés explicites, pas de dépendance à la couleur seule.
- Ne pas toucher aux fichiers commandes modifiés par l'utilisatrice.

---

### Task 1 : Fonctions pures + tests

**Files :** Create `src/lib/domain/expenses.ts` ; Modify `src/lib/domain/expenses.test.ts`.

**Produces :**
- `computeWeeklyRecharge(budget: number, currentBalance: number): number` → `max(0, budget − currentBalance)`
- `sumCashFromTransactions(txs: CashTx[], opts?: { includeOutflows?: boolean }): number` (même règle que `getActiveExpenseCycleData` : `payment_method === 'Espèces'` sinon `payment_details['Espèces']`)
- `isWeeklyClosingDue(cycleEndDate: string, now: Date): boolean` → `now >= début (UTC) du jour de end_date`
- `buildWeeklyBilan({ budget, currentBalance, netWeekCash })` → `{ recharge, toRemit, isCashSufficient }`

Steps : tests rouges → implémentation → `npx vitest run src/lib/domain/expenses.test.ts` vert.

### Task 2 : Migration SQL

**Files :** Create `supabase/migrations/20261108000000_weekly_expense_bilan.sql`.

- `public.assert_expense_actor(p_org_id uuid, p_user_id uuid, p_roles text[]) returns uuid` : service_role → retourne `p_user_id` ; sinon `auth.uid()` requis, `p_user_id` nul ou égal, profil actif de l'organisation avec rôle autorisé ; retourne l'acteur.
- CHECK `recharge_source` élargi : `non_enregistree`, `reinitialisation`.
- `get_or_create_active_expense_cycle` : contrôle (vendeur, gerant, super_admin, patissier) + bascule auto si `end_date < now()`.
- `weekly_expense_closing_atomic(p_org_id, p_cycle_id)` : voir spec §4.1 (fenêtre « dernier jour ou après », session ouverte, SORTIE_CAISSE, nouveau cycle lundi suivant).
- Redéfinition à l'identique + contrôle : `record_expense_atomic`, `cancel_expense_atomic`, `record_top_up_atomic` (vendeur, gerant, super_admin), `close_expense_cycle_atomic`, `update_organization_expense_budget` (gerant, super_admin).
- Grants : revoke public/anon, grant authenticated + service_role.

Vérif : relecture ; application locale si une base Supabase locale est disponible.

### Task 3 : Server actions + schéma

**Files :** Modify `src/lib/schemas/expenses.ts`, `src/lib/actions/expenses.ts`.

- `WeeklyClosingSchema = z.object({ cycle_id: uuid })`.
- `getWeeklyBilanPreviewAction()` → `{ success, preview?: WeeklyBilanPreview }` ; `WeeklyBilanPreview = { cycleId, startDate, endDate, isDue, budget, currentBalance, recharge, netWeekCash, toRemit, isCashSufficient, hasOpenSalesSession }`.
- `weeklyExpenseClosingAction(rawInput)` rôles vendeur/gerant/super_admin → RPC.
- `getActiveExpenseCycleData` : ajoute `previousBilanMissing` (dernier cycle clôturé avec `recharge_source = 'non_enregistree'`).
- Suppression de `closeWeeklyCycleAction` et `CloseExpenseCycleSchema` (plus utilisés).

### Task 4 : UI

**Files :** Create `src/components/depenses/WeeklyBilanSummary.tsx` ; Modify `SessionMaster.tsx`, `WeeklyClosingModal.tsx`, `DepensesClient.tsx`, `BudgetHeroGauge.tsx`, `QuickActionsBar.tsx`, `CycleArchiveDrawer.tsx`, `depenses/page.tsx`.

- `SessionMaster` : à l'ouverture de la confirmation, charge l'aperçu ; si `isDue`, affiche le résumé + « Valider le bilan et clôturer la journée » / « Clôturer la journée sans bilan ».
- `WeeklyClosingModal` : retire source + budget ; charge l'aperçu ; appelle `weeklyExpenseClosingAction`.
- `DepensesClient` : `canClose = rôle autorisé && isWeeklyClosingDue` ; bandeau « bilan non fait » à la place de la bannière cycle non clôturé.
- `CycleArchiveDrawer` : badges « Bilan non fait » / « Réinitialisé ».

### Task 5 : Bonus quotidien

**Files :** Modify `src/lib/actions/session-utils.ts` (+ affichage historique / statut).

- `metrics_snapshot.expenses = { total_day, count_day, envelope_balance }` ; ligne dans l'e-mail ; ligne dans l'historique des sessions.

### Task 6 : Vérification

`npx vitest run`, `npm run lint` (fichiers modifiés), `npm run build`, contrôle visuel si possible.

### Task 7 : Réinitialisation (opération ponctuelle, après confirmation)

Script SQL fourni, exécuté seulement après affichage des chiffres et accord explicite.
