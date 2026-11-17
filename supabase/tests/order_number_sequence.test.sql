-- ============================================================
-- Test SQL de la migration 20261117200000_order_number_sequence
-- À exécuter sur une base de TEST (branche Supabase ou base locale),
-- JAMAIS directement sur la production : le script crée des lignes puis
-- annule tout (ROLLBACK), mais il prend des verrous.
--   psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/order_number_sequence.test.sql
-- Succès = aucun message d'erreur et la ligne finale « TOUS LES TESTS OK ».
-- ============================================================
BEGIN;

DO $$
DECLARE
  v_org_a  UUID;
  v_org_b  UUID;
  n1 TEXT; n2 TEXT; n3 TEXT; n4 TEXT; nb1 TEXT;
  v_year INT := EXTRACT(YEAR FROM (now() AT TIME ZONE 'UTC'))::int;
BEGIN
  SELECT id INTO v_org_a FROM public.organizations ORDER BY created_at NULLS LAST, id LIMIT 1;
  SELECT id INTO v_org_b FROM public.organizations WHERE id <> v_org_a ORDER BY created_at NULLS LAST, id LIMIT 1;
  IF v_org_a IS NULL OR v_org_b IS NULL THEN
    RAISE EXCEPTION 'Le test nécessite au moins 2 organisations dans la base de test';
  END IF;

  DELETE FROM public.order_number_counters WHERE organization_id IN (v_org_a, v_org_b) AND year = v_year;
  UPDATE public.organizations SET order_code = 'TSA' WHERE id = v_org_a;
  UPDATE public.organizations SET order_code = 'TSB' WHERE id = v_org_b;

  -- 1. Format et séquence consécutive
  n1 := public.next_order_number(v_org_a);
  n2 := public.next_order_number(v_org_a);
  IF n1 <> 'CMD-TSA-' || v_year || '-000001' THEN RAISE EXCEPTION 'Format inattendu: %', n1; END IF;
  IF n2 <> 'CMD-TSA-' || v_year || '-000002' THEN RAISE EXCEPTION 'Séquence non consécutive: %', n2; END IF;

  -- 2. Sans trou : un numéro attribué puis annulé (rollback) est réattribué
  BEGIN
    PERFORM public.next_order_number(v_org_a);           -- 000003 consommé...
    RAISE EXCEPTION 'echec simule';                       -- ...puis la transaction interne échoue
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'echec simule' THEN RAISE; END IF;
  END;
  n3 := public.next_order_number(v_org_a);
  IF n3 <> 'CMD-TSA-' || v_year || '-000003' THEN
    RAISE EXCEPTION 'TROU détecté: le numéro annulé n''a pas été réattribué (%)', n3;
  END IF;

  -- 3. Compteurs indépendants par pâtisserie
  nb1 := public.next_order_number(v_org_b);
  IF nb1 <> 'CMD-TSB-' || v_year || '-000001' THEN RAISE EXCEPTION 'Compteur org B incorrect: %', nb1; END IF;

  -- 4. Aucun numéro généré ne peut entrer en collision avec un ancien numéro aléatoire
  IF EXISTS (SELECT 1 FROM public.orders WHERE order_number IN (n1, n2, n3, nb1)) THEN
    RAISE EXCEPTION 'Collision avec un numéro existant';
  END IF;

  -- 5. Le code est obligatoirement au bon format
  BEGIN
    UPDATE public.organizations SET order_code = 'pas valide!' WHERE id = v_org_a;
    RAISE EXCEPTION 'La contrainte de format aurait dû refuser la valeur';
  EXCEPTION WHEN check_violation THEN
    NULL; -- attendu
  END;

  -- 6. Les rôles applicatifs ne peuvent pas appeler la fonction directement
  IF has_function_privilege('authenticated', 'public.next_order_number(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.next_order_number(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'next_order_number ne doit pas être exécutable par authenticated/anon';
  END IF;
  IF has_table_privilege('authenticated', 'public.order_number_counters', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'order_number_counters ne doit pas être accessible aux rôles applicatifs';
  END IF;

  -- 7. Un numéro déjà occupé (saisi à la main) est sauté, sans bloquer la création
  INSERT INTO public.orders (id, organization_id, customer_name, pickup_date, total_amount, order_number)
  VALUES (gen_random_uuid(), v_org_a, 'Import manuel', now(), 1000, 'CMD-TSA-' || v_year || '-000004');
  n4 := public.next_order_number(v_org_a);
  IF n4 <> 'CMD-TSA-' || v_year || '-000005' THEN
    RAISE EXCEPTION 'Le numéro occupé n''a pas été sauté (obtenu: %)', n4;
  END IF;

  RAISE NOTICE 'TOUS LES TESTS OK';
END $$;

ROLLBACK;
