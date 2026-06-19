-- ============================================================
-- Migration : 20260619000000_multi_payments
-- Objectif  : Implémentation des paiements multiples et de la séparation des statuts
-- ============================================================

-- 1. Ajouter paid_amount et modifier orders_status_check
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'draft', 'confirmed', 'in_preparation', 'ready', 'awaiting_pickup', 'delivered', 'cancelled',
  'pending', 'production', 'completed', 'in_production' -- conservation pour compatibilité ascendante
));

-- 2. Créer la table order_payments
CREATE TABLE IF NOT EXISTS public.order_payments (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id        UUID          NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount          DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT          NOT NULL CHECK (payment_method IN ('cash', 'orange_money', 'wave', 'mobile_money', 'moov_money', 'bank_transfer', 'other')),
  payment_date    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  note            TEXT,
  created_by      UUID          REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour accélérer les jointures
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON public.order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_org_id ON public.order_payments(organization_id);

-- 3. Activer RLS pour order_payments
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_payments_select" ON public.order_payments;
CREATE POLICY "order_payments_select" ON public.order_payments
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "order_payments_insert" ON public.order_payments;
CREATE POLICY "order_payments_insert" ON public.order_payments
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() IN ('gerant', 'vendeur')
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "order_payments_update" ON public.order_payments;
CREATE POLICY "order_payments_update" ON public.order_payments
  FOR UPDATE USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() IN ('gerant', 'vendeur')
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "order_payments_delete" ON public.order_payments;
CREATE POLICY "order_payments_delete" ON public.order_payments
  FOR DELETE USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
  );

-- 4. Ajouter la colonne order_payment_id à transactions
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS order_payment_id UUID REFERENCES public.order_payments(id) ON DELETE CASCADE;

-- 5. Normalisation des modes de paiement existants dans transactions et orders
UPDATE public.transactions
SET payment_method = CASE
  WHEN payment_method IN ('Espèces', 'especes') THEN 'cash'
  WHEN payment_method IN ('Orange Money', 'orange_money') THEN 'orange_money'
  WHEN payment_method IN ('Wave', 'wave') THEN 'wave'
  WHEN payment_method IN ('MTN MOMO', 'mobile_money', 'mixte') THEN 'mobile_money'
  WHEN payment_method IN ('Moov Money', 'moov_money') THEN 'moov_money'
  ELSE 'other'
END;

UPDATE public.orders
SET payment_method = CASE
  WHEN payment_method IN ('especes') THEN 'cash'
  WHEN payment_method IN ('mobile_money') THEN 'mobile_money'
  WHEN payment_method IN ('wave') THEN 'wave'
  WHEN payment_method IN ('orange_money') THEN 'orange_money'
  WHEN payment_method IN ('moov_money') THEN 'moov_money'
  WHEN payment_method IN ('mixte') THEN 'other'
  ELSE 'unpaid'
END;

-- Migration des statuts opérationnels existants dans orders
UPDATE public.orders
SET status = CASE
  WHEN status = 'pending' THEN 'confirmed'
  WHEN status = 'production' THEN 'in_preparation'
  WHEN status = 'completed' THEN 'delivered'
  ELSE status
END;

-- Migration des statuts de paiement existants dans orders
UPDATE public.orders
SET payment_status = CASE
  WHEN payment_status = 'SOLDEE' THEN 'paid'
  WHEN payment_status = 'PARTIEL' THEN 'partial'
  WHEN payment_status = 'EN_ATTENTE' THEN 'unpaid'
  ELSE 'unpaid'
END;

-- 6. Migrer l'historique des transactions liées vers order_payments et lier les lignes
INSERT INTO public.order_payments (id, organization_id, order_id, amount, payment_method, payment_date, note, created_by, created_at)
SELECT 
  gen_random_uuid() as id, 
  organization_id, 
  order_id, 
  amount, 
  payment_method, 
  COALESCE(created_at, NOW()) as payment_date, 
  'Migration historique depuis transactions' as note, 
  created_by, 
  COALESCE(created_at, NOW()) as created_at
FROM public.transactions
WHERE order_id IS NOT NULL AND amount > 0;

-- Mettre à jour les transactions avec les ID des nouveaux paiements créés
UPDATE public.transactions t
SET order_payment_id = p.id
FROM public.order_payments p
WHERE t.order_id = p.order_id 
  AND t.amount = p.amount 
  AND t.payment_method = p.payment_method
  AND t.order_payment_id IS NULL;

