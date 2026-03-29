# PROJECT SNAPSHOT — ANALYSE INITIALE COMPLÈTE
> Généré le : 17 Mars 2026
> Type : Première analyse — lecture intégrale du projet (67 fichiers)
> Objectif : Référence de contexte pour toutes les sessions futures

---

## 1. 🏗️ ARCHITECTURE TECHNIQUE

### Stack
| Couche | Technologie | Version |
|---|---|---|
| Frontend | React | 19.2.3 |
| Framework | Next.js (App Router) | 16.1.6 |
| Styling | Tailwind CSS + CSS custom properties | v4 |
| Backend/Auth/DB | Supabase (SSR) | `@supabase/ssr` 0.8.0, `@supabase/supabase-js` 2.97.0 |
| IA | Google Gemini (`@google/generative-ai`) | 0.24.1 — modèle `gemini-2.5-flash` |
| Email | Resend | 6.9.2 (installé, **pas encore utilisé dans le code**) |
| Notifications | Sonner (toasts) | 2.0.7 |
| Icônes | Lucide React | 0.575.0 |
| TypeScript | Strict | v5+ |

### Structure du projet
```
patiss-app/
├── docs/ARCHITECTURE.md          # Document de design master (PRD + Spec)
├── _bmad/                         # Framework BMAD (workflow d'analyse) — non utilisé activement
├── _bmad-output/                  # Artéfacts d'implémentation BMAD
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # Client navigateur (createBrowserClient)
│   │   └── server.ts              # Client serveur (createServerClient)
│   └── actions/
│       ├── admin.ts               # Server Actions : CRUD orgs, rôles, PIN
│       ├── auth.ts                # Server Actions : loginWithPin, logoutKiosk
│       ├── employees.ts           # Server Actions : CRUD employés
│       ├── inventory.ts           # Server Actions : CRUD ingrédients, mouvements stock
│       ├── orders.ts              # Server Actions : CRUD commandes
│       ├── recipes.ts             # Server Actions : CRUD recettes + ingrédients
│       └── setup.ts               # Server Action : setup initial Super Admin
├── middleware.ts                   # Auth guard + redirection basée sur les rôles
├── types/supabase.ts              # Types DB générés (469 lignes)
├── src/app/
│   ├── layout.tsx                 # Root layout (Toaster, metadata)
│   ├── page.tsx                   # Redirect intelligent → /admin ou /dashboard
│   ├── globals.css                # Design system complet (245 lignes)
│   ├── api/ai/route.ts            # API Route POST : Chatbot Gemini
│   ├── (auth)/
│   │   ├── login/page.tsx         # Connexion email/password gérant
│   │   ├── setup/page.tsx         # Première configuration Super Admin (2 étapes)
│   │   └── kiosk/page.tsx         # Mode Kiosque : grille Avatars + PIN pad
│   ├── (pâtisserie)/              # Route group pour gérant/employés
│   │   ├── layout.tsx             # Sidebar + AutoLockProvider
│   │   ├── dashboard/page.tsx     # Dashboard adaptatif par rôle
│   │   ├── commandes/page.tsx     # Gestion des commandes
│   │   ├── recettes/page.tsx      # Fiches recettes & food-cost
│   │   ├── ingredients/page.tsx   # Liste ingrédients + alertes stock
│   │   ├── inventaire/page.tsx    # Journal des mouvements de stock
│   │   ├── equipe/page.tsx        # Gestion des employés
│   │   └── ai-assistant/page.tsx  # Page dédiée Comptable IA
│   └── (superadmin)/              # Route group pour Super Admin
│       ├── layout.tsx             # Wrapper simple
│       └── admin/
│           ├── layout.tsx         # Auth guard : super_admin uniquement
│           └── page.tsx           # Console admin (orgs, utilisateurs, abonnements)
├── src/components/
│   ├── admin/
│   │   ├── AdminClient.tsx        # Console admin complète (580 lignes, master-detail)
│   │   ├── AdminUsersClient.tsx   # Tableau gestion rôles/statut utilisateurs
│   │   └── SuperAdminSidebar.tsx  # Sidebar dédiée Super Admin
│   ├── auth/
│   │   └── AutoLockProvider.tsx   # Verrouillage automatique par inactivité
│   ├── dashboard/
│   │   └── AIAssistant.tsx        # Widget Comptable IA (Gemini)
│   ├── equipe/
│   │   └── EquipeClient.tsx       # CRUD employés (couleur thème, PIN, rôle)
│   ├── inventory/
│   │   ├── IngredientModal.tsx    # Modal CRUD ingrédient + upload image
│   │   └── StockMovementModal.tsx # Modal mouvement de stock
│   ├── layout/
│   │   └── DashboardSidebar.tsx   # Sidebar principale (nav, logout contextuel, bannière kiosque)
│   ├── orders/
│   │   └── OrdersClient.tsx       # CRUD commandes (338 lignes, upload image)
│   ├── recipes/
│   │   └── RecipesClient.tsx      # CRUD recettes + calcul food-cost (266 lignes)
│   └── ui/
│       ├── StatCard.tsx           # Carte KPI générique (tendance, icône, skeleton)
│       ├── TouchInput.tsx         # Input tactile → ouvre NumPad
│       └── NumPad.tsx             # Clavier numérique plein écran (PIN, quantités)
└── public/                        # SVGs par défaut Next.js (inutilisés)
```

