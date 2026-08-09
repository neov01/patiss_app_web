# Suppression et audit des commandes — Design

Date : 2026-08-09
Statut : Validé par l'utilisateur, en attente de plan d'implémentation

## Contexte

Aujourd'hui, `deleteOrder` (`src/lib/actions/orders.ts:204`) supprime physiquement et immédiatement une commande, réservé aux rôles `gerant`/`super_admin`, sans laisser de trace d'audit. Objectif : permettre aussi au `vendeur` de supprimer une commande depuis la page Commandes, après confirmation, avec un commentaire obligatoire, une rétention de 30 jours avant suppression définitive, une possibilité de restauration pendant cette fenêtre, un impact correct sur le stock, et une page d'audit consultable facilement par `vendeur` et `gerant`.

## Décision d'architecture

Trois options ont été considérées pour stocker l'historique des suppressions :

1. Réutiliser la table générique `audit_logs` existante — écartée : sa policy RLS restreint la lecture à `gerant`/`super_admin`, et l'assouplir exposerait aussi les logs sensibles (transactions, profils) au `vendeur`.
2. Déplacer la commande dans une table d'archive dédiée (`deleted_orders`) — écartée : complique la restauration (reconstruction des relations : lignes, paiements).
3. **Retenue** : soft-delete via colonnes sur `orders` + nouvelle table `order_deletion_audit` dédiée à ce flux, avec sa propre policy RLS ouverte à `vendeur` + `gerant`, sans toucher à `audit_logs`.

## Modèle de données

### `orders` (colonnes ajoutées)

- `deleted_at timestamptz null`
- `deleted_by uuid null` (FK `profiles`)

Une commande supprimée reste dans `orders`, simplement exclue des requêtes normales via `WHERE deleted_at IS NULL`.

### Nouvelle table `order_deletion_audit`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid | pour le scoping RLS |
| `order_id` | uuid | **sans contrainte FK stricte** (doit survivre à la purge de la commande) |
| `order_reference` | text | numéro/label figé, pour affichage même après purge |
| `action` | text | `'delete' \| 'restore' \| 'purge'` |
| `performed_by` | uuid null | null pour une purge automatique (action système) |
| `performed_by_name` | text | nom figé au moment de l'action |
| `reason` | text not null | commentaire obligatoire (delete/restore) ; auto-rempli pour purge : *"Purge automatique après 30 jours"* |
| `order_snapshot` | jsonb | commande + lignes au moment de la suppression, pour affichage détaillé et restauration |
| `stock_adjustment` | jsonb | `{product_id: quantité}` recrédité en stock à la suppression, pour inversion exacte à la restauration |
| `created_at` | timestamptz | |

**RLS** : lecture pour `vendeur`, `gerant`, `super_admin` de la même organisation. Écriture uniquement via les fonctions serveur (RPC `SECURITY DEFINER`), comme pour `audit_logs`.

## Flux de suppression (soft delete)

Nouvelle action serveur `softDeleteOrder(orderId, reason)`, RPC atomique côté Postgres, sur le modèle des fonctions `*_atomic` déjà présentes dans le projet :

1. Vérifie le rôle (`vendeur`, `gerant`, `super_admin`) et la session de caisse ouverte (`requireOpenSalesSession`), comme l'action actuelle.
2. Rejette si `reason` est vide (après `trim()`).
3. Détecte si la commande a réellement décrémenté du stock : présence d'une transaction d'encaissement liée (seul `encaisser_atomic` décrémente le stock, jamais la création de commande). Si oui, pour chaque `order_item` avec `track_stock = true` et `from_inventory = true`, recrédite `products.current_stock` de la quantité correspondante (même logique que `delete_vente_rapide_atomic`, `20260623173000_delete_vente_rapide_atomic_rpc.sql`).
4. Enregistre dans `stock_adjustment` exactement ce qui a été recrédité.
5. Marque `orders.deleted_at = now()`, `deleted_by = utilisateur courant`. Les `transactions` et points fidélité liés ne sont **pas** touchés à ce stade — ils restent intacts pour permettre une restauration propre pendant les 30 jours.
6. Insère la ligne d'audit (`action = 'delete'`, `reason`, `order_snapshot`, `stock_adjustment`).

