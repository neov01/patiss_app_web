# Tableau de bord gérant : lisible, fiable et en direct

- **Date** : 2026-11-18
- **Statut** : validé en brainstorming, à relire avant le plan d'implémentation
- **Périmètre** : `/dashboard`, vue `gerant` et `super_admin` uniquement. Les vues `vendeur` et `patissier` ne changent pas.
- **Fichier principal** : `src/app/(pâtisserie)/dashboard/page.tsx`

## 1. Problème

Le tableau de bord ne répond pas à la question du gérant le matin : « qu'est-ce qui demande mon attention maintenant ? ». L'analyse du 2026-11-18 (desktop 1280×800 et mobile 375×812, organisation « test 2 ») relève :

**Visuel et UX**

1. Sur mobile, le premier chiffre (CA) n'apparaît qu'à mi-écran : salutation, session, « Nouvelle commande », sélecteur de période, filtre client et bouton « Filtrer » passent avant.
2. Fausses tendances : la carte CA affiche un badge ↗ « Aujourd'hui » qui ne compare rien ; les autres cartes affichent un « – » sans signification.
3. Grille déséquilibrée : 5 cartes sur une grille à 4 colonnes laissent « Pertes » seule sur une ligne, avec une icône ↗ (`TrendingUp`) pour des pertes.
4. États vides encombrants : « Aucun retrait » occupe un cadre pointillé de 180px ; « Retraits du jour 0 / 0 » est illisible quand rien n'est prévu.
5. Emoji utilisés comme icônes (👋 dans la salutation, 📊🏆📈💰 dans les suggestions de Croustik) alors que l'application utilise Lucide.

**Données**

6. « Pertes » additionne `inventory_logs.quantity_change` de tous les ingrédients, quelle que soit leur unité (g, L, pièce…), et affiche le total en « kg ».
7. Les modes de règlement affichent la valeur brute de `transactions.payment_method` : un « cash » apparaît alors que la caisse enregistre « Espèces », d'où un risque de deux lignes pour le même moyen.
8. `pendingDeposits` (acomptes en cours) et `readyCount` (commandes prêtes) sont calculés mais jamais affichés.

## 2. Objectifs

- Le gérant voit en moins de 5 secondes ce qui est urgent, le CA du jour et s'il est en avance ou en retard sur la veille.
- Aucun chiffre trompeur : chaque tendance compare deux valeurs réelles, chaque unité est juste.
- Des graphes qui se mettent à jour à chaque vente, sans nouvelle infrastructure ni nouvelle dépendance.

**Hors périmètre** : fuseaux horaires par organisation, vues vendeur et pâtissier, refonte de Croustik, nouvelle migration SQL.

## 3. Structure de la page (de haut en bas)

### 3.1 En-tête

- Titre « Bonjour, {prénom} », sans emoji. Sous-titre inchangé (date · organisation).
- À droite, inchangés : `SessionPill` et `DashboardNewOrderButton`.
- Indicateur « Actualisé toutes les 30 s · dernière mise à jour à HH:MM » (point vert plus texte, pas seulement la couleur). L'heure est celle du rendu serveur ; elle change à chaque rafraîchissement (voir 5.4).
- Les filtres se replient dans un seul bouton « Période : Aujourd'hui ▾ » qui ouvre un petit panneau : sélecteur de période (Aujourd'hui / 7 derniers jours / 30 derniers jours) et champ « Client ». Le changement de période s'applique immédiatement (navigation avec `?period=`), sans bouton « Filtrer ». Le champ client s'applique par Entrée. Les paramètres d'URL `period` et `client` restent les mêmes qu'aujourd'hui.

### 3.2 Bandeau « À faire maintenant »

Une rangée de pastilles cliquables (cibles tactiles de 44px minimum), chacune avec une icône Lucide, un libellé et un nombre. Une pastille n'apparaît que si sa valeur est non nulle :

| Pastille | Calcul (données existantes) | Lien |
|---|---|---|
| « N commande(s) prête(s) à retirer » | `readyCount` : statuts `ready`, `awaiting_pickup` | `/commandes` |
| « N retard(s) de retrait » | `overdueCount` (calcul actuel) | `/commandes` |
| « N ingrédient(s) sous le seuil » | `alertCount` (calcul actuel) | `/ingredients` |
| « X FCFA d'acomptes en cours » | `pendingDeposits` (calcul actuel) | `/commandes` |

Si toutes les valeurs sont nulles : une seule ligne neutre « Rien d'urgent pour le moment ». Le bandeau d'alerte stock actuel (rouge, sous les cartes) est supprimé, remplacé par la pastille.

### 3.3 Quatre cartes indicateurs

Grille de 4 colonnes en desktop, 2×2 sur mobile. Le composant `StatCard` est conservé ; le badge de tendance n'est affiché que lorsqu'une vraie comparaison existe.