### Base de données (Supabase PostgreSQL)
| Table | Rôle | Colonne clé |
|---|---|---|
| `organizations` | Tenants SaaS (pâtisseries) | `subscription_end_date` |
| `profiles` | Extension `auth.users` — rôles, PIN, avatar | `role_slug`, `organization_id`, `pin_code` |
| `roles` | Table de référence des rôles | `slug`, `name` |
| `ingredients` | Matières premières | `current_stock`, `alert_threshold`, `cost_per_unit` |
| `recipes` | Produits finis (gâteaux) | `sale_price`, `image_url` |
| `recipe_ingredients` | Liaison recette ↔ ingrédient (food-cost) | `quantity_required` |
| `orders` | Commandes clients | `status`, `deposit_amount`, `custom_image_url` |
| `order_items` | Détail commande (lignes produit) | `recipe_id`, `quantity`, `unit_price` |
| `inventory_logs` | Journal entrées/sorties de stock | `quantity_change`, `reason` |

**Relations :**
- `profiles.organization_id` → `organizations.id` (multi-tenant)
- `recipe_ingredients` → `recipes` + `ingredients` (many-to-many)
- `order_items` → `orders` + `recipes` (many-to-many)
- `inventory_logs` → `ingredients` + `profiles` (traçabilité)

**RLS :** Défini dans ARCHITECTURE.md (policy par `organization_id`), mais **les politiques RLS réelles dans Supabase n'ont pas été auditées ici**.

### Services externes & APIs
| Service | Usage | SDK/Client |
|---|---|---|
| Supabase Auth | Authentification email/password + admin API | `@supabase/ssr`, `@supabase/supabase-js` |
| Supabase Storage | Upload images gâteaux & ingrédients | Via `supabase.storage` (bucket `recipe-images`) |
| Google Gemini AI | Chatbot "Comptable IA" | `@google/generative-ai` |
| Resend | ⚠️ **Installé mais non utilisé** dans le code | `resend` package |

### Variables d'environnement
| Variable | Usage |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé admin (setup, création users) |
| `GEMINI_API_KEY` | Clé API Google Gemini |

### Configuration & Déploiement
- `next.config.ts` : Turbopack avec `resolveAlias` pour `@/lib`, `@/types`, `@/components`, `@/app`
- `postcss.config.mjs` : PostCSS avec plugin `@tailwindcss/postcss`
- `eslint.config.mjs` : ESLint 9 avec `eslint-config-next`
- **Aucune configuration de déploiement** (pas de `vercel.json`, `Dockerfile`, ni CI/CD détecté)
- **Un seul environnement** : développement local (`npm run dev`)

---

## 2. ✅ FONCTIONNALITÉS IMPLÉMENTÉES

