-- Create sales_sessions table
CREATE TABLE public.sales_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    total_cash NUMERIC(10,2) DEFAULT 0,
    total_mobile_money NUMERIC(10,2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    metrics_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX idx_sales_sessions_org_status ON public.sales_sessions(organization_id, status);

-- Unicity constraint: Only ONE open session per organization is allowed
CREATE UNIQUE INDEX unique_open_session_per_org ON public.sales_sessions(organization_id) WHERE status = 'open';

-- Enable RLS
ALTER TABLE public.sales_sessions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view sessions of their org"
    ON public.sales_sessions FOR SELECT
    USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Since the frontend creates/closes sessions via secure Server Actions (which bypass RLS via Service Role), 
-- OR via standard authenticated fetches, let's keep basic policies just in case it's done from the client.
-- But the server actions will use supabaseAdmin.
CREATE POLICY "Users can insert sessions for their org"
    ON public.sales_sessions FOR INSERT
    WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update sessions of their org"
    ON public.sales_sessions FOR UPDATE
    USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
