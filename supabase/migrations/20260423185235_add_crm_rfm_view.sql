-- Création de la vue d'analyse RFM (Recency, Frequency, Monetary)
-- Utilise NTILE(4) pour segmenter les clients par organisation

CREATE OR REPLACE VIEW customer_rfm AS
WITH rfm_raw AS (
  SELECT
    c.id AS customer_id,
    c.organization_id,
    c.name,
    c.phone,
    c.loyalty_points,
    COUNT(t.id)                          AS frequency,
    MAX(t.created_at)                    AS last_purchase_at,
    COALESCE(SUM(t.amount), 0)           AS monetary,
    NOW() - MAX(t.created_at)            AS recency_interval
  FROM customers c
  LEFT JOIN transactions t ON t.customer_id = c.id
  GROUP BY c.id, c.organization_id, c.name, c.phone, c.loyalty_points
),
rfm_scored AS (
  SELECT *,
    NTILE(4) OVER (PARTITION BY organization_id ORDER BY recency_interval ASC)  AS r_score,
    NTILE(4) OVER (PARTITION BY organization_id ORDER BY frequency DESC)         AS f_score,
    NTILE(4) OVER (PARTITION BY organization_id ORDER BY monetary DESC)          AS m_score
  FROM rfm_raw
)
SELECT *,
  CASE
    WHEN r_score = 4 AND f_score = 4 THEN 'Champion'
    WHEN r_score >= 3 AND f_score >= 3 THEN 'Fidèle'
    WHEN r_score >= 3 AND f_score <= 2 THEN 'Prometteur'
    WHEN r_score <= 2 AND f_score >= 3 THEN 'À Risque'
    WHEN r_score = 1 AND f_score = 1  THEN 'Perdu'
    ELSE 'Occasionnel'
  END AS rfm_segment
FROM rfm_scored;