| Fonctionnalité | Fichiers concernés | Statut |
|---|---|---|
| **Auth Email/Password (Gérant)** | `login/page.tsx`, `middleware.ts` | ✅ Complet |
| **Auth PIN (Kiosque Employés)** | `kiosk/page.tsx`, `auth.ts:loginWithPin` | ✅ Complet |
| **Setup initial Super Admin** | `setup/page.tsx`, `setup.ts` | ✅ Complet |
| **Redirection basée sur les rôles** | `page.tsx` (racine), `middleware.ts` | ✅ Complet |
| **Mode Kiosque (impersonation)** | `kiosk/page.tsx`, `auth.ts`, `DashboardSidebar.tsx` | ✅ Complet |
| **Auto-lock par inactivité** | `AutoLockProvider.tsx`, layouts | ✅ Complet |
| **Bannière "Retour Admin" (kiosque)** | `DashboardSidebar.tsx`, `(pâtisserie)/layout.tsx` | ✅ Complet |
| **Logout contextuel (kiosque vs admin)** | `DashboardSidebar.tsx`, `auth.ts:logoutKiosk` | ✅ Complet |
| **Dashboard adaptatif par rôle** | `dashboard/page.tsx` (gérant, vendeur, pâtissier) | ✅ Complet |
| **KPIs Dashboard (CA, alertes, pertes)** | `dashboard/page.tsx`, `StatCard.tsx` | ✅ Complet |
| **Filtres période/client (Dashboard)** | `dashboard/page.tsx` (formulaire GET) | ✅ Complet |
| **CRUD Commandes** | `OrdersClient.tsx`, `orders.ts` | ✅ Complet |
| **Upload image commande** | `OrdersClient.tsx` (Supabase Storage) | ✅ Complet |
| **Workflow statut commande** | `OrdersClient.tsx` (pending → production → ready → completed) | ✅ Complet |
| **CRUD Recettes** | `RecipesClient.tsx`, `recipes.ts` | ✅ Complet |
| **Calcul Food-Cost automatique** | `RecipesClient.tsx:calcFoodCost()` | ✅ Complet |
| **Upload image recette** | `RecipesClient.tsx` (Supabase Storage) | ✅ Complet |
| **CRUD Ingrédients** | `IngredientModal.tsx`, `inventory.ts` | ✅ Complet |
| **Alertes stock (seuil)** | `ingredients/page.tsx`, `dashboard/page.tsx` | ✅ Complet |
| **Mouvements de stock (journal)** | `StockMovementModal.tsx`, `inventaire/page.tsx` | ✅ Complet |
| **CRUD Employés** | `EquipeClient.tsx`, `employees.ts` | ✅ Complet |
| **Couleur thème par employé** | `EquipeClient.tsx` (COLOR_PRESETS) | ✅ Complet |
| **Comptable IA (Gemini)** | `AIAssistant.tsx`, `api/ai/route.ts` | ✅ Complet |
| **Page dédiée IA** | `ai-assistant/page.tsx` | ✅ Complet |
| **Console Super Admin** | `AdminClient.tsx` (orgs, team, abonnements) | ✅ Complet |
| **Création Org + Gérant** | `AdminClient.tsx`, `admin.ts:createOrganizationWithGerant` | ✅ Complet |
| **Gestion abonnements (renouvellement)** | `AdminClient.tsx:handleQuickRenew`, `admin.ts:updateOrganization` | ✅ Complet |
| **Suspension/Réactivation Org** | `admin.ts:suspendOrganization/reactivateOrganization` | ✅ Complet |
| **Reset PIN employé** | `admin.ts:resetEmployeePin` | ✅ Complet |
| **Saisie tactile NumPad** | `NumPad.tsx`, `TouchInput.tsx` | ✅ Complet |
| **Centering modals (Tailwind)** | Tous les composants modaux | ✅ Complet |
| **Design system (CSS custom props)** | `globals.css` (couleurs, ombres, radius, animations) | ✅ Complet |

---

## 3. 📋 CE QUI ÉTAIT PRÉVU (INTENTIONS DÉTECTÉES)

