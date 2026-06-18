-- Migration : 20260614000001_fix_transactions_foreign_key_profiles.sql
-- Objectif  : Modifier la contrainte de clé étrangère sur public.transactions(created_by) 
--             pour qu'elle cible public.profiles(id) au lieu de auth.users(id).
-- Référence : Documentation de résolution de contraintes Supabase (Context7)

BEGIN;

-- 1. Supprimer l'ancienne contrainte pointant vers auth.users
ALTER TABLE public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_created_by_fkey;

-- 2. Ajouter la nouvelle contrainte ciblant public.profiles avec option SET NULL
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;

COMMIT;
