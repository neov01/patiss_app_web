-- ============================================================
-- Pâtiss'App — Migration 001 : Initialisation de la BDD
-- Version : 1.0
-- Date    : 2026-02-21
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ORGANIZATIONS (Les clients SaaS)
-- ============================================================
CREATE TABLE public.organizations (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT        NOT NULL,
  currency_symbol       TEXT        NOT NULL DEFAULT 'FCFA', -- Devise paramétrable (ex: €, $)
  subscription_end_date TIMESTAMP WITH TIME ZONE,            -- Date limite abonnement
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE  public.organizations                       IS 'Clients SaaS (pâtisseries / boulangeries)';
COMMENT ON COLUMN public.organizations.currency_symbol       IS 'Symbole de devise affiché dans toute l''interface (FCFA, €, $…)';
COMMENT ON COLUMN public.organizations.subscription_end_date IS 'Soft lock activé quand NOW() > subscription_end_date';

-- ============================================================
-- 2. PROFILES (Extension de auth.users)
-- Gère le Gérant (Email) et les Employés (PIN)
-- ============================================================
CREATE TABLE public.profiles (
  id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id   UUID        REFERENCES public.organizations(id)  ON DELETE SET NULL,
  full_name         TEXT        NOT NULL,
  avatar_url        TEXT,                                             -- Photo pour le mode Kiosque
  pin_code          VARCHAR(4),                                       -- À hasher (bcrypt) en production
  role_slug         TEXT        NOT NULL
                      CHECK (role_slug IN ('super_admin', 'gerant', 'vendeur', 'patissier')),
  auto_lock_seconds INT         NOT NULL DEFAULT 60,                  -- Délai de verrouillage auto (UX)
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE  public.profiles               IS 'Profils utilisateurs : étend auth.users avec les rôles métier';
COMMENT ON COLUMN public.profiles.pin_code      IS 'Code PIN 4 chiffres — stocker le hash bcrypt, jamais le clair';
COMMENT ON COLUMN public.profiles.role_slug     IS 'super_admin | gerant | vendeur | patissier';

-- ============================================================
-- 3. INGREDIENTS (Matières premières)
-- ============================================================
CREATE TABLE public.ingredients (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT          NOT NULL,                             -- ex: Farine T55
  unit            TEXT          NOT NULL,                             -- kg, l, piece
  cost_per_unit   DECIMAL(10,2) NOT NULL,                             -- ex: 500 (FCFA par unité)
  current_stock   DECIMAL(10,2) NOT NULL DEFAULT 0,
  alert_threshold DECIMAL(10,2) NOT NULL DEFAULT 5,                   -- Alerte si stock < seuil
  image_url       TEXT,                                               -- URL Supabase Storage (photo ingrédient)
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE  public.ingredients                 IS 'Matières premières avec gestion de stock et alertes de seuil';
COMMENT ON COLUMN public.ingredients.alert_threshold IS 'Déclenchement d''alerte stock quand current_stock < alert_threshold';

-- ============================================================
-- 4. RECIPES (Produits finis / Recettes)
-- ============================================================
CREATE TABLE public.recipes (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT          NOT NULL,                             -- ex: Fraisier 6 parts
  sale_price      DECIMAL(10,2) NOT NULL,
  description     TEXT,
  image_url       TEXT,                                               -- URL Supabase Storage
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.recipes IS 'Fiches recettes — base de calcul du Food-Cost et des commandes';

-- ============================================================
-- 5. RECIPE_INGREDIENTS (Table de liaison pour le Food-Cost)
-- ============================================================
CREATE TABLE public.recipe_ingredients (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id           UUID          NOT NULL REFERENCES public.recipes(id)     ON DELETE CASCADE,
  ingredient_id       UUID          NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity_required   DECIMAL(10,3) NOT NULL,                         -- ex: 0.250 (kg de farine)
  UNIQUE (recipe_id, ingredient_id)                                   -- Un ingrédient par recette (une seule ligne)
);

COMMENT ON TABLE  public.recipe_ingredients                    IS 'Composition des recettes (ingrédients + quantités)';
COMMENT ON COLUMN public.recipe_ingredients.quantity_required  IS 'Quantité dans l''unité de l''ingrédient (kg, l, piece…)';

-- ============================================================
-- 6. ORDERS (Commandes Clients)
-- ============================================================
CREATE TABLE public.orders (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_name   TEXT          NOT NULL,
  customer_contact TEXT,
  pickup_date     TIMESTAMP WITH TIME ZONE NOT NULL,
  status          TEXT          NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'production', 'ready', 'completed', 'cancelled')),
  total_amount    DECIMAL(10,2) NOT NULL,
  deposit_amount  DECIMAL(10,2) NOT NULL DEFAULT 0,                   -- Acompte versé
  custom_image_url TEXT,                                              -- Photo inspiration (Supabase Storage)
  created_by      UUID          REFERENCES public.profiles(id)  ON DELETE SET NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE  public.orders                  IS 'Commandes clients avec statut de production et gestion d''acomptes';
COMMENT ON COLUMN public.orders.deposit_amount   IS 'Acompte versé par le client à la prise de commande';
COMMENT ON COLUMN public.orders.custom_image_url IS 'Bucket Supabase Storage : order-images';

-- ============================================================
-- 7. ORDER_ITEMS (Détail des commandes)
-- ============================================================
CREATE TABLE public.order_items (
  id         UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id   UUID          NOT NULL REFERENCES public.orders(id)   ON DELETE CASCADE,
  recipe_id  UUID          NOT NULL REFERENCES public.recipes(id)  ON DELETE RESTRICT,
  quantity   INT           NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL,                                  -- Prix unitaire au moment de la vente
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE  public.order_items           IS 'Lignes de commande — snapshot du prix au moment de la vente';
COMMENT ON COLUMN public.order_items.unit_price IS 'Dénormalisé intentionnellement pour conserver l''historique de prix';

-- ============================================================
-- 8. INVENTORY_LOGS (Historique des mouvements de stock)
-- ============================================================
CREATE TABLE public.inventory_logs (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID            NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ingredient_id   UUID            NOT NULL REFERENCES public.ingredients(id)   ON DELETE RESTRICT,
  quantity_change DECIMAL(10,3)   NOT NULL,                           -- Négatif : sortie / Positif : entrée
  reason          TEXT            NOT NULL
                    CHECK (reason IN ('production', 'waste', 'purchase', 'adjustment')),
  log_date        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by      UUID            REFERENCES public.profiles(id)  ON DELETE SET NULL
);

COMMENT ON TABLE  public.inventory_logs                  IS 'Journal de tous les mouvements de stock (productions, pertes, achats)';
COMMENT ON COLUMN public.inventory_logs.quantity_change  IS 'Valeur signée : négatif = sortie de stock, positif = entrée';
COMMENT ON COLUMN public.inventory_logs.reason           IS 'production | waste | purchase | adjustment';

-- ============================================================
-- INDEXES (Performance)
-- ============================================================
-- Filtrage multi-tenant (très fréquent)
CREATE INDEX idx_profiles_organization_id       ON public.profiles(organization_id);
CREATE INDEX idx_ingredients_organization_id    ON public.ingredients(organization_id);
CREATE INDEX idx_recipes_organization_id        ON public.recipes(organization_id);
CREATE INDEX idx_orders_organization_id         ON public.orders(organization_id);
CREATE INDEX idx_inventory_logs_organization_id ON public.inventory_logs(organization_id);

-- Requêtes opérationnelles courantes
CREATE INDEX idx_orders_status                  ON public.orders(status);
CREATE INDEX idx_orders_pickup_date             ON public.orders(pickup_date);
CREATE INDEX idx_inventory_logs_log_date        ON public.inventory_logs(log_date);
CREATE INDEX idx_inventory_logs_ingredient_id   ON public.inventory_logs(ingredient_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Convention : organization_id doit correspondre à celui du profil
-- Règle d'Or : auth.uid() doit être lié à un profile
-- ============================================================

-- Fonction helper : récupère l'organization_id de l'utilisateur courant
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Fonction helper : vérifie si l'utilisateur courant est super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role_slug = 'super_admin'
  );
$$;

-- Fonction helper : récupère le role_slug de l'utilisateur courant
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role_slug FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ──────────────────────────────────────────────
-- TABLE : organizations
-- ──────────────────────────────────────────────
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT USING (
    public.is_super_admin()
    OR id = public.get_user_organization_id()
  );

CREATE POLICY "organizations_insert" ON public.organizations
  FOR INSERT WITH CHECK (public.is_super_admin());

CREATE POLICY "organizations_update" ON public.organizations
  FOR UPDATE USING (public.is_super_admin());

CREATE POLICY "organizations_delete" ON public.organizations
  FOR DELETE USING (public.is_super_admin());

-- ──────────────────────────────────────────────
-- TABLE : profiles
-- ──────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    public.is_super_admin()
    OR organization_id = public.get_user_organization_id()
  );

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
    OR id = auth.uid() -- Un utilisateur peut mettre à jour son propre profil
  );

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
      AND id != auth.uid() -- Un gérant ne peut pas se supprimer lui-même
    )
  );

