# AGENTS.md

Consignes pour les agents IA qui travaillent dans ce dépôt.

## Projet

Pâtiss'App est une application opérationnelle Next.js + Supabase pour les pâtisseries. Les zones les plus sensibles sont la caisse, les paiements, les sessions, les commandes, le stock, la synchronisation hors ligne, l'authentification, les frontières multi-tenant entre organisations, ainsi que le comportement Supabase RLS/RPC.

Par défaut, communiquer avec l'utilisateur en français, sauf demande explicite contraire.

## Fichiers à Lire En Premier

Avant de modifier du code, récupérer le contexte avec le plus petit ensemble de fichiers pertinent.

Pour comprendre le dépôt dans son ensemble, commencer par :

- `Andrej_Karpathy.md`
- `README.md`
- `DESIGN.md`
- `GEMINI.md`
- `PROJECT_SNAPSHOT.md`
- `docs/ARCHITECTURE.md` si le fichier existe
- `package.json`

Pour les changements structurels ou les changements qui traversent plusieurs modules, consulter aussi Graphify :

- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`
- `graphify-out/manifest.json`

Utiliser le graphe pour identifier les dépendances probables, puis confirmer avec une recherche littérale dans le code avant de supprimer ou modifier un comportement partagé.

## Principes De Fonctionnement

- Inspecter le code existant avant de proposer ou modifier quoi que ce soit.
- Préférer les conventions déjà présentes dans le dépôt plutôt que créer de nouvelles abstractions.
- Garder les modifications ciblées sur la demande de l'utilisateur.
- Ne pas faire de refactorisation sans rapport pendant la correction d'un bug.
- Ne pas annuler les changements de l'utilisateur sans demande explicite.
- Traiter l'argent, le stock, l'authentification, les sessions, les frontières d'organisation et la synchronisation hors ligne comme des zones à haut risque.
- En cas d'incertitude sur une décision produit ou base de données risquée, faire une pause et expliquer le compromis avant d'agir.
- Utiliser `rg` / `rg --files` pour chercher dans le code.
- Utiliser `apply_patch` pour les modifications manuelles de fichiers.

## Contexte Supabase Local

Le dépôt contient un dossier `supabase/` avec des migrations, des métadonnées temporaires de liaison et plusieurs RPC critiques pour la caisse, les commandes, l'IA financière et la sécurité multi-tenant.

Points d'attention locaux :

- Vérifier avec soin les migrations qui touchent l'encaissement atomique, les transactions, les sessions, les commandes et les contrôles d'accès.
- Se méfier des fonctions SQL sensibles comme celles liées à `encaisser_atomic`, à la création de commandes, aux sessions de caisse et au contexte financier IA.
- Considérer toute information de projet ou de liaison Supabase stockée dans le repo comme potentiellement obsolète tant qu'elle n'a pas été revérifiée.

## Règles De Sécurité Et De Données

- Ne jamais faire confiance aux IDs d'organisation, rôles, prix, totaux, états de paiement ou mouvements de stock fournis par le client.
- Préférer la résolution serveur de l'organisation et de la session via les helpers d'authentification existants.
- Préserver les hypothèses RLS, mais garder en tête que les clients service-role et les fonctions `SECURITY DEFINER` peuvent contourner le RLS normal.
- Pour les RPC qui touchent à l'argent, au stock, aux sessions ou aux données tenant, vérifier l'autorisation dans la fonction SQL ou via un wrapper serveur fiable.
- Éviter de journaliser des données sensibles liées aux clients, employés, tokens ou paiements.
- Traiter les flux kiosk et hors ligne comme sensibles, car ils peuvent fonctionner avec un contexte de session plus faible.

## Frontend Et UX

Suivre `DESIGN.md` pour le langage visuel.

L'application est un outil opérationnel, pas un site marketing :

- Garder les interfaces denses mais lisibles pour un usage quotidien répété.
- Préserver les contrôles tactiles de 48px lorsque l'interface est pensée pour le tactile.
- Utiliser des libellés, icônes et textes de statut clairs ; ne pas dépendre uniquement de la couleur.
- Éviter les redesigns décoratifs sauf demande explicite d'exploration visuelle.
- Pour les écrans caisse et kiosk, prioriser la vitesse, la clarté et la réduction du risque d'erreur.
- Après un changement frontend significatif, lancer l'application et inspecter l'écran concerné quand c'est possible.

## Format De Revue Et D'Audit

Quand l'utilisateur demande une review, un audit, "voir si tout est correct" ou un "rapport detaille et exploitable", adopter une posture de revue de code et de risque produit.

Ordre par défaut du rapport en français :

1. `Resume`
2. `Bugs critiques`
3. `Ameliorations prioritaires`
4. `Fonctionnalites manquantes`
5. `Analyse de la qualite du code`
6. `Optimisations des performances`
7. `Analyse de securite`
8. `Plan d'action`

Pour chaque bug ou risque, inclure :

- Sévérité : `Critique`, `Eleve`, `Moyen` ou `Faible`
- Fichiers ou migrations concernés
- Chemin de reproduction quand applicable
- Impact
- Cause racine
- Remédiation concrète

Prioriser :

1. Problèmes cross-tenant et authentification
2. Exactitude de l'argent, du stock et des sessions
3. Perte de données ou échecs de synchronisation hors ligne
4. Risques de sécurité et contournements RLS
5. Performance affectant la caisse ou les opérations quotidiennes
6. Maintenabilité et qualité du code

## Vérification

Choisir la vérification selon le risque et le périmètre.

Commandes utiles :

```bash
npm run lint
npm run build
npm run dev
```

Préférer une vérification ciblée pour les petits changements, et des contrôles plus larges pour les helpers partagés, l'authentification, la base de données ou les flux caisse.

Quand le build ou le lint échoue :

- Séparer les erreurs d'environnement/sandbox des vrais problèmes de code.
- Rapporter clairement les blocages exacts.
- Ne pas présenter une dette lint globale connue comme si elle venait du changement en cours.

## Git Et Livraison

- Vérifier l'état du working tree avant les commits ou les gros changements.
- Ne pas amender de commit sauf demande explicite.
- Ne pas utiliser de commandes git destructives sauf demande explicite de l'utilisateur.
- Garder les réponses finales concises : ce qui a changé, comment cela a été vérifié, et les risques restants.
