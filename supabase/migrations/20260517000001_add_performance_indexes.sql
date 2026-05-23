-- ============================================================
-- Migration : 20260517000001_add_performance_indexes.sql
-- Objectif  : Ajouter les index manquants sur les tables critiques
--             pour les requêtes financières, CRM et caisse.
--
-- Impact attendu : 10–100× accélération sur les requêtes fréquentes
-- ============================================================

-- Transactions : requêtes financières (rapports, IA, caisse)
CREATE INDEX IF NOT EXISTS idx_transactions_org_created_at
  ON public.transactions(organization_id, created_at DESC);

-- Transactions : lookup CRM (vue RFM)
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id
  ON public.transactions(customer_id);

-- Transaction items : JOIN avec transactions dans les rapports IA
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id
  ON public.transaction_items(transaction_id);

-- Orders : filtre caisse + planning (pickup_date est très fréquent)
CREATE INDEX IF NOT EXISTS idx_orders_org_pickup_date
  ON public.orders(organization_id, pickup_date);

-- Customers : lookup par téléphone (CRM temps réel depuis caisse)
-- IF EXISTS car la table peut avoir été créée dans le dashboard Supabase
CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON public.customers(phone);

-- Customers : isolation multi-tenant
CREATE INDEX IF NOT EXISTS idx_customers_organization_id
  ON public.customers(organization_id);
