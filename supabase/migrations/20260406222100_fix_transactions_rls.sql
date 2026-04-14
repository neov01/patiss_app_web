-- Migration : 20260406222100_fix_transactions_rls.sql
-- Description : Correction des politiques RLS permissives sur les transactions

-- 1. Table Transactions
DROP POLICY IF EXISTS "Authenticated can select transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;

CREATE POLICY "transactions_select" ON public.transactions 
FOR SELECT USING (is_super_admin() OR organization_id = get_user_organization_id());

CREATE POLICY "transactions_insert" ON public.transactions 
FOR INSERT WITH CHECK (is_super_admin() OR organization_id = get_user_organization_id());

-- 2. Table Transaction Items
DROP POLICY IF EXISTS "Authenticated can select transaction_items" ON public.transaction_items;
DROP POLICY IF EXISTS "Authenticated can insert transaction_items" ON public.transaction_items;
DROP POLICY IF EXISTS "transaction_items_select" ON public.transaction_items;
DROP POLICY IF EXISTS "transaction_items_insert" ON public.transaction_items;

CREATE POLICY "transaction_items_select" ON public.transaction_items 
FOR SELECT USING (
  is_super_admin() 
  OR EXISTS (
    SELECT 1 FROM public.transactions t 
    WHERE t.id = transaction_id 
      AND t.organization_id = get_user_organization_id()
  )
);

CREATE POLICY "transaction_items_insert" ON public.transaction_items 
FOR INSERT WITH CHECK (
  is_super_admin() 
  OR EXISTS (
    SELECT 1 FROM public.transactions t 
    WHERE t.id = transaction_id 
      AND t.organization_id = get_user_organization_id()
  )
);
