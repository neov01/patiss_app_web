-- ==========================================
-- 1. TABLE DES PRODUITS (Catalogue Unifié)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Gâteaux', 'Viennoiseries', 'Petits fours', 'Boissons', 'Autres')),
    type TEXT NOT NULL CHECK (type IN ('maison', 'revente')),
    selling_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
    purchase_cost NUMERIC(15, 2) DEFAULT 0,
    track_stock BOOLEAN DEFAULT FALSE,
    current_stock INTEGER DEFAULT 0,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexation pour performance multi-tenant
CREATE INDEX IF NOT EXISTS idx_products_org_id ON public.products(organization_id);

-- ===================================================
-- 2. TABLE DE LIAISON : COMPOSITION (Fait Maison)
-- ===================================================
CREATE TABLE IF NOT EXISTS public.product_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
    quantity NUMERIC(10, 3) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_ingredients_product ON public.product_ingredients(product_id);

-- ==========================================
-- 3. SÉCURITÉ (RLS)
-- ==========================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_ingredients ENABLE ROW LEVEL SECURITY;

-- Politiques Products
DROP POLICY IF EXISTS "Users can view products from their organization" ON public.products;
CREATE POLICY "Users can view products from their organization"
ON public.products FOR SELECT
USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert products into their organization" ON public.products;
CREATE POLICY "Users can insert products into their organization"
ON public.products FOR INSERT
WITH CHECK (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Users can update products from their organization" ON public.products;
CREATE POLICY "Users can update products from their organization"
ON public.products FOR UPDATE
USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
);

-- Politiques Product Ingredients (basées sur le produit parent)
DROP POLICY IF EXISTS "Users can view product ingredients of their org" ON public.product_ingredients;
CREATE POLICY "Users can view product ingredients of their org"
ON public.product_ingredients FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_ingredients.product_id
        AND p.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can manage product ingredients of their org" ON public.product_ingredients;
CREATE POLICY "Users can manage product ingredients of their org"
ON public.product_ingredients FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = product_ingredients.product_id
        AND p.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
);
