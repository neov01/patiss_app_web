-- ============================================================
-- Migration : 20260809110003_get_daily_metrics_exclude_deleted_orders
-- Objectif  : Exclure les commandes supprimées logiquement du calcul du
--             "Volume d'affaires" quotidien, pour rester cohérent avec le
--             reste de l'application (page Commandes, caisse, stats).
-- ============================================================

CREATE OR REPLACE FUNCTION get_daily_metrics(p_org_id uuid, p_target_date date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ca_encaisse numeric;
  v_volume_affaires numeric;
BEGIN
  -- Calcul du CA Encaissé: somme de toutes les transactions de la journée
  SELECT COALESCE(sum(amount), 0)
  INTO v_ca_encaisse
  FROM transactions
  WHERE organization_id = p_org_id
  AND created_at::date = p_target_date;

  -- Calcul du Volume d'Affaires: somme de toutes les commandes créées la journée
  SELECT COALESCE(sum(total_amount), 0)
  INTO v_volume_affaires
  FROM orders
  WHERE organization_id = p_org_id
  AND created_at::date = p_target_date
  AND deleted_at IS NULL;

  RETURN json_build_object(
    'ca_encaisse', v_ca_encaisse,
    'volume_affaires', v_volume_affaires
  );
END;
$$;