| Intention détectée | Source | Priorité estimée |
|---|---|---|
| **Email de clôture journalier (Edge Function)** | `docs/ARCHITECTURE.md:168-174` — Cron job quotidien, envoi par email via SMTP | 🔴 Haute |
| **Soft Lock abonnement expiré (lecture seule)** | `docs/ARCHITECTURE.md:36` — "Soft Lock (Lecture seule) à expiration" | 🟡 Moyenne |
| **Alertes expiration J-7** | `docs/ARCHITECTURE.md:36` — "Alertes expiration (J-7)" | 🟡 Moyenne |
| **Upload image gâteau sur commande (Supabase Storage bucket `order-images`)** | `docs/ARCHITECTURE.md:164` | 🟢 Implémenté côté code, bucket non confirmé |
| **Production Plan (vue pâtissier)** | `docs/ARCHITECTURE.md:158` — `<ProductionPlan>` | 🟡 Moyenne |
| **Ventes vitrine (vue vendeur)** | `docs/ARCHITECTURE.md:157` — `<VitrineSales>` | 🟡 Moyenne |
| **Hashage des codes PIN** | `docs/ARCHITECTURE.md:58` — "Chiffré ou Hashé idéalement" | 🔴 Haute (sécurité) |
| **Devise dynamique par organisation** | `ingredients/page.tsx:18` — `const currency = 'FCFA' // simplifié` | 🟢 Basse |

---

## 4. ✅ CE QUI A ÉTÉ CORRIGÉ DEPUIS LE SNAPSHOT INITIAL