-- 7. Créer la fonction de recalcul
CREATE OR REPLACE FUNCTION public.recalculate_order_payment_status(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_amount NUMERIC;
  v_total_paid NUMERIC;
  v_payment_count INTEGER;
  v_payment_status TEXT;
  v_balance NUMERIC;
BEGIN
  -- Récupérer le montant total de la commande
  SELECT total_amount INTO v_total_amount FROM public.orders WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculer la somme et le nombre de paiements
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_total_paid, v_payment_count
  FROM public.order_payments
  WHERE order_id = p_order_id;

  -- Déterminer le statut
  IF v_total_paid = 0 THEN
    v_payment_status := 'unpaid';
  ELSIF v_total_paid >= v_total_amount THEN
    IF v_total_paid > v_total_amount THEN
      v_payment_status := 'overpaid';
    ELSE
      v_payment_status := 'paid';
    END IF;
  ELSE
    -- v_total_paid < v_total_amount
    IF v_payment_count = 1 THEN
      v_payment_status := 'deposit_paid';
    ELSE
      v_payment_status := 'partial';
    END IF;
  END IF;

  v_balance := GREATEST(0, v_total_amount - v_total_paid);

  -- Mettre à jour la commande
  UPDATE public.orders
  SET paid_amount = v_total_paid,
      balance = v_balance,
      payment_status = v_payment_status
  WHERE id = p_order_id;
END;
$$;

-- 8. Créer les fonctions de trigger pour synchronisation bidirectionnelle et recalcul
CREATE OR REPLACE FUNCTION public.on_order_payment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM public.recalculate_order_payment_status(NEW.order_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_order_payment_status(OLD.order_id);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_payments_change ON public.order_payments;
CREATE TRIGGER trg_order_payments_change
AFTER INSERT OR UPDATE OR DELETE ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION public.on_order_payment_change();

-- Synchronisation de order_payments vers transactions
CREATE OR REPLACE FUNCTION public.sync_order_payment_to_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_name TEXT;
  v_customer_id UUID;
BEGIN
  SELECT customer_name, customer_id
  INTO v_client_name, v_customer_id
  FROM public.orders
  WHERE id = NEW.order_id;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.transactions WHERE order_payment_id = NEW.id
    ) THEN
      INSERT INTO public.transactions (
        organization_id,
        order_id,
        customer_id,
        client_name,
        amount,
        payment_method,
        payment_details,
        label_type,
        created_by,
        created_at,
        order_payment_id
      ) VALUES (
        NEW.organization_id,
        NEW.order_id,
        v_customer_id,
        COALESCE(v_client_name, 'Client de commande'),
        NEW.amount,
        NEW.payment_method,
        jsonb_build_object(NEW.payment_method, NEW.amount),
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM public.order_payments 
            WHERE order_id = NEW.order_id AND id <> NEW.id AND payment_date < NEW.payment_date
          ) THEN 'SOLDE' 
          ELSE 'ACOMPTE' 
        END,
        NEW.created_by,
        NEW.payment_date,
        NEW.id
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.transactions
    SET amount = NEW.amount,
        payment_method = NEW.payment_method,
        payment_details = jsonb_build_object(NEW.payment_method, NEW.amount),
        created_at = NEW.payment_date
    WHERE order_payment_id = NEW.id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.transactions WHERE order_payment_id = OLD.id;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_payment_to_transaction ON public.order_payments;
CREATE TRIGGER trg_sync_order_payment_to_transaction
AFTER INSERT OR UPDATE OR DELETE ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_order_payment_to_transaction();

-- Synchronisation de transactions vers order_payments
CREATE OR REPLACE FUNCTION public.sync_transaction_to_order_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_payment_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.order_id IS NOT NULL AND NEW.amount > 0 AND NEW.order_payment_id IS NULL THEN
      INSERT INTO public.order_payments (
        organization_id,
        order_id,
        amount,
        payment_method,
        payment_date,
        note,
        created_by,
        created_at
      ) VALUES (
        NEW.organization_id,
        NEW.order_id,
        NEW.amount,
        NEW.payment_method,
        NEW.created_at,
        'Créé via transaction de caisse',
        NEW.created_by,
        NEW.created_at
      )
      RETURNING id INTO v_order_payment_id;
      
      NEW.order_payment_id := v_order_payment_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.order_payment_id IS NOT NULL THEN
      UPDATE public.order_payments
      SET amount = NEW.amount,
          payment_method = NEW.payment_method,
          payment_date = NEW.created_at
      WHERE id = NEW.order_payment_id
        AND (amount IS DISTINCT FROM NEW.amount OR payment_method IS DISTINCT FROM NEW.payment_method OR payment_date IS DISTINCT FROM NEW.created_at);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.order_payment_id IS NOT NULL THEN
      DELETE FROM public.order_payments WHERE id = OLD.order_payment_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_transaction_to_order_payment ON public.transactions;
CREATE TRIGGER trg_sync_transaction_to_order_payment
BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_transaction_to_order_payment();

-- Recalculer toutes les commandes existantes pour initialiser paid_amount, balance et payment_status
DO $$
DECLARE
  v_order_id UUID;
BEGIN
  FOR v_order_id IN SELECT id FROM public.orders LOOP
    PERFORM public.recalculate_order_payment_status(v_order_id);
  END LOOP;
END;
$$;
