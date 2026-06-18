-- Migration : 20260616160000_add_customer_birth_date.sql
-- Objectif  : Ajouter la date de naissance pour les clients et mettre à jour la vue RFM.

-- 1. Ajouter la colonne birth_date sur la table customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birth_date DATE;

-- 2. Recréer la vue customer_rfm en y incluant birth_date
CREATE OR REPLACE VIEW public.customer_rfm AS
WITH rfm_raw AS (
  SELECT
    c.id AS customer_id,
    c.organization_id,
    c.name,
    c.phone,
    c.loyalty_points,
    c.birth_date,
    COALESCE(COUNT(DISTINCT t.order_id), 0) + COALESCE(COUNT(t.id) FILTER (WHERE t.order_id IS NULL), 0) AS frequency,
    MAX(t.created_at)                    AS last_purchase_at,
    COALESCE(SUM(t.amount), 0)           AS monetary,
    NOW() - MAX(t.created_at)            AS recency_interval
  FROM public.customers c
  LEFT JOIN public.transactions t ON t.customer_id = c.id
  GROUP BY c.id, c.organization_id, c.name, c.phone, c.loyalty_points, c.birth_date
),
rfm_scored AS (
  SELECT *,
    NTILE(4) OVER (PARTITION BY organization_id ORDER BY recency_interval DESC)  AS r_score,
    NTILE(4) OVER (PARTITION BY organization_id ORDER BY frequency ASC)          AS f_score,
    NTILE(4) OVER (PARTITION BY organization_id ORDER BY monetary ASC)           AS m_score
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