-- ──────────────────────────────────────────────
-- TABLE : ingredients
-- ──────────────────────────────────────────────
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingredients_select" ON public.ingredients
  FOR SELECT USING (
    public.is_super_admin()
    OR organization_id = public.get_user_organization_id()
  );

CREATE POLICY "ingredients_insert" ON public.ingredients
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "ingredients_update" ON public.ingredients
  FOR UPDATE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "ingredients_delete" ON public.ingredients
  FOR DELETE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
  );

-- ──────────────────────────────────────────────
-- TABLE : recipes
-- ──────────────────────────────────────────────
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_select" ON public.recipes
  FOR SELECT USING (
    public.is_super_admin()
    OR organization_id = public.get_user_organization_id()
  );

CREATE POLICY "recipes_insert" ON public.recipes
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "recipes_update" ON public.recipes
  FOR UPDATE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "recipes_delete" ON public.recipes
  FOR DELETE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
  );

-- ──────────────────────────────────────────────
-- TABLE : recipe_ingredients
-- ──────────────────────────────────────────────
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_ingredients_select" ON public.recipe_ingredients
  FOR SELECT USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_id
        AND r.organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "recipe_ingredients_insert" ON public.recipe_ingredients
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'patissier')
      AND EXISTS (
        SELECT 1 FROM public.recipes r
        WHERE r.id = recipe_id
          AND r.organization_id = public.get_user_organization_id()
      )
    )
  );

