-- Mesure du temps réel de saisie d'une nouvelle commande.
-- Une ligne est créée uniquement lorsqu'une commande est validée avec succès.

CREATE TABLE IF NOT EXISTS public.order_creation_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_creation_metrics_org_created_at
  ON public.order_creation_metrics(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_creation_metrics_created_by
  ON public.order_creation_metrics(created_by);

ALTER TABLE public.order_creation_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_creation_metrics_select" ON public.order_creation_metrics;
CREATE POLICY "order_creation_metrics_select" ON public.order_creation_metrics
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND organization_id = public.get_user_organization_id()
    )
  );

DROP POLICY IF EXISTS "order_creation_metrics_insert" ON public.order_creation_metrics;
CREATE POLICY "order_creation_metrics_insert" ON public.order_creation_metrics
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() IN ('gerant', 'vendeur')
      AND organization_id = public.get_user_organization_id()
      AND created_by = auth.uid()
    )
  );
