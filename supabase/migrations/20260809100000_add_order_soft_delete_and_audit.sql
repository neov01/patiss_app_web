-- ============================================================
-- Migration : 20260809100000_add_order_soft_delete_and_audit
-- Objectif  : Suppression logique des commandes (rétention 30 jours)
--             + table d'audit dédiée (delete/restore/purge), lisible par
--             vendeur et gérant, sans toucher à la policy de audit_logs.
-- ============================================================

-- 1. Colonnes de suppression logique sur orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON public.orders(organization_id, deleted_at);

-- 2. Table d'audit dédiée
CREATE TABLE IF NOT EXISTS public.order_deletion_audit (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id           UUID NOT NULL,
  order_reference    TEXT NOT NULL,
  action             TEXT NOT NULL CHECK (action IN ('delete', 'restore', 'purge')),
  performed_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_by_name  TEXT NOT NULL,
  reason             TEXT NOT NULL,
  order_snapshot     JSONB,
  stock_adjustment   JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.order_deletion_audit IS 'Historique des suppressions/restaurations/purges de commandes, consultable par vendeur et gérant';
COMMENT ON COLUMN public.order_deletion_audit.order_id IS 'Sans contrainte FK : doit survivre à la purge définitive de la commande';
COMMENT ON COLUMN public.order_deletion_audit.stock_adjustment IS 'Map {product_id: quantité} recréditée au stock à la suppression, pour inversion exacte à la restauration';

CREATE INDEX IF NOT EXISTS idx_order_deletion_audit_org_created ON public.order_deletion_audit(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_deletion_audit_order_id ON public.order_deletion_audit(order_id);

ALTER TABLE public.order_deletion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_deletion_audit_select" ON public.order_deletion_audit
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() IN ('vendeur', 'gerant')
      AND organization_id = public.get_user_organization_id()
    )
  );

-- Écriture réservée aux fonctions SECURITY DEFINER (RPC des tâches suivantes), jamais en direct
CREATE POLICY "order_deletion_audit_insert" ON public.order_deletion_audit
  FOR INSERT WITH CHECK (public.is_super_admin());
