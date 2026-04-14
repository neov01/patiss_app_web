-- ============================================================
-- Migration 20260401020000 : Extension Organizations pour Super Admin (SaaS Support)
-- Ajout du Tier, Limites et Contacts
-- ============================================================

-- 1. Ajout des colonnes à la table organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS tier           TEXT        NOT NULL DEFAULT 'Basic',
ADD COLUMN IF NOT EXISTS max_users      INTEGER     NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS contact_email  TEXT,
ADD COLUMN IF NOT EXISTS contact_phone  TEXT;

-- 2. Commentaires pour l'auto-documentation
COMMENT ON COLUMN public.organizations.tier          IS 'Plan tarifaire (Basic, Premium, Premium + IA)';
COMMENT ON COLUMN public.organizations.max_users     IS 'Nombre maximum d''utilisateurs autorisés pour cette organisation';
COMMENT ON COLUMN public.organizations.contact_email IS 'Email de secours du propriétaire pour la facturation/support';
COMMENT ON COLUMN public.organizations.contact_phone IS 'Téléphone de secours pour urgences support';

-- 3. Mise à jour des policies RLS (Déjà gérées par is_super_admin() dans 001_init.sql)
-- Mais on s'assure que super_admin peut bien modifier ces nouveaux champs (ce qui est le cas via les policies existantes).