La suppression physique (transactions, points fidélité, ligne `orders`) n'a lieu qu'à la purge à J+30 (voir plus bas), jamais à cette étape.

## Flux de restauration

Nouvelle action serveur `restoreOrder(orderId, reason)` :

1. Vérifie le rôle (`vendeur`, `gerant`, `super_admin`).
2. Rejette si `reason` vide.
3. Vérifie que la commande est `deleted_at IS NOT NULL` et n'a pas encore été purgée ; sinon erreur explicite ("cette commande a été définitivement supprimée, restauration impossible").
4. Récupère `stock_adjustment` de la dernière ligne d'audit `action='delete'` de cette commande, et re-décrémente exactement ces quantités de `products.current_stock` (symétrique de l'étape 3 de la suppression).
5. Remet `orders.deleted_at = null`, `deleted_by = null`.
6. Insère une ligne d'audit (`action = 'restore'`, `reason`).

## Purge définitive (J+30, individuelle par commande)

Job planifié quotidien (`pg_cron` si disponible sur le projet Supabase ; sinon route API + Vercel Cron en secours — à trancher au moment du plan d'implémentation selon les extensions activées) exécutant `purge_expired_deleted_orders()` :

1. Sélectionne toutes les commandes où `deleted_at < now() - interval '30 jours'` — chaque commande est évaluée individuellement sur sa propre date de suppression, pas de purge groupée par lot.
2. Pour chacune, reproduit la logique de l'actuel `deleteOrder` : inverse les points fidélité liés aux `transactions`, supprime les `transactions`, supprime la ligne `orders` (cascade `order_items`).
3. Ne touche pas au stock (déjà traité définitivement à l'étape de suppression logique).
4. Insère une ligne d'audit `action = 'purge'`, `performed_by = null`, `reason = "Purge automatique après 30 jours"`, en conservant `order_reference` et `order_snapshot`.

La ligne d'audit survit à la purge (elle garde l'historique consultable même quand la commande n'existe plus), alors que la commande elle-même disparaît de `orders`.

## Page d'audit

Nouvel onglet "Historique des suppressions" sur la page Commandes, accessible à `vendeur` et `gerant`.

- **Liste** (cohérente visuellement avec `OrdersClient`) : Date/heure, Commande (référence + client), Action (badge Suppression/Restauration/Purge), Auteur, Montant, Commentaire (tronqué, cliquable), Statut (`Supprimée · purge dans Nj`, `Restaurée`, `Purgée définitivement`).
- **Filtres** : plage de dates, type d'action, auteur, recherche client/n° commande — filtrage côté client avec debounce, comme l'existant, pour rester fluide.
- **Détail dépliable** par ligne : contenu complet de la commande au moment de la suppression (`order_snapshot`).
- **Bouton Restaurer** sur les lignes "Suppression" encore dans la fenêtre des 30 jours et non restaurées/purgées, ouvrant la modale de commentaire de restauration.

## Confirmation et commentaire obligatoire

- Extension du composant `ConfirmModal` existant (`src/components/ui/ConfirmModal.tsx`) avec un champ commentaire (textarea) requis — bouton de confirmation désactivé tant que le champ est vide.
- Un composant unique `ConfirmModalWithReason` sert aux deux usages (suppression et restauration), remplaçant la modale de suppression actuellement codée en dur dans `OrdersClient.tsx`.

## Hors périmètre

- Pas de modification de la policy RLS de `audit_logs`.
- Pas de restockage/décrémentation pour les commandes n'ayant jamais été encaissées (pas de double comptage de stock).
- Pas d'action de restauration après la purge définitive (irréversible par design).
