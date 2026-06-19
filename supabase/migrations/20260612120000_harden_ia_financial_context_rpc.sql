-- Durcissement de get_ia_financial_context.
-- La fonction reste SECURITY DEFINER pour lire un contexte agrégé, mais elle
-- vérifie explicitement que l'appelant authentifié appartient à l'organisation
-- demandée ou possède le rôle super_admin.

CREATE OR REPLACE FUNCTION get_ia_financial_context(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_organization_id() = p_org_id
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden organization'
      USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(

    -- CA mensuel sur 12 mois glissants
    'ca_mensuel', (
      SELECT json_agg(row_to_json(m) ORDER BY m.mois)
      FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS mois,
          SUM(amount) AS ca,
          COUNT(*) AS nb_transactions
        FROM transactions
        WHERE organization_id = p_org_id
          AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
      ) m
    ),

    -- CA quotidien sur 30 jours
    'ca_quotidien_30j', (
      SELECT json_agg(row_to_json(d) ORDER BY d.jour)
      FROM (
        SELECT
          TO_CHAR(created_at::date, 'YYYY-MM-DD') AS jour,
          SUM(amount) AS ca
        FROM transactions
        WHERE organization_id = p_org_id
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY created_at::date
      ) d
    ),

    -- Transactions récentes (7j)
    'transactions_recentes', (
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT client_name, amount, payment_method, label_type,
               TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS date_heure
        FROM transactions
        WHERE organization_id = p_org_id
          AND created_at >= NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 50
      ) t
    ),

    -- Commandes impayées (solde > 0)
    'commandes_impayees', (
      SELECT json_agg(row_to_json(o))
      FROM (
        SELECT order_number, customer_name, total_amount, deposit_amount, balance,
               TO_CHAR(pickup_date, 'DD/MM/YYYY') AS date_retrait, status, priority
        FROM orders
        WHERE organization_id = p_org_id
          AND payment_status IN ('EN_ATTENTE', 'PARTIEL')
          AND status NOT IN ('cancelled')
        ORDER BY pickup_date ASC
        LIMIT 30
      ) o
    ),

    -- Commandes à venir (30 prochains jours)
    'commandes_a_venir', (
      SELECT json_agg(row_to_json(o))
      FROM (
        SELECT order_number, customer_name, total_amount, deposit_amount, balance,
               TO_CHAR(pickup_date, 'DD/MM/YYYY') AS date_retrait,
               status, priority, reception_type
        FROM orders
        WHERE organization_id = p_org_id
          AND pickup_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
          AND status NOT IN ('completed', 'cancelled')
        ORDER BY pickup_date ASC
        LIMIT 30
      ) o
    ),

    -- Résumé mensuel des commandes sur 12 mois (historique)
    'commandes_historique', (
      SELECT json_agg(row_to_json(m) ORDER BY m.mois)
      FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS mois,
          COUNT(*) AS nb_commandes,
          SUM(total_amount) AS volume_total,
          SUM(deposit_amount) AS acomptes_percus,
          ROUND(AVG(total_amount)::numeric, 0) AS panier_moyen,
          COUNT(*) FILTER (WHERE payment_status = 'SOLDEE') AS nb_soldees
        FROM orders
        WHERE organization_id = p_org_id
          AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
      ) m
    ),

    -- Catalogue produits actifs avec marges calculées
    'catalogue_produits', (
      SELECT json_agg(row_to_json(p))
      FROM (
        SELECT
          name, category, type, selling_price, purchase_cost,
          current_stock,
          CASE WHEN selling_price > 0
            THEN ROUND(((selling_price - COALESCE(purchase_cost, 0)) / selling_price * 100)::numeric, 1)
            ELSE NULL
          END AS marge_pct
        FROM products
        WHERE organization_id = p_org_id AND is_active = true
        ORDER BY category, name
      ) p
    ),

    -- Top 10 produits all-time (toutes transactions confondues)
    'top_produits_alltime', (
      SELECT json_agg(row_to_json(tp))
      FROM (
        SELECT
          p.name, p.category,
          SUM(ti.quantity) AS total_vendu,
          SUM(ti.quantity * ti.unit_price) AS ca_genere
        FROM transaction_items ti
        JOIN products p ON ti.product_id = p.id
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE t.organization_id = p_org_id
        GROUP BY p.id, p.name, p.category
        ORDER BY total_vendu DESC
        LIMIT 10
      ) tp
    ),

    -- Répartition livraison vs retrait (12 mois)
    'repartition_reception', (
      SELECT json_agg(row_to_json(r))
      FROM (
        SELECT
          reception_type,
          COUNT(*) AS nb_commandes,
          SUM(total_amount) AS ca_total
        FROM orders
        WHERE organization_id = p_org_id
          AND created_at >= NOW() - INTERVAL '12 months'
          AND status NOT IN ('cancelled')
        GROUP BY reception_type
      ) r
    ),

    -- Répartition par canal de commande (WhatsApp, Instagram, Sur place…)
    'repartition_canaux', (
      SELECT json_agg(row_to_json(c))
      FROM (
        SELECT
          order_channel,
          COUNT(*) AS nb_commandes,
          SUM(total_amount) AS ca_total
        FROM orders
        WHERE organization_id = p_org_id
          AND created_at >= NOW() - INTERVAL '12 months'
          AND status NOT IN ('cancelled')
        GROUP BY order_channel
        ORDER BY nb_commandes DESC
      ) c
    ),

    -- Ventilation par méthode de paiement (Espèces, Orange Money, Wave…)
    'repartition_paiements', (
      SELECT json_agg(row_to_json(p))
      FROM (
        SELECT
          payment_method,
          COUNT(*) AS nb_transactions,
          SUM(amount) AS montant_total
        FROM transactions
        WHERE organization_id = p_org_id
          AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY payment_method
        ORDER BY montant_total DESC
      ) p
    ),

    -- Alertes stock ingrédients
    'alertes_stock', (
      SELECT json_agg(row_to_json(i))
      FROM (
        SELECT name, unit, current_stock, alert_threshold,
               supplier_name, supplier_phone
        FROM ingredients
        WHERE organization_id = p_org_id
          AND is_active = true
          AND current_stock <= alert_threshold
        ORDER BY (current_stock::float / NULLIF(alert_threshold, 0)) ASC
      ) i
    ),

    -- Stocks ingrédients complets
    'stocks_ingredients', (
      SELECT json_agg(row_to_json(i))
      FROM (
        SELECT name, unit, current_stock, alert_threshold, cost_per_unit
        FROM ingredients
        WHERE organization_id = p_org_id AND is_active = true
        ORDER BY name
      ) i
    ),

    -- Top 5 clients par CA total (commandes liées)
    'top_clients', (
      SELECT json_agg(row_to_json(c))
      FROM (
        SELECT
          cu.name, cu.phone, cu.loyalty_points,
          COUNT(o.id) AS nb_commandes,
          SUM(o.total_amount) AS ca_total,
          TO_CHAR(MAX(o.created_at)::date, 'DD/MM/YYYY') AS derniere_commande
        FROM customers cu
        JOIN orders o ON o.customer_id = cu.id
        WHERE cu.organization_id = p_org_id
        GROUP BY cu.id, cu.name, cu.phone, cu.loyalty_points
        ORDER BY ca_total DESC
        LIMIT 5
      ) c
    ),

    -- Répartition segments CRM (RFM)
    'segments_crm', (
      SELECT json_agg(row_to_json(s))
      FROM (
        SELECT segment_label, COUNT(*) AS nb_clients
        FROM customer_rfm_segments
        WHERE organization_id = p_org_id
        GROUP BY segment_label
        ORDER BY nb_clients DESC
      ) s
    ),

    -- Masse salariale — filtrage confidentiel appliqué côté API (gérant uniquement)
    'masse_salariale', (
      SELECT json_agg(row_to_json(e))
      FROM (
        SELECT
          p.full_name, p.base_salary, p.contract_type,
          COALESCE(SUM(ev.amount) FILTER (WHERE ev.type = 'bonus'), 0) AS total_bonus,
          COALESCE(SUM(ev.amount) FILTER (WHERE ev.type = 'deduction'), 0) AS total_deductions
        FROM profiles p
        LEFT JOIN employee_pay_events ev
          ON ev.employee_id = p.id
          AND ev.month >= TO_CHAR(NOW() - INTERVAL '3 months', 'YYYY-MM')
        WHERE p.organization_id = p_org_id
          AND p.is_active = true
          AND p.base_salary IS NOT NULL
        GROUP BY p.id, p.full_name, p.base_salary, p.contract_type
        ORDER BY p.base_salary DESC NULLS LAST
      ) e
    ),

    -- Événements salariaux récents (3 mois)
    'evenements_salariaux', (
      SELECT json_agg(row_to_json(ev))
      FROM (
        SELECT p.full_name, ev.month, ev.type, ev.label, ev.amount
        FROM employee_pay_events ev
        JOIN profiles p ON ev.employee_id = p.id
        WHERE ev.organization_id = p_org_id
          AND ev.month >= TO_CHAR(NOW() - INTERVAL '3 months', 'YYYY-MM')
        ORDER BY ev.month DESC, ev.created_at DESC
        LIMIT 20
      ) ev
    ),

    -- KPIs globaux depuis la création
    'kpis_globaux', (
      SELECT row_to_json(k)
      FROM (
        SELECT
          COALESCE(SUM(amount), 0) AS ca_total_depuis_creation,
          COUNT(*) AS nb_transactions_total,
          (SELECT COUNT(*) FROM customers WHERE organization_id = p_org_id) AS nb_clients_crm,
          (SELECT COUNT(*) FROM orders
           WHERE organization_id = p_org_id
             AND status NOT IN ('cancelled')) AS nb_commandes_total,
          (SELECT ROUND(AVG(total_amount)::numeric, 0) FROM orders
           WHERE organization_id = p_org_id
             AND status NOT IN ('cancelled')) AS panier_moyen_global
        FROM transactions
        WHERE organization_id = p_org_id
      ) k
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ia_financial_context(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_ia_financial_context(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ia_financial_context(UUID) TO authenticated;
