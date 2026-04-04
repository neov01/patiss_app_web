-- ====================================================
-- MIGRATION: UNIFICATION DU CATALOGUE PRODUITS
-- Nettoyage de l'ancienne table `recipes` et de ses dépendances.
-- Remplacement des `recipe_id` par `product_id` dans tout le système (caisse, commandes).
-- ====================================================

-- 1. Modification des types et relations dans le système de Commandes (Orders)
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_recipe_id_fkey;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.order_items DROP COLUMN IF EXISTS recipe_id CASCADE;

-- 2. Modification des types et relations dans le système de Caisse (Transactions)
ALTER TABLE public.transaction_items DROP CONSTRAINT IF EXISTS transaction_items_recipe_id_fkey;
ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.transaction_items DROP COLUMN IF EXISTS recipe_id CASCADE;

-- 3. Mise à jour de l'index des items de transaction
DROP INDEX IF EXISTS idx_trans_items_recipe;
CREATE INDEX IF NOT EXISTS idx_trans_items_product ON public.transaction_items(product_id);

-- 4. Suppression définitive et propre des anciennes tables redondantes
DROP TABLE IF EXISTS public.recipe_ingredients CASCADE;
DROP TABLE IF EXISTS public.recipes CASCADE;

-- 5. Adaptation des politiques de sécurité associées au besoin (les dépendances à recipes ont été supprimées plus haut).
