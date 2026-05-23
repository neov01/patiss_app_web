-- ============================================================
-- Migration : 20260517000000_fix_rls_volatile_null_guard.sql
-- Objectif  : Corriger les fonctions RLS STABLE → VOLATILE
--             et ajouter un garde NULL dans toutes les politiques
--
-- Pourquoi VOLATILE ?
--   Les fonctions STABLE sont mises en cache par PostgreSQL pendant
--   la durée d'une transaction. Si un profil est modifié (changement
--   d'organisation, désactivation) en cours de session, l'ancien
--   résultat reste actif jusqu'à la fin de la transaction.
--   VOLATILE garantit une lecture fraîche à chaque appel.
--
-- Pourquoi le garde NULL ?
--   Si un auth.uid() existe sans profil correspondant (utilisateur
--   créé en dehors du flux normal), get_user_organization_id() retourne
--   NULL. Sans garde, la condition `organization_id = NULL` est toujours
--   FALSE (comportement attendu), mais la politique peut être permissive
--   si elle utilise OR sans vérifier ce cas.
-- ============================================================

-- ── 1. Fonctions helper : STABLE → VOLATILE ─────────────────

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
VOLATILE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role_slug = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
AS $$
  SELECT role_slug FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ── 2. Politiques RLS : ajout du garde NULL ──────────────────
-- Toutes les politiques utilisant get_user_organization_id()
-- reçoivent la condition supplémentaire :
--   AND public.get_user_organization_id() IS NOT NULL
-- Cela assure qu'un utilisateur sans profil n'accède à rien.

-- organizations
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND id = public.get_user_organization_id()
    )
  );

-- profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (
    public.is_super_admin()
    OR id = auth.uid()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
      AND id != auth.uid()
    )
  );

-- ingredients
DROP POLICY IF EXISTS "ingredients_select" ON public.ingredients;
CREATE POLICY "ingredients_select" ON public.ingredients
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "ingredients_insert" ON public.ingredients;
CREATE POLICY "ingredients_insert" ON public.ingredients
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() IN ('gerant', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "ingredients_update" ON public.ingredients;
CREATE POLICY "ingredients_update" ON public.ingredients
  FOR UPDATE USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() IN ('gerant', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "ingredients_delete" ON public.ingredients;
CREATE POLICY "ingredients_delete" ON public.ingredients
  FOR DELETE USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
  );

-- recipes
DROP POLICY IF EXISTS "recipes_select" ON public.recipes;
CREATE POLICY "recipes_select" ON public.recipes
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "recipes_insert" ON public.recipes;
CREATE POLICY "recipes_insert" ON public.recipes
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() IN ('gerant', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "recipes_update" ON public.recipes;
CREATE POLICY "recipes_update" ON public.recipes
  FOR UPDATE USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() IN ('gerant', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "recipes_delete" ON public.recipes;
CREATE POLICY "recipes_delete" ON public.recipes
  FOR DELETE USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
  );

-- orders
DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "orders_insert" ON public.orders;
CREATE POLICY "orders_insert" ON public.orders
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() IN ('gerant', 'vendeur')
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() IN ('gerant', 'vendeur', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "orders_delete" ON public.orders;
CREATE POLICY "orders_delete" ON public.orders
  FOR DELETE USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
  );

-- inventory_logs
DROP POLICY IF EXISTS "inventory_logs_select" ON public.inventory_logs;
CREATE POLICY "inventory_logs_select" ON public.inventory_logs
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "inventory_logs_insert" ON public.inventory_logs;
CREATE POLICY "inventory_logs_insert" ON public.inventory_logs
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() IN ('gerant', 'vendeur', 'patissier')
      AND organization_id = public.get_user_organization_id()
    )
  );

-- transactions (définie dans 20260406222100, réécrite ici avec garde NULL)
DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
CREATE POLICY "transactions_select" ON public.transactions
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;
CREATE POLICY "transactions_insert" ON public.transactions
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND organization_id = public.get_user_organization_id()
    )
  );

-- transaction_items
DROP POLICY IF EXISTS "transaction_items_select" ON public.transaction_items;
CREATE POLICY "transaction_items_select" ON public.transaction_items
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.id = transaction_id
          AND t.organization_id = public.get_user_organization_id()
      )
    )
  );

DROP POLICY IF EXISTS "transaction_items_insert" ON public.transaction_items;
CREATE POLICY "transaction_items_insert" ON public.transaction_items
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.id = transaction_id
          AND t.organization_id = public.get_user_organization_id()
      )
    )
  );
