# Story 1-1 — Création de commande complète (Gérant)

## Contexte

- Application SaaS multi-tenant pour pâtisseries/boulangeries (Pâtiss'App).
- Le gérant se connecte via `/login` (email + mot de passe Supabase) et est redirigé vers `/dashboard`, puis `/commandes`.
- La base de données suit le schéma défini dans `docs/ARCHITECTURE.md` :
  - `orders` (en-tête commande) avec `organization_id`, `customer_name`, `pickup_date`, `status`, `total_amount`, `deposit_amount`, etc.
  - `order_items` (lignes) liées à `orders` et `recipes`.
  - `recipes` avec `sale_price` utilisé pour le calcul du total.
- Multi-tenant : toutes les requêtes doivent filtrer sur `organization_id = profile.organization_id` avec RLS activé côté Supabase.

## Problème à résoudre

Le gérant doit pouvoir créer facilement une commande client complète depuis la page `Commandes`, avec :

- Saisie des informations client.
- Choix des produits (recettes) à partir du catalogue.
- Quantités, prix unitaires et calcul automatique du total.
- Acompte optionnel.
- Enregistrement en base (tables `orders` + `order_items`) avec statut initial `pending`.
- Actualisation immédiate de la liste des commandes et des KPI liés (dashboard).

## Objectif utilisateur (story)

> En tant que **gérant**, je veux **créer une commande client complète en quelques clics** afin de **suivre les commandes à venir, les acomptes et la production**, sans avoir à manipuler directement le back-office ou Supabase.

## Règles fonctionnelles

- Une commande doit contenir au minimum :
  - `customer_name` (obligatoire).
  - `pickup_date` (date + heure obligatoires).
  - Au moins un `order_item` (recette + quantité >= 1).
- `total_amount` est calculé côté serveur comme la somme de `quantity × unit_price` pour tous les items.
- `deposit_amount` est optionnel mais ne peut pas être négatif.
- Le statut initial est `pending`. Il évolue ensuite via les actions de changement de statut existantes (`pending` → `production` → `ready` → `completed`).
- La commande est toujours associée à l’`organization_id` du profil courant et au `created_by = auth.uid()`.

## Règles techniques / contraintes

- Utiliser un **Server Action** côté `lib/actions/orders.ts` pour la création, déjà typé et connecté à Supabase (`createOrder`).
- Ne jamais utiliser de `any` : typer les paramètres et résultats, et aligner les types avec `types/supabase.ts` lorsque possible.
- Respecter les patterns existants :
  - Client component `OrdersClient` pour la modale + interactions.
  - Page server `src/app/(dashboard)/commandes/page.tsx` pour charger `orders` et `recipes`.
  - Filtrage systématique par `organization_id` pour toutes les requêtes.
- UX mobile-first :
  - Formulaire dans une modale adaptée aux petits écrans (déjà en place).
  - Boutons avec hauteur minimale 44px.

## Acceptation (Criteria)

1. **Création basique**
   - Depuis la page `/commandes`, le gérant clique sur “Nouvelle commande”.
   - Il remplit :
     - Nom du client.
     - Contact (optionnel).
     - Date & heure de retrait.
     - Au moins un produit depuis la liste des recettes (avec quantité).
   - En soumettant le formulaire :
     - Une ligne est créée dans `orders` avec :
       - `organization_id` = organisation du profil,
       - `status` = `pending`,
       - `total_amount` calculé côté serveur,
       - `deposit_amount` = valeur saisie ou 0.
     - Les lignes correspondantes sont créées dans `order_items`.
   - La modale se ferme, un toast “Commande créée !” apparaît et la liste des commandes se met à jour.

2. **Validations**
   - Le formulaire refuse la soumission si :
     - `customer_name` est vide.
     - `pickup_date` est vide.
     - Aucun produit n’a été ajouté.
   - Si Supabase renvoie une erreur, un toast d’erreur s’affiche avec un message explicite.

3. **Sécurité / Multi-tenant**

   - La commande créée est uniquement visible pour l’organisation du gérant connecté (filtrage par `organization_id`).
   - Aucune donnée d’une autre organisation ne peut être créée ou lue via cette fonctionnalité.

4. **Intégration Dashboard**

   - Les revalidations de cache existantes (`revalidatePath('/commandes')`, `revalidatePath('/dashboard')`) s’exécutent après la création d’une commande.
   - Les totaux du jour sur le dashboard reflètent les nouvelles commandes après rechargement de la page.

## Notes pour les agents Dev / QA

- Respecter le style visuel pastel existant et la hiérarchie typographique.
- Prévoir des textes d’erreur clairs, en français.
- Les tests automatisés (plus tard) devront vérifier :
  - La création d’une commande valide.
  - Le refus de création sans items ou sans `pickup_date`.
  - Le bon calcul de `total_amount` en fonction des quantités et prix unitaires.

