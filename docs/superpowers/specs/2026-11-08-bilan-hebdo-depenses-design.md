# Bilan hebdomadaire de la régie dépenses — Spec de conception

Date : 2026-11-08
Statut : en attente de relecture

## 1. Contexte

La régie dépenses fonctionne comme un **fonds fixe** de 150 000 FCFA par semaine (lundi 00h00 → dimanche 23h59).

Fonctionnement réel en boutique (validé avec la propriétaire) :

- Chaque lundi, l'enveloppe dépenses contient **150 000 FCFA**.
- Si elle ne suffit pas en cours de semaine, une **rallonge** est prélevée dans les espèces de la caisse (déjà géré par `record_top_up_atomic`).
- Les espèces des ventes **restent dans le tiroir toute la semaine**.
- **Dimanche soir**, au bilan, les caissières prennent dans le tiroir de quoi remettre l'enveloppe à 150 000 (`recharge = 150 000 − reste de l'enveloppe`), puis remettent le reste des espèces à la gérante.
- La boutique est ouverte **tous les dimanches**.

Problèmes actuels :

1. La clôture hebdomadaire est réservée à `gerant`/`super_admin` côté serveur (`closeWeeklyCycleAction`), mais le bouton « Clôturer maintenant » de la bannière est affiché aux vendeurs → « Accès refusé ».
2. La clôture est purement comptable : la recharge prélevée dans le tiroir **n'est enregistrée nulle part** en caisse. Les recettes espèces de la semaine sont surévaluées du montant de la recharge.
3. Si personne ne clôture, le cycle reste actif indéfiniment. C'est le cas depuis la semaine du 14 au 20 septembre : les saisies se sont arrêtées et le solde affiché (46 330 FCFA) est faux.
4. Les RPC `SECURITY DEFINER` de la régie (`close_expense_cycle_atomic`, `get_or_create_active_expense_cycle`, `record_expense_atomic`, `record_top_up_atomic`, `update_organization_expense_budget`) ne vérifient ni l'organisation ni le rôle de l'appelant, et sont exécutables par tout utilisateur `authenticated`.

## 2. Objectifs

- Le bilan hebdomadaire se fait **au moment de la clôture de caisse du dimanche**, par la caissière, en un geste.
- La recharge est **enregistrée comme une sortie d'espèces** dans la session de caisse du dimanche.
- La semaine ne peut plus rester bloquée : **bascule automatique le lundi** si le bilan n'a pas été fait.
- Chaque clôture de caisse quotidienne affiche les **dépenses du jour** et le **solde de l'enveloppe**.
- Repartir sur une base propre le **lundi 9 novembre 2026**.

## 3. Hors périmètre (reporté)

- Fermeture exceptionnelle le dimanche, congés de plusieurs jours : à traiter plus tard.
- Écran « Bilan de la semaine dernière » bloquant à l'ouverture du lundi.
- Régularisation d'une recharge non enregistrée après une bascule automatique.
- Comptage physique du tiroir / écart de caisse.

## 4. Conception

### 4.1 RPC `weekly_expense_closing_atomic` (nouvelle)

Remplace l'usage de `close_expense_cycle_atomic` depuis l'interface. Une seule transaction SQL :

1. **Autorisation** : `auth.uid()` non nul, `get_user_organization_id() = p_org_id`, `get_user_role() IN ('vendeur','gerant','super_admin')`. L'auteur est `auth.uid()` (pas de `p_user_id` fourni par le client).
2. Verrouiller le cycle actif de l'organisation (`FOR UPDATE`). Absent → erreur « Aucune semaine active à clôturer ».
3. Exiger une session de caisse **ouverte** pour l'organisation. Absente → erreur « Ouvrez la caisse pour faire le bilan de la semaine ».
4. Lire le budget cible : `organizations.weekly_expense_budget` (défaut 150 000). Le client ne fournit pas le montant.
5. `recharge = GREATEST(0, budget − current_balance)`.
6. Si `recharge > 0` : insérer une transaction `SORTIE_CAISSE` de `−recharge` en `Espèces`, libellé « Recharge enveloppe dépenses — semaine du JJ/MM », même format que `record_top_up_atomic`.
7. Clôturer le cycle : `status = 'closed'`, `closed_by`, `closed_at`, `recharge_amount`, `recharge_source = 'ventes_hebdo'`, `closure_summary` (inchangé + `closing_type = 'bilan_caisse'`, `recharge_transaction_id`, `sales_session_id`).
8. Ouvrir le cycle suivant : début = **lundi 00h00 suivant** l'instant de clôture (dimanche soir → lendemain), fin = dimanche 23h59:59.999, `initial_budget = total_allocated = current_balance = budget`.
9. Retourner : cycle clôturé, recharge, id de transaction, nouveau cycle.

Doublons : le verrou sur le cycle + l'index unique « un seul cycle actif » empêchent un double bilan (double tap).

Pas de blocage si les espèces de la semaine sont inférieures à la recharge : on affiche un avertissement côté interface (voir 4.2), on n'empêche pas.

`close_expense_cycle_atomic` reste en base mais n'est plus appelée par l'interface ; elle reçoit les mêmes contrôles d'autorisation (4.5).

### 4.2 Étape « Bilan de la semaine » dans la clôture de caisse

Point d'entrée : la confirmation de clôture de `SessionMaster` (`src/components/layout/SessionMaster.tsx`).

Quand la caissière clôture la caisse **un dimanche** (fuseau Africa/Abidjan, UTC+0) **et** que le cycle actif se termine ce dimanche :

- La fenêtre de confirmation affiche une étape « Bilan de la semaine » avant la clôture de la journée :
  - Reste dans l'enveloppe : `current_balance`
  - Recharge à prélever dans le tiroir : `recharge`
  - Espèces nettes de la semaine (estimation) : somme des montants `Espèces` (ventes moins sorties) depuis `start_date` du cycle
  - À remettre à la gérante (estimation) : espèces nettes − recharge
  - Avertissement si espèces nettes < recharge.
- Bouton principal (48px) : **« Valider le bilan et clôturer la journée »** → appelle `weeklyExpenseClosingAction`, puis `closeCurrentSession`. La sortie de recharge est ainsi incluse dans les totaux de la session du dimanche.
- Bouton secondaire : « Clôturer la journée sans bilan » → clôture simple ; la bascule automatique du lundi prendra le relais (4.3).
- Si le bilan réussit mais la clôture de caisse échoue : la session reste ouverte avec la sortie enregistrée ; la caissière relance la clôture. Le bilan n'est pas rejoué (le cycle est déjà clôturé).

Les autres jours, la clôture de caisse est inchangée.

Écran Dépenses :

- La bannière « Clôturer maintenant » et le bouton « Clôture hebdomadaire » ouvrent le même bilan (même action serveur), accessibles à `vendeur`, `gerant`, `super_admin`.
- Le choix « ventes / apport externe / mixte » de `WeeklyClosingModal` est retiré : la recharge vient toujours du tiroir.
- Le budget de la semaine suivante n'est plus saisi dans ce modal ; il reste réglable par le gérant via le paramétrage existant (`update_organization_expense_budget`).

### 4.3 Bascule automatique (filet de sécurité)

Dans `get_or_create_active_expense_cycle` : si le cycle actif a `end_date < now()` :

1. Le clôturer avec `recharge_amount = 0`, `recharge_source = 'non_enregistree'` (nouvelle valeur autorisée par la contrainte CHECK), `closed_by = NULL`, `closure_summary.closing_type = 'auto'`.
2. Créer le cycle de la semaine courante (lundi 00h00 de la semaine de `now()`).

Effets visibles :

- Archives : badge « Bilan non fait — recharge non enregistrée » pour ces cycles.
- Écran Dépenses, pendant la semaine suivante : bandeau d'information non bloquant « Le bilan de la semaine dernière n'a pas été fait ». La régularisation est hors périmètre.

La bannière jaune actuelle « cycle non clôturé » disparaît : un cycle dépassé ne peut plus exister au chargement.

### 4.4 Bonus quotidien : dépenses dans la clôture de caisse

Dans `closeSingleSession` (`src/lib/actions/session-utils.ts`) :

- Calculer, pour l'organisation : dépenses non annulées créées depuis `opened_at` (total + nombre) et `current_balance` du cycle actif.
- Les stocker dans `metrics_snapshot.expenses = { total_day, count_day, envelope_balance, cycle_id }`.
- Les afficher dans l'e-mail de clôture et dans l'historique / statut de caisse : « Dépenses du jour : X FCFA (N achats) — Solde enveloppe : Y FCFA ».

Lecture seule ; aucune écriture sur la régie.

### 4.5 Sécurisation des RPC de la régie

Ajouter en tête de chaque RPC `SECURITY DEFINER` de la régie le contrôle :

- `auth.uid()` non nul,
- `get_user_organization_id() = p_org_id`,
- rôle autorisé selon la fonction :
  - `get_or_create_active_expense_cycle` : `vendeur`, `gerant`, `super_admin`, `patissier` (aligné sur `getActiveExpenseCycleData`) ;
  - dépense, rallonge, bilan hebdo : `vendeur`, `gerant`, `super_admin` ;
  - `update_organization_expense_budget`, `close_expense_cycle_atomic` : `gerant`, `super_admin`.
- L'auteur (`created_by` / `closed_by`) est `auth.uid()`. Si un `p_user_id` est fourni et diffère de `auth.uid()` → erreur (même schéma que `20260823230000_transactions_follow_order_soft_delete.sql`).

Exception : la bascule automatique (4.3) s'exécute dans `get_or_create_active_expense_cycle`, appelée par un utilisateur authentifié de l'organisation ; elle reste donc couverte par le même contrôle.

### 4.6 Réinitialisation unique (lundi 9 novembre 2026)

Opération de données ponctuelle, **pas une migration**, limitée à l'organisation CAKE DESIGNER 2 BABI (identifiant confirmé avant exécution) :

1. Afficher à la propriétaire le cycle actif concerné (dates, 26 dépenses, total, solde) avant toute écriture.
2. Clôturer ce cycle : `recharge_amount = 0`, `recharge_source = 'reinitialisation'` (nouvelle valeur CHECK), `closure_summary.closing_type = 'reinitialisation'`, `closure_summary.reason = 'Suivi interrompu depuis septembre — reprise au 09/11/2026'`.
3. Créer le cycle du **lundi 9 novembre 2026 00h00 au dimanche 15 novembre 23h59:59.999** à 150 000.
4. Aucune suppression : dépenses, rallonges, transactions et justificatifs sont conservés et restent consultables dans Archives (badge « Réinitialisé »).

## 5. Fichiers concernés

- Nouvelle migration : `weekly_expense_closing_atomic`, contrôles d'autorisation des RPC de la régie, bascule auto dans `get_or_create_active_expense_cycle`, valeurs CHECK `non_enregistree` et `reinitialisation`.
- `src/lib/actions/expenses.ts` : `weeklyExpenseClosingAction` (rôles `vendeur`/`gerant`/`super_admin`), retrait de l'usage de `closeWeeklyCycleAction`, données du bilan (espèces nettes de la semaine).
- `src/lib/schemas/expenses.ts` : schéma Zod du bilan (aucun montant fourni par le client).
- `src/lib/domain/expenses.ts` (nouveau ; `expenses.test.ts` existe déjà à côté) : fonctions pures de calcul (recharge, espèces nettes, détection « dimanche + fin de cycle »).
- `src/components/layout/SessionMaster.tsx` : étape « Bilan de la semaine » le dimanche.
- `src/components/depenses/WeeklyClosingModal.tsx`, `DepensesClient.tsx`, `BudgetHeroGauge.tsx`, `QuickActionsBar.tsx` : bilan accessible aux vendeurs, suppression du choix de source, bandeau « bilan non fait ».
- `src/components/depenses/CycleArchiveDrawer.tsx` : badges « Bilan non fait » / « Réinitialisé ».
- `src/lib/actions/session-utils.ts` : dépenses du jour dans `metrics_snapshot` et l'e-mail.
- Affichage historique / statut de caisse : ligne dépenses du jour.

## 6. Vérification

- Tests unitaires (Vitest, dans `src/lib/domain/expenses.test.ts`) : calcul recharge (reste positif, nul, négatif/découvert), espèces nettes, détection « dimanche + fin de cycle ».
- Tests SQL manuels en local : bilan sans session ouverte → refus ; vendeur d'une autre organisation → refus ; double appel → un seul cycle créé, une seule transaction ; bascule auto sur un cycle dépassé.
- `npm run lint`, `npm run build`.
- Vérification visuelle : clôture de caisse un dimanche (date simulée) avec un compte vendeur ; écran Dépenses vendeur ; Archives.

## 7. Risques

- **Argent** : la sortie `SORTIE_CAISSE` de recharge modifie les totaux espèces de la session du dimanche. C'est l'effet voulu, à expliquer aux caissières (« le tiroir affiche la recharge comme une sortie »).
- **Fuseau horaire** : la logique « dimanche » côté interface et `date_trunc('week')` côté SQL supposent UTC+0 (Abidjan). À revoir si une organisation hors UTC+0 utilise la régie.
- **Ordre des appels** : bilan puis clôture de caisse sont deux appels distincts ; l'état intermédiaire (bilan fait, caisse ouverte) est valide et récupérable.