1. **CA ({période})** : valeur actuelle. En période « Aujourd'hui » uniquement, badge « +18 % vs hier à la même heure » (ou « −12 % »), calculé sur le CA d'hier entre 00:00 et l'heure courante. Pas de badge si hier vaut 0 à cette heure.
2. **Ventes** : nombre de ventes sur la période, sous-titre « Panier moyen : X FCFA » (CA ÷ nombre de ventes ; masqué si 0 vente). Une vente payée en plusieurs modes ne doit compter qu'une fois : vérifier pendant l'implémentation si un paiement fractionné crée plusieurs lignes `transactions`. Si oui, compter les valeurs distinctes de `reference_code` (ou d'`order_id` pour les commandes) ; sinon, compter les lignes.
3. **Retraits du jour** : « 2 retirés sur 5 ». Si aucun retrait n'est prévu : valeur « 0 » et sous-titre « Aucun retrait prévu », sans « 0 / 0 ».
4. **Pertes ({période})** : valeur en FCFA = somme de `|quantity_change| × ingredients.cost_per_unit` pour les logs `reason = 'waste'`. Sous-titre « N déclaration(s) ». Icône `TrendingDown` (et non `TrendingUp`). Si un ingrédient n'a pas de coût, sa perte compte dans les déclarations mais pas dans la valeur, et le sous-titre le précise (« dont N sans coût renseigné »).

La carte « Alertes stock » disparaît (déplacée dans le bandeau).

### 3.4 Graphes, ligne 1

- **CA cumulé aujourd'hui vs hier** (deux tiers de la largeur en desktop).
- **Modes de règlement** en anneau (un tiers).

### 3.5 Graphes, ligne 2

- **Ventes par heure** (moitié).
- **Top 5 produits** (moitié).

Sur mobile, tous les graphes s'empilent sur une colonne.

### 3.6 Retraits & Livraisons

Liste inchangée. L'état vide devient une seule ligne de texte (« Aucun retrait ou livraison prévu aujourd'hui »), sans cadre pointillé de 180px.

### 3.7 Croustik

Inchangé, sauf : icônes Lucide à la place des emoji dans les suggestions, et zone de conversation vide réduite. Le comportement de l'assistant ne change pas.

## 4. Les graphes

### 4.1 Principes communs