| Fonctionnalité / Problème | Statut de résolution |
|---|---|
| **Edge Function email de clôture** | ✅ Implémenté (Cron `/api/cron/daily-report` avec Resend) |
| **Soft Lock abonnement expiré** | ✅ Implémenté (`ensureActiveSubscription` dans les server actions) |
| **Vue "Plan de Production"** | ✅ Implémenté (`ProductionPlan` pour le pâtissier) |
| **Vue "Ventes Vitrine"** | ✅ Implémenté (`VitrineSales` pour le vendeur) |
| **Hashage des PIN** | ✅ Implémenté (`bcryptjs` utilisé pour le stockage et l'auth) |
| **Centering modals** | ✅ Uniformisé (utilisation de la classe `.modal-overlay`) |
| **Currency** | ✅ Dynamique implémenté sur toutes les vues |
| **Nettoyage fichiers inutiles** | ✅ Les fichiers de debug, de test et les images par défaut ont été supprimés |

---

## 5. 🔍 DETTE TECHNIQUE & POINTS D'ATTENTION (RÉSIDUEL)

### Architecture
- **AdminUsersClient.tsx** : Composant créé mais non utilisé, remplacé par AdminClient.tsx.

### Performance
- **Pas de pagination** sur les listes (commandes, recettes, ingrédients). Peut poser problème à l'échelle.
- **AIAssistant** effectue un appel automatique au montage.

### Sécurité / Déploiement
- **RLS Supabase** : à vérifier via dashboard.
- **CI/CD** : Configuration Vercel et tâche Cron externe à planifier pour `/api/cron/daily-report`.

---

## 6. 📌 DÉCISIONS TECHNIQUES OBSERVÉES

| Aspect | Décision |
|---|---|
| **Architecture** | Next.js App Router, Route Groups pour séparer auth/pâtisserie/superadmin |
| **Mutations** | Server Actions exclusivement (`'use server'`) — aucune API REST custom sauf `/api/ai` |
| **Data Fetching** | Server Components pour les pages, fetch côté serveur |
| **État client** | `useState` pur React — aucun state manager externe (pas de Zustand/Redux) |
| **Auth** | Supabase Auth SSR avec refresh des cookies dans le middleware |
| **Multi-tenant** | `organization_id` sur toutes les tables métier |
| **Rôles** | 4 rôles stricts : `super_admin`, `gerant`, `vendeur`, `patissier` |
| **Impersonation** | Cookie `kiosk_user_id` (httpOnly) pour le mode kiosque |
| **Nommage** | camelCase TypeScript, kebab-case URL, français pour les labels |
| **Gestion erreurs** | Retour `{ error: string }` ou `{ success: true }` depuis les Server Actions |
| **Notifications** | `sonner` (toast) pour feedback utilisateur |
| **Animations** | CSS keyframes maison (`fadeIn`, `slideUp`, `scaleIn`) |
| **UX Tactile** | Composant `NumPad` dédié pour écrans tactiles (tablettes pâtisserie) |

---

## 7. 🚀 RÉSUMÉ EXÉCUTIF — BRIEF DE REPRISE

**Pâtiss'App** est un SaaS B2B multi-tenant de gestion tout-en-un pour les pâtisseries et boulangeries. Construit avec Next.js 16 (App Router) + Supabase + Gemini AI, il cible deux types d'écrans : la tablette en laboratoire (Mode Kiosque avec PIN) et le mobile/desktop du gérant (connexion email/password). L'application gère le cycle de vie complet d'une pâtisserie : commandes clients, fiches recettes avec food-cost automatique, inventaire avec alertes de stock, gestion d'équipe avec rôles stricts, et un assistant IA ("Comptable IA") qui analyse les données financières en temps réel via Google Gemini.

**Avancement estimé : ~75%.** L'ensemble du CRUD métier (commandes, recettes, ingrédients, stock, équipe), l'authentification multi-mode (email + PIN kiosque), le dashboard adaptatif par rôle, la console Super Admin, et l'assistant IA sont tous fonctionnels. L'architecture multi-tenant et la séparation des rôles sont en place.

**Prochaines étapes logiques :** (1) Implémenter l'Edge Function d'email de clôture quotidien (le package `resend` est déjà installé). (2) Ajouter la logique de soft-lock à expiration d'abonnement. (3) Hasher les codes PIN pour la sécurité. (4) Créer les vues "Plan de Production" et "Ventes Vitrine" détaillées. (5) Nettoyer les fichiers temporaires et uniformiser le styling.

**Risque majeur :** Les codes PIN sont stockés en clair dans la base de données. C'est un problème de sécurité à corriger avant tout déploiement en production.

---

## 8. 🗂️ INDEX DES FICHIERS CLÉS

| Fichier | Rôle |
|---|---|
| `docs/ARCHITECTURE.md` | Document de design master (PRD + spécifications techniques complètes) |
| `middleware.ts` | Guard d'authentification et redirection basée sur les rôles |
| `src/app/globals.css` | Design system complet (tokens, animations, composants CSS) |
| `types/supabase.ts` | Types TypeScript générés depuis le schéma Supabase (469 lignes) |
| `lib/supabase/server.ts` | Factory du client Supabase côté serveur (SSR) |
| `lib/actions/auth.ts` | Server Actions d'authentification (loginWithPin, logoutKiosk) |
| `lib/actions/admin.ts` | Server Actions admin (CRUD orgs, rôles, PIN, creation org+gérant) |
| `lib/actions/orders.ts` | Server Actions commandes (création, statut, suppression) |
| `lib/actions/recipes.ts` | Server Actions recettes (CRUD + ingrédients liés) |
| `lib/actions/inventory.ts` | Server Actions inventaire (CRUD ingrédients, mouvements stock) |
| `src/app/(auth)/kiosk/page.tsx` | Page Mode Kiosque (grille avatars + PIN pad) |
| `src/app/(pâtisserie)/dashboard/page.tsx` | Dashboard adaptatif par rôle (gérant, vendeur, pâtissier) |
| `src/app/(pâtisserie)/layout.tsx` | Layout principal avec sidebar et AutoLockProvider |
| `src/app/(superadmin)/admin/page.tsx` | Console Super Admin (organisations, équipes, abonnements) |
| `src/components/admin/AdminClient.tsx` | Composant client admin complet (580 lignes, master-detail) |
| `src/components/layout/DashboardSidebar.tsx` | Sidebar navigation + logout contextuel + bannière kiosque |
| `src/components/auth/AutoLockProvider.tsx` | Auto-verrouillage par inactivité (configurable par utilisateur) |
| `src/components/ui/NumPad.tsx` | Clavier numérique tactile pour écrans tablettes |
| `src/app/api/ai/route.ts` | Endpoint API pour le Comptable IA (Gemini) |
