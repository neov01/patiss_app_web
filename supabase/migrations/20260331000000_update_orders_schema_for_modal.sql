-- Update orders schema for NewOrderModal requirements
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normale' CHECK (priority IN ('normale', 'urgent', 'vip')),
  ADD COLUMN IF NOT EXISTS reception_type TEXT DEFAULT 'retrait' CHECK (reception_type IN ('retrait', 'livraison')),
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS order_channel TEXT,
  ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customization_notes TEXT;

-- Update the existing status constraint to include delivered or others if needed
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'production', 'ready', 'completed', 'cancelled', 'delivered', 'in_production'));

-- Update order_items schema
ALTER TABLE public.order_items
  ALTER COLUMN recipe_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  ADD COLUMN IF NOT EXISTS from_inventory BOOLEAN DEFAULT false;
