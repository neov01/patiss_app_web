-- ============================================================
-- Migration : 20260606151000_add_historical_import_fields.sql
-- Objectif  : Ajouter les champs d'importation historique (orders, transactions, profiles)
-- ============================================================

-- 1. Ajout de l'indicateur historique aux tables de ventes
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_historical BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_historical BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Ajout du droit d'importation historique aux profils (délégation)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_import_history BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Commentaires informatifs
COMMENT ON COLUMN public.orders.is_historical IS 'Indique si la commande est importée de l''historique papier pour ne pas impacter les flux actuels';
COMMENT ON COLUMN public.transactions.is_historical IS 'Indique si la transaction appartient à un import historique pour l''exclure des clôtures de caisse actuelles';
COMMENT ON COLUMN public.profiles.can_import_history IS 'Permet d''autoriser un vendeur à accéder au menu d''importation historique';
