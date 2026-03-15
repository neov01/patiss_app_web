MASTER DESIGN DOCUMENT: Pâtiss'App (SaaS MVP)
Version : 1.0 (Ready for Dev)
Date : 21 Février 2026
Type : SaaS B2B Multi-tenant (Pâtisserie/Boulangerie)
Stack Technique Cible :
Frontend : React / Next.js (Mobile-First responsive).
Backend / Database : Supabase (PostgreSQL, Auth, Edge Functions).
AI Engine : Google Gemini API (via Vertex AI ou AI Studio).
Storage : Supabase Storage (Images gâteaux).
PARTIE 1 : PRODUCT REQUIREMENTS (PRD)
1.1 Vision & Objectifs
Créer une application de gestion tout-en-un pour les pâtisseries, accessible sur tablette (laboratoire) et mobile (gérant).
Proposition de valeur unique :
Gestion des coûts : Calcul automatique des marges via des fiches recettes dynamiques.
Productivité : Interface "Mode Kiosque" pour les équipes terrain (pas de login complexe).
Intelligence : Un assistant "Comptable IA" (Gemini) qui analyse la rentabilité en langage naturel.
1.2 Personas & Rôles
L'application gère des permissions strictes basées sur des slugs.
Super Admin (Propriétaire du SaaS) :
Crée les organisations (Pâtisseries).
Gère les abonnements (Dates limites).
Accès "God Mode" pour le support technique.
Gérant (Admin de l'Organisation) :
Vue complète : CA, Marges, Stocks, Gestion des employés.
Reçoit les rapports de clôture par email.
Vendeur (Boutique) :
Interface simplifiée : Prise de commande, encaissement, sortie de stock vitrine.
Pâtissier (Laboratoire) :
Interface lecture seule (Plan de production) + Déclaration de pertes/stock.
1.3 Fonctionnalités Clés (User Stories)
Auth : Login Email/Pass pour le Gérant. Login PIN + Avatar pour les employés.
Dashboard : Cartes interactives (KPIs) adaptées au rôle.
Commandes : Création via Pop-up (Modal), upload photo gâteau, acomptes.
Production : Calcul automatique des ingrédients à sortir selon les commandes du jour.
Compta IA : Chatbot Gemini analysant les JSON de ventes/pertes.
SaaS Lifecycle : Alertes expiration (J-7) -> Soft Lock (Lecture seule) à expiration.
PARTIE 2 : TECHNICAL SPECIFICATIONS (SPEC)
2.1 Schéma de Base de Données (Supabase / PostgreSQL)
Convention : organization_id est présent sur TOUTES les tables métier pour le cloisonnement (RLS).
code
SQL
-- 1. ORGANIZATIONS (Les clients SaaS)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  currency_symbol TEXT DEFAULT 'FCFA', -- Devise paramétrable (ex: €, $)
  subscription_end_date TIMESTAMP, -- Date limite abonnement
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. PROFILES (Extension de auth.users)
-- Gère à la fois le Gérant (Email) et les Employés (PIN)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  full_name TEXT NOT NULL,
  avatar_url TEXT, -- Photo pour le mode Kiosque
  pin_code VARCHAR(4), -- Chiffré ou Hashé idéalement
  role_slug TEXT NOT NULL CHECK (role_slug IN ('super_admin', 'gerant', 'vendeur', 'patissier')),
  auto_lock_seconds INT DEFAULT 60, -- Paramètre UX
  is_active BOOLEAN DEFAULT true
);

-- 3. INGREDIENTS (Matières premières)
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL, -- ex: Farine T55
  unit TEXT NOT NULL, -- kg, l, piece
  cost_per_unit DECIMAL(10, 2) NOT NULL, -- ex: 500 (FCFA)
  current_stock DECIMAL(10, 2) DEFAULT 0,
  alert_threshold DECIMAL(10, 2) DEFAULT 5 -- Alerte si stock < 5
);

-- 4. RECIPES (Produits finis)
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL, -- ex: Fraisier 6 parts
  sale_price DECIMAL(10, 2) NOT NULL,
  description TEXT,
  image_url TEXT
);

