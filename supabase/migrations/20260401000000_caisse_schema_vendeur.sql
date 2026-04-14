-- ============================================================
-- Pâtiss'App — Migration Vue Caisse (Vendeur)
-- ============================================================

-- 1. Modifier la table RECIPES pour ajouter le suivi de stock
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS stock_qty INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Créer la table TRANSACTIONS avec organization_id
CREATE TABLE public.transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  client_name text NOT NULL DEFAULT 'Vente vitrine',
  amount numeric NOT NULL,
  payment_method text NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  created_by uuid REFERENCES auth.users(id)
);

-- Index pour accélérer les requêtes journalières
CREATE INDEX IF NOT EXISTS idx_transactions_org_created_at ON public.transactions(organization_id, created_at);

-- 3. Créer la table TRANSACTION_ITEMS
CREATE TABLE public.transaction_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL,
  subtotal numeric GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- Index pour les statistiques de ventes (best-sellers)
CREATE INDEX IF NOT EXISTS idx_trans_items_recipe ON public.transaction_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_trans_items_transaction ON public.transaction_items(transaction_id);

-- 4. Créer la fonction RPV pour décrémenter le stock
CREATE OR REPLACE FUNCTION decrement_stock(
  p_recipe_id uuid,
  p_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.recipes
  SET stock_qty = GREATEST(0, stock_qty - p_qty)
  WHERE id = p_recipe_id;
END;
$$;

-- 5. Configurer le RLS pour Transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can insert transactions" 
ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can select transactions" 
ON public.transactions FOR SELECT TO authenticated USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert transaction_items" 
ON public.transaction_items FOR INSERT TO authenticated WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can select transaction_items" 
ON public.transaction_items FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
