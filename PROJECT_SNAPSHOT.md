# PROJECT SNAPSHOT — ANALYSE COMPLÈTE & MISE À JOUR
> Généré le : 29 Mars 2026
> Type : Analyse mise à jour — Inclusion des sessions de vente et rapports auto
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
| Email | Resend | 6.9.2 — **Actif (Rapports journaliers)** |
| Sécurité | bcryptjs | 3.0.3 — **Hachage des codes PIN** |
| Notifications | Sonner (toasts) | 2.0.7 |
| Icons | Lucide React | 0.575.0 |
| Date Handling | date-fns | 4.1.0 |
| Forms | React Hook Form + Zod | Latest |
| TypeScript | Strict | v5+ |

### Structure du projet (Mise à jour)
```
patiss_app_web/
├── lib/
│   ├── actions/
│   │   ├── sessions.ts            # Server Actions : getOpenSession, toggleSession (Open/Close)
│   │   ├── admin.ts               # Server Actions : CRUD orgs, rôles, codes boutique
│   │   ├── auth.ts                # Server Actions : loginWithPin (hashed), logoutKiosk
│   │   ├── employees.ts           # **NOUVEAU** : CRUD employés, paie, upload avatar
│   │   └── ...                    # Autres actions métier (orders, inventory, recipes)
├── middleware.ts                   # Auth guard + redirection + session Kiosque support
├── vercel.json                    # Configuration Cron : clôture auto à 21h00 UTC
├── src/app/
│   ├── api/cron/
│   │   └── close-session/route.ts # API protégée : calcul métriques + clôture + email Resend
│   ├── (auth)/
│   │   └── kiosk/page.tsx         # Kiosque : Saisie Code Boutique (ORG) + PIN (Profil)
│   ├── (pâtisserie)/              # Route group pour gérant/employés
│   │   ├── layout.tsx             # Sidebar + SessionMaster (Master Button/Lock)
│   │   ├── dashboard/page.tsx     # Dashboard (soumis au verrouillage de session)
│   │   └── ...                    # Menus (Certains menus libres même si caisse fermée)
│   └── (superadmin)/              # Route group pour Super Admin
├── src/components/
│   ├── layout/
│   │   ├── DashboardSidebar.tsx   # Sidebar principale
│   │   └── SessionMaster.tsx      # Bouton Maître + Logique de verrouillage UI (grayscale/disabled)
│   └── ...                        # Composants métier (Admin, Orders, Recipes, etc.)
└── supabase/migrations/           # Dossier contenant les 3 migrations SQL majeures d'aujourd'hui
```

### Base de données (Schéma étendu)
| Table | Rôle | Nouveautés |
|---|---|---|
| `organizations` | Tenants SaaS | `kiosk_code` (8 chars générés) |
| `profiles` | Utilisateurs | `pin_code` (haché), RH fields (`phone`, `contract_type`, `base_salary`, `avatar_url`) |
| `sales_sessions` | Sessions Vente | Suivi ouverture/clôture, `total_cash`, `total_mobile_money`, `metrics_snapshot` |
| `employee_pay_events` | **NOUVEAU** | Suivi des primes et retenues par employé et par mois |
| `orders` | Commandes | `payment_method` (especes, mobile_money, mixte), `mobile_money_amount` |

**Relations & Sécurité :**
- **RLS Bypass** : Utilisation de `supabaseAdmin` (service role) uniquement côté serveur pour la vérification du Code Boutique et du PIN lors de la connexion Kiosque (car l'utilisateur n'est pas encore authentifié).

### Services externes & APIs
| Service | Usage | Configuration |
|---|---|---|
| Supabase Admin | Gestion identités & RLS | Via `SUPABASE_SERVICE_ROLE_KEY` |
| Resend | Rapports par email | `onboarding@resend.dev` (mode test) ou domaine pro vérifié |
| Vercel Cron | Automatisation | Appelle `/api/cron/close-session` tous les jours à 21h00 |

