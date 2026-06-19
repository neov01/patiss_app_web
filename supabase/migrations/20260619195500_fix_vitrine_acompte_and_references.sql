-- 1. Mettre à jour la fonction de trigger de synchronisation order_payments -> transactions
-- pour classer en 'SOLDE' tout paiement unique qui couvre le montant de la commande.
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
  SELECT customer_name, customer_id, total_amount
  INTO v_client_name, v_customer_id, v_total_amount
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
        created_at = NEW.payment_date
    WHERE order_payment_id = NEW.id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.transactions WHERE order_payment_id = OLD.id;
    RETURN OLD;
  END IF;
END;
$$;

-- 2. Corriger rétroactivement les transactions historiques "Client Vitrine" étiquetées à tort 'ACOMPTE'
UPDATE public.transactions
SET label_type = 'SOLDE'
WHERE label_type = 'ACOMPTE'
  AND (client_name = 'Client Vitrine' OR client_name = 'Vente vitrine');
