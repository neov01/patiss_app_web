-- Remove delivery_fee column from orders table
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS delivery_fee;
