-- =========================================================================
-- Migration : 20260620191800_fix_triggers_for_deletes
-- Objectif  : 
--   1. Corriger public.sync_order_payment_to_transaction() pour éviter
--      d'accéder à NEW dans un événement de DELETE.
--   2. Corriger le trigger trg_sync_transaction_to_order_payment pour
--      qu'il ne se déclenche que BEFORE INSERT, afin d'éviter que le
--      retour de NEW (qui est NULL lors d'un DELETE) n'annule les suppressions.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.sync_order_payment_to_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_name TEXT;
  v_customer_id UUID;
  v_total_amount NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT customer_name, customer_id, total_amount
    INTO v_client_name, v_customer_id, v_total_amount
    FROM public.orders
    WHERE id = NEW.order_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Les order_payments crees par le trigger transactions -> order_payments
    -- ne doivent pas recreer une seconde transaction miroir.
    IF NEW.note = 'Créé via transaction de caisse' THEN
      RETURN NEW;
    END IF;

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
          -- Si un autre paiement antérieur existe
          WHEN EXISTS (
            SELECT 1 FROM public.order_payments 
            WHERE order_id = NEW.order_id AND id <> NEW.id AND payment_date < NEW.payment_date
          ) THEN 'SOLDE'
          -- Si le paiement actuel couvre le montant total de la commande
          WHEN NEW.amount >= v_total_amount THEN 'SOLDE'
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
        created_at = NEW.payment_date,
        customer_id = v_customer_id,
        client_name = COALESCE(v_client_name, client_name)
    WHERE order_payment_id = NEW.id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.transactions WHERE order_payment_id = OLD.id;
    RETURN OLD;
  END IF;
END;
$$;

-- Recréer le trigger pour qu'il s'exécute uniquement BEFORE INSERT
DROP TRIGGER IF EXISTS trg_sync_transaction_to_order_payment ON public.transactions;
CREATE TRIGGER trg_sync_transaction_to_order_payment
BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_transaction_to_order_payment_before_insert();
