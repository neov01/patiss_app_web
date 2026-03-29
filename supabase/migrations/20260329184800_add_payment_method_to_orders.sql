-- Add payment_method column to orders table
-- Values: 'especes' (cash) | 'mobile_money' | 'mixte' | 'en_attente' (pending)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'en_attente' 
    CHECK (payment_method IN ('especes', 'mobile_money', 'mixte', 'en_attente'));

-- Add mobile_money_amount for "mixte" payments (the mobile portion)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS mobile_money_amount NUMERIC(10,2) DEFAULT 0;
