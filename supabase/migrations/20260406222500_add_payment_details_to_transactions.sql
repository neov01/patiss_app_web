-- Migration : 20260406222500_add_payment_details_to_transactions.sql
-- Description : Ajout du support pour les paiements multi-méthodes

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.transactions.payment_details IS 'Détail des paiements par méthode : { "especes": 5000, "mobile_money": 2000 }';
