-- ============================================================
-- Migration : 20260610191500_add_orders_inserted_at.sql
-- Objectif  : Ajouter la colonne inserted_at à la table orders
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inserted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.orders.inserted_at IS 'Date et heure réelles d''insertion de la commande dans la base de données, indépendante de created_at qui peut être surchargée pour l''import historique';