-- 5. RECIPE_INGREDIENTS (Table de liaison pour le Food-Cost)
CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id UUID REFERENCES recipes(id),
  ingredient_id UUID REFERENCES ingredients(id),
  quantity_required DECIMAL(10, 3) NOT NULL -- ex: 0.250 (kg de farine)
);

-- 6. ORDERS (Commandes Clients)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  customer_name TEXT NOT NULL,
  customer_contact TEXT,
  pickup_date TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'production', 'ready', 'completed', 'cancelled')),
  total_amount DECIMAL(10, 2) NOT NULL,
  deposit_amount DECIMAL(10, 2) DEFAULT 0, -- Acompte
  custom_image_url TEXT, -- Upload photo inspiration
  created_by UUID REFERENCES profiles(id) -- Qui a pris la commande
);

-- 7. ORDER_ITEMS (Détail commande)
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id),
  recipe_id UUID REFERENCES recipes(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL
);

-- 8. INVENTORY_LOGS (Historique & Pertes)
CREATE TABLE inventory_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  ingredient_id UUID REFERENCES ingredients(id),
  quantity_change DECIMAL(10, 3), -- Négatif pour sortie, Positif pour achat
  reason TEXT, -- 'production', 'waste' (perte), 'purchase' (achat), 'adjustment'
  log_date TIMESTAMP DEFAULT NOW()
);
2.2 Sécurité & Row Level Security (RLS)
L'agent doit générer les politiques RLS pour Supabase :
Règle d'Or : auth.uid() doit être lié à un profile.
Policy : Un utilisateur ne peut voir que les lignes où organization_id correspond à son propre organization_id (sauf le Super Admin).
2.3 Logique "Comptable IA" (Gemini Prompt Engineering)
Voici le "System Instruction" à injecter dans l'appel API Gemini.
System Prompt :
code
Text
Tu es un Expert Comptable spécialisé en Boulangerie-Pâtisserie. 
Ton rôle est d'analyser les données JSON que je te fournis (Ventes, Coûts Matières, Pertes) et de donner des conseils stratégiques au gérant.
Ton ton doit être professionnel, encourageant mais direct sur les problèmes financiers.

Règles strictes :
1. Ne jamais inventer de chiffres. Utilise uniquement ceux fournis dans le contexte.
2. Si la marge baisse, alerte immédiatement sur les ingrédients dont le prix a augmenté ou sur les pertes trop élevées.
3. Exprime-toi toujours dans la devise configurée (ex: FCFA).
4. Tes réponses doivent être courtes (max 3 phrases) pour s'afficher dans une "Carte Dashboard".
2.4 UX Flow & Logique Frontend
A. Authentification (Le "Kiosk Mode")
Page d'accueil : Vérifie si c'est un device "Admin" ou "Kiosk".
Si Kiosk :
GET /profiles?active=true -> Affiche la grille des Avatars.
onClick(Avatar) -> Ouvre Modal Pad Numérique.
onInput(PIN) -> Vérifie hash -> Génère Session Token.
Auto-Lock : setTimeout(logout, profile.auto_lock_seconds * 1000) réinitialisé à chaque interaction tactile.
B. Dashboard (Cartes Interactives)
Structure des composants React :
<DashboardLayout> : Wrapper principal.
<StatCard> : Composant générique (Titre, Valeur, Tendance, OnClick).
Logique d'affichage :
if (role === 'gerant') -> Affiche <FinancialCards>, <StockAlerts>, <AIAssistant>.
if (role === 'vendeur') -> Affiche <NewOrderBtn>, <TodayPickups>, <VitrineSales>.
if (role === 'patissier') -> Affiche <ProductionPlan>, <DeclareWaste>.
C. Gestion des Commandes (Modal Smooth)
Composant : <NewOrderModal>
Flow :
Formulaire : Client Info.
Sélecteur Produits (Recherche Recettes).
Upload Image (Supabase Storage bucket order-images).
Calcul Total & Acompte.
Save -> Trigger : Mise à jour immédiate de la carte "Commandes du jour".
D. Automation (Email de Clôture)
Utiliser Supabase Edge Functions (Deno/Node).
Trigger : Cron Job (ex: tous les jours à 22h00).
Action :
Query SQL : Somme des orders du jour.
Query SQL : Liste des inventory_logs type 'waste'.
Génération HTML Template.
Envoi via SMTP (ex: Resend, SendGrid).