CREATE POLICY "recipe_ingredients_update" ON public.recipe_ingredients
  FOR UPDATE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'patissier')
      AND EXISTS (
        SELECT 1 FROM public.recipes r
        WHERE r.id = recipe_id
          AND r.organization_id = public.get_user_organization_id()
      )
    )
  );

CREATE POLICY "recipe_ingredients_delete" ON public.recipe_ingredients
  FOR DELETE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'patissier')
      AND EXISTS (
        SELECT 1 FROM public.recipes r
        WHERE r.id = recipe_id
          AND r.organization_id = public.get_user_organization_id()
      )
    )
  );

-- ──────────────────────────────────────────────
-- TABLE : orders
-- ──────────────────────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT USING (
    public.is_super_admin()
    OR organization_id = public.get_user_organization_id()
  );

CREATE POLICY "orders_insert" ON public.orders
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'vendeur')
      AND organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'vendeur', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "orders_delete" ON public.orders
  FOR DELETE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
  );

-- ──────────────────────────────────────────────
-- TABLE : order_items
-- ──────────────────────────────────────────────
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "order_items_insert" ON public.order_items
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'vendeur')
      AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id
          AND o.organization_id = public.get_user_organization_id()
      )
    )
  );

CREATE POLICY "order_items_update" ON public.order_items
  FOR UPDATE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'vendeur')
      AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id
          AND o.organization_id = public.get_user_organization_id()
      )
    )
  );

CREATE POLICY "order_items_delete" ON public.order_items
  FOR DELETE USING (
    public.is_super_admin()
    OR (
      public.get_user_role() = 'gerant'
      AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id
          AND o.organization_id = public.get_user_organization_id()
      )
    )
  );

-- ──────────────────────────────────────────────
-- TABLE : inventory_logs
-- ──────────────────────────────────────────────
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_logs_select" ON public.inventory_logs
  FOR SELECT USING (
    public.is_super_admin()
    OR organization_id = public.get_user_organization_id()
  );

CREATE POLICY "inventory_logs_insert" ON public.inventory_logs
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_role() IN ('gerant', 'vendeur', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

-- Les logs sont immuables : pas de UPDATE ni DELETE (sauf super_admin pour correction)
CREATE POLICY "inventory_logs_update" ON public.inventory_logs
  FOR UPDATE USING (public.is_super_admin());

CREATE POLICY "inventory_logs_delete" ON public.inventory_logs
  FOR DELETE USING (public.is_super_admin());

-- ============================================================
-- TRIGGER : Mise à jour automatique du stock (current_stock)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_ingredient_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.ingredients
  SET current_stock = current_stock + NEW.quantity_change
  WHERE id = NEW.ingredient_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_ingredient_stock
  AFTER INSERT ON public.inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ingredient_stock();

-- ============================================================
-- TRIGGER : Création automatique du profil après signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role_slug)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role_slug', 'gerant')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FIN DE LA MIGRATION 001
-- ============================================================
