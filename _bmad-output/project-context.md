---
project_name: 'patiss-app copie 2'
user_name: 'will'
date: '2026-03-02'
sections_completed: ['technology_stack']
existing_patterns_found: { 4 }
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Framework**: Next.js `16.1.6` (App Router, `src/app` structure, `turbopack` avec alias `@/lib`, `@/types`, `@/components`, `@/app`)
- **Langage**: React `19.2.3` + TypeScript `^5` en mode `strict` (`tsconfig.json`)
- **Backend / BaaS**: Supabase (`@supabase/supabase-js` `^2.97.0`, `@supabase/ssr` `^0.8.0`) utilisé pour Auth, Postgres et Storage
- **UI / UX**: React + Tailwind CSS `^4` (classes utilitaires dans `globals.css` et composants custom pastel, mobile-first)
- **ICônes**: `lucide-react` `^0.575.0`
- **Notifications**: `sonner` `^2.0.7`
- **Emailing**: `resend` `^6.9.2` (prévu pour emails type rapport de clôture)
- **AI**: `@google/generative-ai` `^0.24.1` pour intégrer Gemini (assistant comptable IA)

## Critical Implementation Rules

- **Règles générales**
  - Toujours respecter le mode **TypeScript strict** : pas de `any`, typer toutes les réponses Supabase avec les types de `types/supabase.ts`.
  - L’application est **multi-tenant** : toutes les tables métier ont un `organization_id` et toutes les requêtes doivent filtrer sur `organization_id` du profil courant.
  - RLS Supabase doit être activé pour chaque table métier, avec politiques basées sur `auth.uid()` relié à `profiles.organization_id`.

- **Next.js / App Router**
  - Utiliser des **Server Components par défaut** dans `src/app`, et des **Client Components** uniquement pour l’interactivité (formulaires, toasts, state local).
  - Utiliser le client Supabase **SSR** (`createClient` côté serveur) dans les pages server pour charger `user` et `profile`.
  - Rediriger côté serveur selon l’auth : la Home (`/`) renvoie vers `/dashboard` si connecté, sinon `/login`.
  - Le layout dashboard doit toujours vérifier `user` + `profile`; en absence, rediriger vers `/login`.

- **Supabase / Auth**
  - Le `setup` initial crée un **Super Admin** et une **organization** puis associe le profil à `role_slug = 'super_admin'`.
  - Le login gérant (`/login`) utilise `supabase.auth.signInWithPassword` puis redirige vers `/dashboard`.
  - Le **Mode Kiosque** (`/kiosk`) ne passe jamais par email/password : il liste les `profiles` `is_active = true` avec `role_slug in ('vendeur','patissier')` et utilise un **PIN** à 4 chiffres stocké dans `profiles.pin_code`.
  - Toute nouvelle fonctionnalité employé doit respecter ce modèle kiosque : pas de saisie de texte complexe, interaction tactile simple.

- **Accès données / Multi-tenant**
  - Toute requête sur une table métier (`orders`, `order_items`, `recipes`, `ingredients`, `inventory_logs`, etc.) doit filtrer sur `organization_id = profile.organization_id`.
  - Ne jamais exposer ni manipuler des données d’une autre organisation côté client (pas de paramètres libres d’`organization_id` dans l’UI).

- **UX / UI**
  - Style **mobile-first** : layouts pensés pour téléphone/tablette, puis élargis pour desktop.
  - Boutons et éléments cliquables doivent faire au minimum **44px de hauteur** pour rester touch-friendly.
  - Palette pastel “pâtisserie” déjà en place : conserver fonds clairs, ombres douces, arrondis généreux.
  - Utiliser des composants réutilisables (`StatCard`, `DashboardSidebar`, etc.) plutôt que dupliquer les patterns visuels.

- **Commandes / Production / IA**
  - Les commandes (`orders`) doivent toujours inclure : client, date de retrait, status, total, acompte, items (`order_items`) liés à des `recipes`.
  - Les écrans dashboard récupèrent les métriques du jour via Supabase (ventes, alertes stock, pertes `inventory_logs.reason = 'waste'`).
  - L’**assistant Comptable IA** doit consommer des JSON dérivés de ces sources (ventes, coûts matières, pertes) et respecter les règles métier décrites dans `ARCHITECTURE.md` (pas d’invention de chiffres, devise de l’organisation, réponses courtes).

