-- Fonction RPC pour récupérer les best-sellers au lieu de fetch tous les items côté client
CREATE OR REPLACE FUNCTION get_best_sellers_v2(
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
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.selling_price,
    COALESCE(p.current_stock, 0) as stock_qty,
    SUM(ti.quantity)::BIGINT as total_sold
  FROM transaction_items ti
  JOIN products p ON ti.product_id = p.id
  WHERE p.organization_id = p_org_id
    AND ti.created_at >= (NOW() - (p_days_limit || ' days')::INTERVAL)
  GROUP BY p.id, p.name, p.selling_price, p.current_stock
  ORDER BY total_sold DESC
  LIMIT p_top_n;
END;
$$;
