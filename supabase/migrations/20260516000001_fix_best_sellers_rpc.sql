-- Fix 1: ti.created_at n'existe pas → JOIN transactions pour t.created_at
-- Fix 2: Fallback all-time si moins de p_top_n produits sur la fenêtre glissante
--        (utile en phase de démarrage avec peu de transactions)

DROP FUNCTION IF EXISTS get_best_sellers_v2(uuid, integer, integer);

CREATE FUNCTION get_best_sellers_v2(
  p_org_id UUID,
  p_days_limit INT DEFAULT 30,
  p_top_n INT DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  selling_price NUMERIC,
  stock_qty INT,
  total_sold BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Essayer d'abord sur la fenêtre glissante (p_days_limit jours)
  SELECT COUNT(DISTINCT p.id) INTO v_count
  FROM transaction_items ti
  JOIN transactions t ON ti.transaction_id = t.id
  JOIN products p ON ti.product_id = p.id
  WHERE t.organization_id = p_org_id
    AND t.created_at >= (NOW() - (p_days_limit || ' days')::INTERVAL);

  -- Si la fenêtre glissante donne au moins p_top_n produits distincts → résultats récents
  IF v_count >= p_top_n THEN
    RETURN QUERY
    SELECT
      p.id, p.name, p.selling_price,
      COALESCE(p.current_stock, 0) AS stock_qty,
      SUM(ti.quantity)::BIGINT AS total_sold
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    JOIN products p ON ti.product_id = p.id
    WHERE t.organization_id = p_org_id
      AND t.created_at >= (NOW() - (p_days_limit || ' days')::INTERVAL)
    GROUP BY p.id, p.name, p.selling_price, p.current_stock
    ORDER BY total_sold DESC
    LIMIT p_top_n;

  -- Sinon → fallback sur toute la période (démarrage ou peu de ventes)
  ELSE
    RETURN QUERY
    SELECT
      p.id, p.name, p.selling_price,
      COALESCE(p.current_stock, 0) AS stock_qty,
      SUM(ti.quantity)::BIGINT AS total_sold
    FROM transaction_items ti
    JOIN transactions t ON ti.transaction_id = t.id
    JOIN products p ON ti.product_id = p.id
    WHERE t.organization_id = p_org_id
    GROUP BY p.id, p.name, p.selling_price, p.current_stock
    ORDER BY total_sold DESC
    LIMIT p_top_n;
  END IF;
END;
$$;
