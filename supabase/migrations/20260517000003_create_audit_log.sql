-- ============================================================
-- Migration : 20260517000003_create_audit_log.sql
-- Objectif  : Journal d'audit pour la traçabilité RGPD
--
-- Enregistre toutes les opérations sensibles :
--   - Modifications de profils et rôles
--   - Remboursements
--   - Suppressions de commandes / transactions
--   - Changements de stock (ajustements manuels)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL,  -- 'INSERT' | 'UPDATE' | 'DELETE'
  table_name      TEXT        NOT NULL,
  record_id       TEXT        NOT NULL,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  public.audit_logs IS 'Piste d''audit de toutes les opérations sensibles (RGPD)';
COMMENT ON COLUMN public.audit_logs.old_values IS 'Valeurs avant modification (NULL pour INSERT)';
COMMENT ON COLUMN public.audit_logs.new_values IS 'Valeurs après modification (NULL pour DELETE)';

-- Index pour les requêtes d'audit fréquentes
CREATE INDEX idx_audit_logs_organization_id ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_table_name      ON public.audit_logs(table_name, created_at DESC);
CREATE INDEX idx_audit_logs_user_id         ON public.audit_logs(user_id);

-- RLS : seuls les gérants et super_admins peuvent lire les logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      public.get_user_organization_id() IS NOT NULL
      AND public.get_user_role() = 'gerant'
      AND organization_id = public.get_user_organization_id()
    )
  );

-- Personne ne peut modifier ou supprimer les logs (immuabilité)
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (public.is_super_admin());

-- ── Fonction générique de log d'audit ───────────────────────
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_organization_id UUID,
  p_user_id         UUID,
  p_action          TEXT,
  p_table_name      TEXT,
  p_record_id       TEXT,
  p_old_values      JSONB DEFAULT NULL,
  p_new_values      JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    organization_id, user_id, action, table_name, record_id, old_values, new_values
  ) VALUES (
    p_organization_id, p_user_id, p_action, p_table_name, p_record_id, p_old_values, p_new_values
  );
END;
$$;

-- ── Trigger : transactions (INSERT = vente, remboursement) ───
CREATE OR REPLACE FUNCTION public.audit_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event(
      NEW.organization_id,
      NEW.created_by,
      'INSERT',
      'transactions',
      NEW.id::TEXT,
      NULL,
      jsonb_build_object('amount', NEW.amount, 'label_type', NEW.label_type, 'payment_method', NEW.payment_method, 'client_name', NEW.client_name)
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit_event(
      OLD.organization_id,
      auth.uid(),
      'DELETE',
      'transactions',
      OLD.id::TEXT,
      jsonb_build_object('amount', OLD.amount, 'label_type', OLD.label_type),
      NULL
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_transactions ON public.transactions;
CREATE TRIGGER trg_audit_transactions
  AFTER INSERT OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_transactions();

-- ── Trigger : profiles (changements de rôle sensibles) ───────
CREATE OR REPLACE FUNCTION public.audit_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role_slug IS DISTINCT FROM NEW.role_slug THEN
    PERFORM public.log_audit_event(
      NEW.organization_id,
      auth.uid(),
      'UPDATE',
      'profiles',
      NEW.id::TEXT,
      jsonb_build_object('role_slug', OLD.role_slug, 'is_active', OLD.is_active),
      jsonb_build_object('role_slug', NEW.role_slug, 'is_active', NEW.is_active)
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit_event(
      OLD.organization_id,
      auth.uid(),
      'DELETE',
      'profiles',
      OLD.id::TEXT,
      jsonb_build_object('full_name', OLD.full_name, 'role_slug', OLD.role_slug),
      NULL
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles
  AFTER UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profiles();
