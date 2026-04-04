-- Migration: Enrichissement RH pour Mon Équipe
-- À exécuter dans la console SQL de Supabase

-- ÉTAPE 1: Nouveaux champs RH sur la table profiles (employés)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS hire_date      date,
  ADD COLUMN IF NOT EXISTS contract_type  text 
    CHECK (contract_type IN ('full_time', 'part_time', 'daily')) 
    DEFAULT 'full_time',
  ADD COLUMN IF NOT EXISTS base_salary    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avatar_url     text;

-- ÉTAPE 2: Table des événements de paie (primes & retenues)
CREATE TABLE IF NOT EXISTS employee_pay_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month           text NOT NULL,          -- format 'YYYY-MM'
  type            text NOT NULL CHECK (type IN ('prime', 'retenue')),
  amount          numeric NOT NULL,
  label           text NOT NULL,          -- motif (ex: "Prime weekend")
  created_at      timestamptz DEFAULT now()
);

-- ÉTAPE 3: RLS sur employee_pay_events
ALTER TABLE employee_pay_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_pay_events"
  ON employee_pay_events
  USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ÉTAPE 4: Index performance
CREATE INDEX IF NOT EXISTS idx_pay_events_employee_month
  ON employee_pay_events(employee_id, month);

CREATE INDEX IF NOT EXISTS idx_pay_events_org
  ON employee_pay_events(organization_id);