### Variables d'environnement (Indispensables)
| Variable | Usage |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL de base (ex: http://localhost:3000) pour les appels de cron internes |
| `CRON_SECRET` | Secret pour sécuriser l'accès à l'API de clôture |
| `RESEND_API_KEY` | Clé API pour l'envoi des rapports |
| `ENVIRONMENT` | `development` (tout vers gmail) ou `production` (vers le gérant) |
| `REPORT_DEV_EMAIL` | Adresse de redirection en mode développement |

---

## 2. ✅ FONCTIONNALITÉS COMPLÉTÉES (Aujourd'hui)

| Fonctionnalité | Récit de la mise à jour |
|---|---|
| **Code Boutique (Kiosque)** | Chaque pâtisserie a un code unique (ex: PATI4521). Sécurise l'entrée dans le kiosque. |
| **Hachage des PINs** | Les codes PIN ne sont plus stockés en clair. Sécurité maximale pour les employés. |
| **Sessions de Vente** | "Bouton Maître" pour ouvrir la journée. Si fermé : Dashboard et Commandes sont grisés et inactifs. |
| **Accès "Manager" libre** | Le gérant peut accéder aux Recettes/Stocks même si la caisse est fermée (verrouillage intelligent). |
| **Rapport de Clôture** | Calcul auto du CA (Espèces vs Mobile Money) + Alertes de stock + Email Premium envoyé. |
| **Clôture Automatique** | Sécurité par Cron job à 21h00 si le gérant a oublié de fermer manuellement. |
| **Gestion Multi-Méthodes** | Support des paiements mixtes (partie espèces, partie mobile money). |
| **Mon Équipe (RH)** | **NOUVEAU** : Gestion complète des employés, contrats, salaires et photos. |
| **Gestion de Paie** | **NOUVEAU** : Système de primes/retenues avec calcul auto du net à payer. |
| **Fiches de Paie** | **NOUVEAU** : Génération de fiches mensuelles dynamiques et imprimables. |
| **Super Admin SaaS** | Refonte complète : Dashboard global, Recherche, Support (Prise de main), et Gestion des Licences. |
| **Support Technique** | Réinitialisation de PIN assistée et Création directe d'utilisateurs par le Super Admin. |

---

## 3. 🔍 DETTE TECHNIQUE & PROCHAINES ÉTAPES

### Restant à faire
- **Pagination** : Toujours pas implémentée sur les listes (commandes, recettes).
- **Domaine Privé Resend** : À valider pour passer de `onboarding@resend.dev` à une adresse pro.
- **Vérification RLS** : Faire un audit final des politiques de sécurité table par table.
- **Gating par Tier** : Appliquer le verrouillage des fonctionnalités (ex: IA uniquement pour le tier Premium+IA, Inventaire bloqué en Basic).
- **Migration Production** : Appliquer la migration `20260401020000_extend_organizations_admin.sql` sur la base de production.

### Décisions de design prises
- **Verrouillage UI** : Application d'un filtre `grayscale(0.8)` et `pointer-events: none` sur les zones restreintes pour une expérience visuelle "caisse fermée" impactante.
- **Centralisation** : Toute la logique de clôture (calculs + email + DB update) est centralisée dans l'API Cron pour éviter la redondance entre le bouton manuel et l'automatisation.

---

## 4. 🚀 RÉSUMÉ EXÉCUTIF — ÉTATA DU PROJET
**Avancement estimé : ~95%.**
L'application est désormais robuste, sécurisée et prête pour une utilisation réelle en magasin (Boutique physique). Le workflow complet est opérationnel : de la configuration Super Admin jusqu'à l'envoi du rapport financier quotidien par email. Les dernières touches concernent principalement la mise en production (réglages DNS, production build, variables Vercel).

---

## 5. 🗂️ INDEX DES FICHIERS MAJEURS (MAJ)
| Fichier | Usage |
|---|---|
| `supabase/migrations/*` | Les 3 scripts SQL à exécuter pour mettre à jour la base de données. |
| `src/app/api/cron/close-session/route.ts` | **Cœur du système de rapport** (Logique financière + Email). |
| `src/components/layout/SessionMaster.tsx` | UI du bouton maître et verrouillage intelligent. |
| `lib/actions/sessions.ts` | Actions serveur pour l'ouverture/fermeture manuelle. |
| `vercel.json` | Planification du Cron quotidien. |
| `lib/actions/recipes.ts` | Server Actions recettes (CRUD + ingrédients liés) |
| `lib/actions/inventory.ts` | Server Actions inventaire (CRUD ingrédients, mouvements stock) |
| `src/app/(auth)/kiosk/page.tsx` | Page Mode Kiosque (grille avatars + PIN pad) |
| `src/app/(pâtisserie)/dashboard/page.tsx` | Dashboard adaptatif par rôle (gérant, vendeur, pâtissier) |
| `src/app/(pâtisserie)/layout.tsx` | Layout principal avec sidebar et AutoLockProvider |
| `src/components/layout/DashboardSidebar.tsx` | Sidebar navigation + logout contextuel + bannière kiosque |
| `src/components/auth/AutoLockProvider.tsx` | Auto-verrouillage par inactivité (configurable par utilisateur) |
| `src/components/ui/NumPad.tsx` | Clavier numérique tactile pour écrans tablettes |
| `src/app/api/ai/route.ts` | Endpoint API pour le Comptable IA (Gemini) |
| `src/components/admin/AdminClient.tsx` | **Interface Super Admin** (Fleet management, Support, Licences) |
| `lib/actions/admin.ts` | Server Actions administratives (Impersonation, CRUD Orgs) |
| `src/components/equipe/*` | **Nouveau Module RH** (EmployeeCard, Modal, PayEvent, PayslipDrawer) |
| `lib/actions/employees.ts` | Server Actions RH (CRUD, Paie, Avatar) |
| `src/lib/schemas/employee.schema.ts` | Validation Zod pour le module RH |