- SVG dessiné à la main, sans bibliothèque. Nouveau dossier `src/components/dashboard/charts/`.
- Couleurs tirées des tokens de `DESIGN.md` (terracotta pour aujourd'hui, `muted-ink` pour la référence). Les couleurs de marque des opérateurs (Orange, Wave, MTN, Moov) déjà utilisées sur la page sont conservées pour l'anneau.
- Accessibilité : chaque graphe a un titre, un `role="img"` avec un `aria-label` qui résume la donnée (par exemple « CA cumulé : 12 500 FCFA à 11h, contre 10 600 FCFA hier à la même heure »), et les valeurs clés sont écrites en clair. Aucune information ne repose sur la seule couleur (trait plein ou pointillé, libellés).
- Chiffres en `tabular-nums`. Montants formatés `fr-FR` suivis de la devise de l'organisation.
- Chaque titre indique sa période (« aujourd'hui » ou la période choisie).
- État vide propre à chaque graphe (une ligne de texte), jamais un graphe vide sans explication.

### 4.2 CA cumulé aujourd'hui vs hier (`CumulativeRevenueChart`, composant client)

- Axe horizontal : heures, de la première à la dernière heure d'activité observée sur les deux jours, bornées à 6h–22h par défaut.
- Série « aujourd'hui » : trait plein, arrêtée à l'heure courante, avec un point final et son montant.
- Série « hier » : trait pointillé, sur toute la journée.
- Survol ou toucher : info-bulle avec l'heure, le cumul d'aujourd'hui et celui d'hier. C'est le seul composant client parmi les graphes.
- Cette carte suit toujours « aujourd'hui », quelle que soit la période choisie.

### 4.3 Modes de règlement (`PaymentDonut`)

- Anneau avec le total au centre et une légende : nom, montant, pourcentage.
- Normalisation d'affichage : `cash`, `especes`, `espèces` (insensible à la casse) → « Espèces ». Les autres valeurs restent telles quelles. Les montants des clés normalisées sont additionnés.
- Suit la période choisie. Remplace le widget actuel à barres.

### 4.4 Ventes par heure (`HourlySalesBars`)

- Barres horizontales, une par heure ayant au moins une vente aujourd'hui : heure, nombre de ventes, montant.
- L'heure en cours est mise en évidence et marquée « en cours ».
- Suit toujours « aujourd'hui ».

### 4.5 Top 5 produits (`TopProductsList`)

- Rang, nom, quantité vendue, montant, barre proportionnelle à la quantité.
- Source : `transaction_items` (champs `name`, `quantity`, `subtotal` ou `quantity × unit_price` si `subtotal` est nul) joints aux transactions de la période.
- Suit la période choisie.

## 5. Données

Tout est calculé côté serveur dans `page.tsx` (ou un helper dédié `src/lib/dashboard/metrics.ts` pour garder la page lisible), avec le client Supabase de l'utilisateur, donc sous RLS. Les composants de graphe reçoivent des tableaux simples et ne font aucune requête.

### 5.1 Requêtes

| Besoin | Requête | Filtres |
|---|---|---|
| Courbe, barres horaires, comparaison vs hier | `transactions` : `amount, created_at, payment_method` | `organization_id`, `deleted_at is null`, `is_historical = false`, `created_at >= début d'hier` |
| Anneau, carte Ventes | même source, restreinte à la période | idem, `created_at >= startDate` |
| Top produits | `transaction_items` : `name, quantity, unit_price, subtotal, transactions!inner(created_at, organization_id, deleted_at)` | jointure filtrée sur l'organisation, la période et `deleted_at is null` |
| Pertes en FCFA | `inventory_logs` : `quantity_change, reason, ingredients(cost_per_unit)` | `organization_id`, `reason = 'waste'`, `log_date >= startDate` |

La requête `transactions` actuelle est élargie (début d'hier au lieu de `startDate` en période « Aujourd'hui ») pour servir à la fois la comparaison et la période. En période 7 ou 30 jours, elle part de `min(startDate, début d'hier)`.

### 5.2 Fuseau horaire

Les tranches horaires et les bornes de journée suivent la convention actuelle de l'application (heure UTC, identique à l'heure de Côte d'Ivoire). Le découpage est centralisé dans une seule fonction pour pouvoir passer plus tard à un fuseau par organisation. Limite connue : pour une organisation hors UTC+0, les tranches seraient décalées.

### 5.3 Cohérence du CA

La carte CA s'appuie aujourd'hui sur le RPC `get_daily_metrics` (`ca_encaisse`) ; la courbe s'appuie sur la somme des `transactions`. Le point final de la courbe doit égaler la carte. Pendant l'implémentation, comparer les deux sur « test 2 » :

- s'ils sont égaux, garder le RPC pour la carte ;
- s'ils diffèrent (remboursements, acomptes, ventes historiques), **ne pas trancher seul** : présenter l'écart à l'utilisateur et choisir avec lui la source commune avant de modifier la carte.

### 5.4 Actualisation (décision du 2026-11-18)

Le temps réel Supabase n'est pas actif en production : la publication `supabase_realtime` ne contient aucune table, donc `RealtimeSync` ne reçoit jamais d'événement (constaté avec une vente test sur « test 2 »).

Décision : pas de migration. Le composant client `DashboardAutoRefresh` appelle `router.refresh()` toutes les 30 secondes quand l'onglet est visible, et immédiatement au retour sur l'onglet si la dernière actualisation date de plus de 30 secondes. Décalage maximal : 30 secondes. Le composant client de la courbe doit conserver son état de survol sans erreur quand ses props changent.

Activer le vrai temps réel reste possible plus tard (ajout de `transactions` et `orders` à la publication, anti-rebond dans `RealtimeSync`, abonnement limité aux écrans qui en ont besoin) : coût Supabase nul au volume actuel, mais changement de base de production et rafraîchissement de tous les écrans ouverts à chaque événement.

## 6. Gestion des erreurs et cas limites

- Requête en échec : le widget concerné affiche « Données indisponibles », les autres restent affichés. Pas de plantage de page.
- Journée sans vente : courbe « aujourd'hui » plate à 0 avec le message « Aucune vente pour le moment » ; la courbe d'hier reste visible si elle existe.
- Hier sans vente : pas de série pointillée ni de badge de comparaison.
- Filtre client actif : les graphes basés sur les transactions ne sont pas filtrables par client de façon fiable (`client_name` est libre). Quand un filtre client est actif, les graphes affichent « Graphes non filtrés par client » sous leur titre plutôt que des chiffres trompeurs.
- Montants négatifs (remboursements) : comptés tels quels dans les cumuls ; la courbe peut redescendre.

## 7. Vérification

- `npm run lint` sans nouvelle erreur, typage `tsc --noEmit` propre sur les fichiers touchés.
- Contrôle navigateur sur « test 2 », desktop 1280×800 et mobile 375×812 :
  - le premier chiffre est visible sans défiler sur mobile ;
  - après une vente test en caisse, la courbe, les barres, le top produits, l'anneau et l'heure de mise à jour changent en moins de 30 secondes sans recharger la page ;
  - le point final de la courbe égale la carte CA (voir 5.3) ;
  - aucune ligne « cash » séparée d'« Espèces » ;
  - états vides : organisation sans vente du jour.
- Fonctions de calcul pures (cumul horaire, normalisation des modes, valeur des pertes, comparaison vs hier) isolées dans `src/lib/dashboard/metrics.ts` pour être testables.

## 8. Fichiers prévus

- Modifié : `src/app/(pâtisserie)/dashboard/page.tsx`
- Modifié : `src/components/dashboard/AIAssistant.tsx` (icônes des suggestions uniquement)
- Nouveaux : `src/lib/dashboard/metrics.ts`, `src/components/dashboard/charts/CumulativeRevenueChart.tsx`, `PaymentDonut.tsx`, `HourlySalesBars.tsx`, `TopProductsList.tsx`, `src/components/dashboard/DashboardPeriodFilter.tsx`, `src/components/dashboard/TodoStrip.tsx`
- Inchangés : `StatCard` (utilisé sans badge quand il n'y a pas de comparaison), `RealtimeSync`, schéma Supabase.
