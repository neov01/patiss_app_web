# Suppression et audit des commandes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `vendeur` and `gerant` delete an order from the Commandes page behind a mandatory-comment confirmation, keep it recoverable for 30 days (with stock correctly reversed/restored), and give both roles a fast, dedicated audit page listing every delete/restore/purge event.

**Architecture:** Soft-delete via `orders.deleted_at`/`deleted_by` plus a dedicated `order_deletion_audit` table (its own RLS, independent from the existing `audit_logs` table so we don't loosen access to unrelated sensitive logs). Three atomic Postgres RPCs (`soft_delete_order_atomic`, `restore_order_atomic`, `purge_expired_deleted_orders`, the last one on a daily `pg_cron` schedule) own all the invariants: role checks, mandatory reason, and stock reversal (only for orders that actually reached checkout). The Next.js layer gets two new server actions, one new reusable confirm-with-reason modal, and a new `/commandes/audit` route with its own client component (kept separate from the already-1900-line `OrdersClient.tsx`).

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS + pg_cron), TypeScript, vitest (unit), Playwright (e2e).

## Global Constraints

- Roles able to delete/restore: `vendeur`, `gerant`, `super_admin` (from spec, confirmed in `src/lib/auth/organization-context.ts`).
- Roles able to read the audit page: `vendeur`, `gerant`, `super_admin` (spec: "vendeur et gérant"; `super_admin` is implicitly included since it already bypasses org role checks everywhere else in this codebase).
- A comment (`reason`) is mandatory for both delete and restore — enforced client-side (disabled button) and server-side (RPC raises if blank).
- Retention: exactly 30 days per order, computed individually from that order's own `deleted_at`, never a batch cutoff.
- Stock must only be re-credited for orders that actually decremented it — i.e. orders whose `status = 'delivered'` (the only status `encaisser_atomic` sets, and the only code path that calls `decrement_product_stock`). Never restock an order that was never checked out.
- Do not modify the RLS policy of the existing `audit_logs` table.
- Follow existing code conventions: server actions return `{ error }` / `{ success: true, ... }`, casts to `any` (`supabaseAny`) are the existing pattern for columns/tables ahead of generated types — but Task 5 regenerates `src/types/supabase.ts`, so this feature's new code should use real types, not `any`.

---

### Task 1: Migration — soft-delete columns + `order_deletion_audit` table

**Files:**
- Create: `supabase/migrations/20260809100000_add_order_soft_delete_and_audit.sql`

**Interfaces:**
- Produces: columns `orders.deleted_at` (timestamptz, null = active), `orders.deleted_by` (uuid); table `public.order_deletion_audit` with columns `id, organization_id, order_id, order_reference, action ('delete'|'restore'|'purge'), performed_by, performed_by_name, reason, order_snapshot (jsonb), stock_adjustment (jsonb), created_at`.
- Consumes: existing helper functions `public.is_super_admin()`, `public.get_user_organization_id()`, `public.get_user_role()` (already defined, used by `supabase/migrations/20260517000003_create_audit_log.sql`).

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260809100000_add_order_soft_delete_and_audit.sql
git commit -m "feat(db): add order soft-delete columns and order_deletion_audit table"
```

---

### Task 2: Migration — `soft_delete_order_atomic` RPC

**Files:**
- Create: `supabase/migrations/20260809100001_soft_delete_order_atomic_rpc.sql`

**Interfaces:**
- Consumes: `orders` (`status`, `order_number`, `deleted_at`), `order_items`, `transactions`, `transaction_items`, `products` (`track_stock`, `current_stock`), `order_deletion_audit` from Task 1.
- Produces: `public.soft_delete_order_atomic(p_order_id uuid, p_organization_id uuid, p_reason text) RETURNS VOID`, callable by `authenticated`.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Migration : 20260809100001_soft_delete_order_atomic_rpc
-- Objectif  : Suppression logique atomique d'une commande — recrédite le
--             stock si (et seulement si) la commande avait été encaissée,
--             et journalise l'événement avec le commentaire obligatoire.
-- ============================================================

CREATE OR REPLACE FUNCTION public.soft_delete_order_atomic(
  p_order_id        UUID,
  p_organization_id UUID,
  p_reason          TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id         UUID := auth.uid();
  v_actor_role       TEXT;
  v_actor_org_id     UUID;
  v_actor_name       TEXT;
  v_order            RECORD;
  v_item             RECORD;
  v_stock_adjustment JSONB := '{}'::jsonb;
  v_snapshot         JSONB;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '28000';
  END IF;

  SELECT role_slug, organization_id, full_name INTO v_actor_role, v_actor_org_id, v_actor_name
  FROM public.profiles WHERE id = v_actor_id AND is_active = true;

  IF v_actor_org_id IS NULL OR v_actor_org_id <> p_organization_id THEN
    RAISE EXCEPTION 'Non autorisé ou mauvaise organisation' USING ERRCODE = '42501';
  END IF;

  IF v_actor_role NOT IN ('vendeur', 'gerant', 'super_admin') THEN
    RAISE EXCEPTION 'Rôle non autorisé pour supprimer une commande' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Un commentaire est obligatoire pour supprimer une commande' USING ERRCODE = '22023';
  END IF;

  SELECT id, order_number, status, deleted_at
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable' USING ERRCODE = '44000';
  END IF;

  IF v_order.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cette commande est déjà supprimée' USING ERRCODE = '44000';
  END IF;

  -- Le stock n'est décrémenté qu'à l'encaissement (encaisser_atomic, qui passe status à 'delivered').
  -- On ne recrédite donc que dans ce cas, en se basant sur les transaction_items réellement décrémentés.
  IF v_order.status = 'delivered' THEN
    FOR v_item IN
      SELECT ti.product_id, SUM(ti.quantity) AS quantity
      FROM public.transaction_items ti
      JOIN public.transactions t ON t.id = ti.transaction_id
      WHERE t.order_id = p_order_id
        AND t.organization_id = p_organization_id
        AND ti.product_id IS NOT NULL
      GROUP BY ti.product_id
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.products
        WHERE id = v_item.product_id AND track_stock = true AND organization_id = p_organization_id
      ) THEN
        UPDATE public.products
        SET current_stock = COALESCE(current_stock, 0) + v_item.quantity
        WHERE id = v_item.product_id AND organization_id = p_organization_id;

        v_stock_adjustment := v_stock_adjustment || jsonb_build_object(v_item.product_id::text, v_item.quantity);
      END IF;
    END LOOP;
  END IF;

  -- Snapshot complet (commande + lignes) pour l'affichage détaillé dans la page d'audit
  SELECT jsonb_build_object(
    'order', to_jsonb(o.*),
    'items', COALESCE(jsonb_agg(to_jsonb(oi.*)) FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_snapshot
  FROM public.orders o
  LEFT JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.id = p_order_id
  GROUP BY o.id;

  UPDATE public.orders
  SET deleted_at = NOW(), deleted_by = v_actor_id
  WHERE id = p_order_id AND organization_id = p_organization_id;

  INSERT INTO public.order_deletion_audit (
    organization_id, order_id, order_reference, action,
    performed_by, performed_by_name, reason, order_snapshot, stock_adjustment
  ) VALUES (
    p_organization_id, p_order_id, COALESCE(v_order.order_number, p_order_id::text), 'delete',
    v_actor_id, COALESCE(v_actor_name, 'Utilisateur inconnu'), p_reason, v_snapshot, v_stock_adjustment
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soft_delete_order_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_order_atomic(UUID, UUID, TEXT) TO authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260809100001_soft_delete_order_atomic_rpc.sql
git commit -m "feat(db): add soft_delete_order_atomic RPC with conditional stock restock"
```

---

### Task 3: Migration — `restore_order_atomic` RPC

**Files:**
- Create: `supabase/migrations/20260809100002_restore_order_atomic_rpc.sql`

**Interfaces:**
- Consumes: `order_deletion_audit` rows written by Task 2's function (reads the latest `action = 'delete'` row for the order to know exactly what to reverse).
- Produces: `public.restore_order_atomic(p_order_id uuid, p_organization_id uuid, p_reason text) RETURNS VOID`.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Migration : 20260809100002_restore_order_atomic_rpc
-- Objectif  : Restaurer une commande supprimée logiquement, en inversant
--             exactement le recrédit de stock effectué à la suppression.
-- ============================================================

CREATE OR REPLACE FUNCTION public.restore_order_atomic(
  p_order_id        UUID,
  p_organization_id UUID,
  p_reason          TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id      UUID := auth.uid();
  v_actor_role    TEXT;
  v_actor_org_id  UUID;
  v_actor_name    TEXT;
  v_order         RECORD;
  v_last_delete   RECORD;
  v_adjustment    RECORD;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '28000';
  END IF;

  SELECT role_slug, organization_id, full_name INTO v_actor_role, v_actor_org_id, v_actor_name
  FROM public.profiles WHERE id = v_actor_id AND is_active = true;

  IF v_actor_org_id IS NULL OR v_actor_org_id <> p_organization_id THEN
    RAISE EXCEPTION 'Non autorisé ou mauvaise organisation' USING ERRCODE = '42501';
  END IF;

  IF v_actor_role NOT IN ('vendeur', 'gerant', 'super_admin') THEN
    RAISE EXCEPTION 'Rôle non autorisé pour restaurer une commande' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Un commentaire est obligatoire pour restaurer une commande' USING ERRCODE = '22023';
  END IF;

  SELECT id, deleted_at INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette commande a été définitivement supprimée, restauration impossible' USING ERRCODE = '44000';
  END IF;

  IF v_order.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Cette commande n''est pas supprimée' USING ERRCODE = '44000';
  END IF;

  SELECT stock_adjustment, order_reference INTO v_last_delete
  FROM public.order_deletion_audit
  WHERE order_id = p_order_id AND organization_id = p_organization_id AND action = 'delete'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_delete.stock_adjustment IS NOT NULL THEN
    FOR v_adjustment IN
      SELECT key AS product_id, value::text::numeric AS quantity
      FROM jsonb_each(v_last_delete.stock_adjustment)
    LOOP
      UPDATE public.products
      SET current_stock = COALESCE(current_stock, 0) - v_adjustment.quantity
      WHERE id = v_adjustment.product_id::uuid AND organization_id = p_organization_id;
    END LOOP;
  END IF;

  UPDATE public.orders
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_order_id AND organization_id = p_organization_id;

  INSERT INTO public.order_deletion_audit (
    organization_id, order_id, order_reference, action,
    performed_by, performed_by_name, reason
  ) VALUES (
    p_organization_id, p_order_id, COALESCE(v_last_delete.order_reference, p_order_id::text), 'restore',
    v_actor_id, COALESCE(v_actor_name, 'Utilisateur inconnu'), p_reason
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_order_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_atomic(UUID, UUID, TEXT) TO authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260809100002_restore_order_atomic_rpc.sql
git commit -m "feat(db): add restore_order_atomic RPC with exact stock reversal"
```

---

### Task 4: Migration — `purge_expired_deleted_orders` RPC + daily `pg_cron` schedule

**Files:**
- Create: `supabase/migrations/20260809100003_purge_expired_deleted_orders.sql`

**Interfaces:**
- Consumes: same cleanup logic as the old `deleteOrder` action (loyalty reversal, transaction deletion), applied per-order to every order whose own `deleted_at` is more than 30 days old.
- Produces: `public.purge_expired_deleted_orders() RETURNS INTEGER` (count purged), scheduled daily via `cron.schedule`.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Migration : 20260809100003_purge_expired_deleted_orders
-- Objectif  : Purge définitive quotidienne des commandes supprimées
--             depuis plus de 30 jours (calculé individuellement par
--             commande), avec journal d'audit conservé après suppression.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.purge_expired_deleted_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order        RECORD;
  v_tx           RECORD;
  v_points       INTEGER;
  v_purged_count INTEGER := 0;
BEGIN
  FOR v_order IN
    SELECT id, organization_id, order_number
    FROM public.orders
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '30 days'
  LOOP
    FOR v_tx IN
      SELECT amount, customer_id
      FROM public.transactions
      WHERE order_id = v_order.id AND organization_id = v_order.organization_id
    LOOP
      IF v_tx.customer_id IS NOT NULL AND v_tx.amount > 0 THEN
        v_points := FLOOR(v_tx.amount / 1000);
        IF v_points > 0 THEN
          UPDATE public.customers
          SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - v_points),
              lifetime_points = GREATEST(0, COALESCE(lifetime_points, 0) - v_points)
          WHERE id = v_tx.customer_id AND organization_id = v_order.organization_id;
        END IF;
      END IF;
    END LOOP;

    DELETE FROM public.transactions WHERE order_id = v_order.id AND organization_id = v_order.organization_id;

    INSERT INTO public.order_deletion_audit (
      organization_id, order_id, order_reference, action,
      performed_by, performed_by_name, reason
    ) VALUES (
      v_order.organization_id, v_order.id, COALESCE(v_order.order_number, v_order.id::text), 'purge',
      NULL, 'Système', 'Purge automatique après 30 jours'
    );

    DELETE FROM public.orders WHERE id = v_order.id AND organization_id = v_order.organization_id;

    v_purged_count := v_purged_count + 1;
  END LOOP;

  RETURN v_purged_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_expired_deleted_orders() FROM PUBLIC, anon, authenticated;

-- Idempotent : on retire l'ancien job avant de le recréer, pour permettre de rejouer la migration
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-deleted-orders') THEN
    PERFORM cron.unschedule('purge-expired-deleted-orders');
  END IF;
END $$;

SELECT cron.schedule(
  'purge-expired-deleted-orders',
  '0 3 * * *',
  $$SELECT public.purge_expired_deleted_orders();$$
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260809100003_purge_expired_deleted_orders.sql
git commit -m "feat(db): add daily pg_cron purge of orders deleted more than 30 days ago"
```

---

### Task 5: Apply the 4 migrations and regenerate Supabase types

**Files:**
- Modify: `src/types/supabase.ts` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: the 4 migration files from Tasks 1–4.
- Produces: `Database['public']['Tables']['orders']['Row']` including `deleted_at`/`deleted_by`; `Database['public']['Tables']['order_deletion_audit']['Row']`. Everything from Task 6 onward relies on these being present so plain (non-`any`) Supabase queries type-check.

- [ ] **Step 1: Apply the migrations to the project**

The only `ACTIVE_HEALTHY` Supabase project for this app is `uwxljrdqrhubtoihmzcb` ("Patisserie projet last"). `pg_cron` is available on this project but not yet installed (confirmed via `list_extensions`), so Task 4's `CREATE EXTENSION IF NOT EXISTS pg_cron;` will install it.

Apply each migration in order, using the Supabase MCP `apply_migration` tool (or `supabase db push` if you have the CLI linked locally):
1. `20260809100000_add_order_soft_delete_and_audit`
2. `20260809100001_soft_delete_order_atomic_rpc`
3. `20260809100002_restore_order_atomic_rpc`
4. `20260809100003_purge_expired_deleted_orders`

- [ ] **Step 2: Verify the schema changes**

Run via the Supabase MCP `execute_sql` tool (project `uwxljrdqrhubtoihmzcb`):

```sql
select column_name from information_schema.columns where table_name = 'orders' and column_name in ('deleted_at', 'deleted_by');
select count(*) from public.order_deletion_audit;
select jobname, schedule from cron.job where jobname = 'purge-expired-deleted-orders';
```

Expected: 2 rows for the first query, `0` for the second (empty table), 1 row for the third showing schedule `0 3 * * *`.

- [ ] **Step 3: Regenerate TypeScript types**

Use the Supabase MCP `generate_typescript_types` tool for project `uwxljrdqrhubtoihmzcb`, and write its output to `src/types/supabase.ts` (overwrite the whole file with the generated content).

- [ ] **Step 4: Confirm the codebase still type-checks**

Run: `npm run typecheck`
Expected: no new errors (the file was purely regenerated; no application code references the new fields yet).

- [ ] **Step 5: Commit**

```bash
git add src/types/supabase.ts
git commit -m "chore(types): regenerate Supabase types for order soft-delete + audit table"
```

---

### Task 6: Domain helpers for the 30-day retention window

**Files:**
- Create: `src/lib/domain/order-deletion.ts`
- Create: `src/lib/domain/order-deletion.test.ts`

**Interfaces:**
- Produces: `isValidDeletionReason(reason: string): boolean`, `getPurgeDate(deletedAt: string | Date, retentionDays?: number): Date`, `getDaysUntilPurge(deletedAt: string | Date, now?: Date, retentionDays?: number): number`, `isPurgeable(deletedAt: string | Date, now?: Date, retentionDays?: number): boolean`.
- Consumed by: Task 9 (client-side reason validation) and Task 11 (`OrderAuditClient` status badges).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from 'vitest'
import { getDaysUntilPurge, isPurgeable, isValidDeletionReason } from './order-deletion'

describe('order-deletion domain helpers', () => {
  it('rejects empty or whitespace-only reasons', () => {
    expect(isValidDeletionReason('')).toBe(false)
    expect(isValidDeletionReason('   ')).toBe(false)
    expect(isValidDeletionReason('Doublon client')).toBe(true)
  })

  it('counts down days until the 30-day purge window closes', () => {
    const deletedAt = new Date('2026-08-01T00:00:00Z')
    const now = new Date('2026-08-10T00:00:00Z')
    expect(getDaysUntilPurge(deletedAt, now)).toBe(21)
  })

  it('is purgeable exactly at day 30 and beyond, not before', () => {
    const deletedAt = new Date('2026-08-01T00:00:00Z')
    expect(isPurgeable(deletedAt, new Date('2026-08-29T00:00:00Z'))).toBe(false)
    expect(isPurgeable(deletedAt, new Date('2026-08-31T00:00:00Z'))).toBe(true)
    expect(isPurgeable(deletedAt, new Date('2026-08-31T00:00:01Z'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/domain/order-deletion.test.ts`
Expected: FAIL with "Cannot find module './order-deletion'"

- [ ] **Step 3: Write the implementation**

```typescript
const RETENTION_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function isValidDeletionReason(reason: string): boolean {
  return reason.trim().length > 0
}

export function getPurgeDate(deletedAt: string | Date, retentionDays = RETENTION_DAYS): Date {
  const base = typeof deletedAt === 'string' ? new Date(deletedAt) : deletedAt
  return new Date(base.getTime() + retentionDays * MS_PER_DAY)
}

export function getDaysUntilPurge(
  deletedAt: string | Date,
  now: Date = new Date(),
  retentionDays = RETENTION_DAYS
): number {
  const purgeDate = getPurgeDate(deletedAt, retentionDays)
  return Math.ceil((purgeDate.getTime() - now.getTime()) / MS_PER_DAY)
}

export function isPurgeable(
  deletedAt: string | Date,
  now: Date = new Date(),
  retentionDays = RETENTION_DAYS
): boolean {
  return getDaysUntilPurge(deletedAt, now, retentionDays) <= 0
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/domain/order-deletion.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/order-deletion.ts src/lib/domain/order-deletion.test.ts
git commit -m "feat(domain): add pure helpers for the 30-day order deletion retention window"
```

---

### Task 7: Server actions — `softDeleteOrder`, `restoreOrder`, `getOrderDeletionAudit`; remove `deleteOrder`

**Files:**
- Modify: `src/lib/actions/orders.ts`

**Interfaces:**
- Consumes: `requireRoleContext`, `requireOpenSalesSession`, `AuthContextError` from `src/lib/auth/organization-context.ts`; RPCs from Tasks 2–3; regenerated types from Task 5.
- Produces: `softDeleteOrder(orderId: string, reason: string): Promise<{ error: string } | { success: true }>`, `restoreOrder(orderId: string, reason: string): Promise<{ error: string } | { success: true }>`, `getOrderDeletionAudit(filters?: { page?: number; pageSize?: number }): Promise<{ error: string } | { entries: (OrderDeletionAuditEntry & { isRestorable: boolean })[]; count: number; hasMore: boolean }>`, exported type `OrderDeletionAuditEntry`.
- Consumed by: Task 10 (`OrdersClient.tsx`) and Task 11 (`OrderAuditClient.tsx`).

`deleteOrder` (the old hard-delete action, `src/lib/actions/orders.ts:204-265`) is removed — its only caller (`OrdersClient.tsx`) switches to `softDeleteOrder` in Task 10, and its cleanup logic (loyalty reversal + transaction deletion) now lives in `purge_expired_deleted_orders` (Task 4), which runs it 30 days later instead of immediately.

- [ ] **Step 1: Remove the old `deleteOrder` action**

In `src/lib/actions/orders.ts`, delete the entire `deleteOrder` function (lines 204-265, from `export async function deleteOrder(orderId: string) {` through its closing `}`).

- [ ] **Step 2: Add the new actions in its place**

Insert the following where `deleteOrder` used to be:

```typescript
type SoftDeleteOrderRpcClient = {
    rpc(
        fn: 'soft_delete_order_atomic',
        args: { p_order_id: string; p_organization_id: string; p_reason: string }
    ): Promise<{ error: { message?: string } | null }>
}

export async function softDeleteOrder(orderId: string, reason: string) {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['vendeur', 'gerant', 'super_admin'])
        await requireOpenSalesSession(context)

        if (!reason || !reason.trim()) {
            return { error: 'Un commentaire est obligatoire pour supprimer une commande.' }
        }

        const { error } = await (context.supabase as unknown as SoftDeleteOrderRpcClient).rpc('soft_delete_order_atomic', {
            p_order_id: orderId,
            p_organization_id: context.organizationId,
            p_reason: reason.trim()
        })

        if (error) return { error: error.message || 'Erreur lors de la suppression de la commande' }

        revalidatePath('/commandes')
        revalidatePath('/commandes/audit')
        revalidatePath('/dashboard')
        revalidatePath('/caisse')

        return { success: true as const }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

type RestoreOrderRpcClient = {
    rpc(
        fn: 'restore_order_atomic',
        args: { p_order_id: string; p_organization_id: string; p_reason: string }
    ): Promise<{ error: { message?: string } | null }>
}

export async function restoreOrder(orderId: string, reason: string) {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['vendeur', 'gerant', 'super_admin'])
        await requireOpenSalesSession(context)

        if (!reason || !reason.trim()) {
            return { error: 'Un commentaire est obligatoire pour restaurer une commande.' }
        }

        const { error } = await (context.supabase as unknown as RestoreOrderRpcClient).rpc('restore_order_atomic', {
            p_order_id: orderId,
            p_organization_id: context.organizationId,
            p_reason: reason.trim()
        })

        if (error) return { error: error.message || 'Erreur lors de la restauration de la commande' }

        revalidatePath('/commandes')
        revalidatePath('/commandes/audit')
        revalidatePath('/dashboard')
        revalidatePath('/caisse')

        return { success: true as const }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

export type OrderDeletionAuditEntry = {
    id: string
    organization_id: string
    order_id: string
    order_reference: string
    action: 'delete' | 'restore' | 'purge'
    performed_by: string | null
    performed_by_name: string
    reason: string
    order_snapshot: Record<string, unknown> | null
    stock_adjustment: Record<string, number> | null
    created_at: string
}

export async function getOrderDeletionAudit(filters: { page?: number; pageSize?: number } = {}) {
    try {
        const context = await requireRoleContext(['vendeur', 'gerant', 'super_admin'])
        const page = filters.page ?? 1
        const pageSize = filters.pageSize ?? 30
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        const [{ data, error, count }, { data: deletedOrders, error: deletedOrdersError }] = await Promise.all([
            context.supabase
                .from('order_deletion_audit')
                .select('*', { count: 'exact' })
                .eq('organization_id', context.organizationId)
                .order('created_at', { ascending: false })
                .range(from, to),
            context.supabase
                .from('orders')
                .select('id')
                .eq('organization_id', context.organizationId)
                .not('deleted_at', 'is', null)
        ])

        if (error) return { error: error.message }
        if (deletedOrdersError) return { error: deletedOrdersError.message }

        const currentlyDeletedIds = (deletedOrders ?? []).map(o => o.id)
        const latestDeleteAuditIdByOrder = new Map<string, string>()

        if (currentlyDeletedIds.length > 0) {
            const { data: activeDeleteEntries, error: activeErr } = await context.supabase
                .from('order_deletion_audit')
                .select('id, order_id, created_at')
                .eq('organization_id', context.organizationId)
                .eq('action', 'delete')
                .in('order_id', currentlyDeletedIds)
                .order('created_at', { ascending: false })

            if (activeErr) return { error: activeErr.message }

            for (const entry of activeDeleteEntries ?? []) {
                if (!latestDeleteAuditIdByOrder.has(entry.order_id)) {
                    latestDeleteAuditIdByOrder.set(entry.order_id, entry.id)
                }
            }
        }

        const entries = ((data ?? []) as OrderDeletionAuditEntry[]).map(entry => ({
            ...entry,
            isRestorable: latestDeleteAuditIdByOrder.get(entry.order_id) === entry.id
        }))

        return {
            entries,
            count: count ?? 0,
            hasMore: (count ?? 0) > to + 1
        }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: no errors. If `order_deletion_audit` or `orders.deleted_at`/`deleted_by` are reported as unknown, Task 5's type regeneration did not complete correctly — redo Task 5 Step 3 before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/orders.ts
git commit -m "feat(orders): replace hard delete with soft-delete/restore actions and audit listing"
```

---

### Task 8: Exclude soft-deleted orders from every order list query

**Files:**
- Modify: `src/app/(pâtisserie)/commandes/page.tsx:36`
- Modify: `src/app/(pâtisserie)/caisse/page.tsx:196`
- Modify: `src/app/(pâtisserie)/dashboard/ProductionPlan.tsx:62`
- Modify: `src/app/(pâtisserie)/dashboard/page.tsx:81`
- Modify: `src/lib/actions/stats.ts:87`
- Modify: `src/lib/actions/session-utils.ts:100` and `:218`
- Modify: `src/app/api/cron/daily-report/route.ts:68`
- Modify: `src/components/admin/AdminClient.tsx:469`

**Interfaces:**
- Consumes: `orders.deleted_at` from Task 5.
- Produces: no soft-deleted order appears in the active Commandes list, the caisse checkout list, the production plan, the dashboard, revenue/session stats, the daily report, or the admin activity feed.

This is the same one-line filter (`.is('deleted_at', null)`) added right after the existing `.eq('organization_id', ...)` call in each query. None of these files have unit tests today (only `src/lib/domain/*` is covered by vitest per `package.json`'s `test:unit` script) — verification for this task is `npm run typecheck` plus the manual checklist in Task 13.

- [ ] **Step 1: `commandes/page.tsx`**

```typescript
// src/app/(pâtisserie)/commandes/page.tsx
        supabase
            .from('orders')
            .select('*, order_items(*, products(name)), order_payments(*), creator_profile:profiles!orders_created_by_fkey(full_name, role_slug)')
            .eq('organization_id', orgId)
            .is('deleted_at', null)
            .or(activeFilter)
            .order('pickup_date', { ascending: true }),
```

- [ ] **Step 2: `caisse/page.tsx`**

```typescript
// src/app/(pâtisserie)/caisse/page.tsx
            .from('orders')
            .select('id, order_number, customer_id, customer_name, customer_contact, pickup_date, deposit_amount, paid_amount, total_amount, balance, priority, status, order_items(*, products(name))')
            .eq('organization_id', orgId)
            .is('deleted_at', null)
            .in('status', ['pending', 'production', 'ready', 'confirmed', 'in_preparation', 'awaiting_pickup'])
```

- [ ] **Step 3: `dashboard/ProductionPlan.tsx`**

```typescript
// src/app/(pâtisserie)/dashboard/ProductionPlan.tsx
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .in('status', ['pending', 'production', 'confirmed', 'in_preparation'])
```

- [ ] **Step 4: `dashboard/page.tsx`**

```typescript
// src/app/(pâtisserie)/dashboard/page.tsx
        .select('id, order_number, total_amount, status, pickup_date, customer_name, deposit_amount, payment_status, reception_type')
        .eq('organization_id', profile.organization_id!)
        .is('deleted_at', null)
        .or(`pickup_date.gte.${startDate},status.in.(pending,production,ready,confirmed,in_preparation,awaiting_pickup)`)
```

- [ ] **Step 5: `stats.ts`**

```typescript
// src/lib/actions/stats.ts
        .select('id, order_number, customer_name, total_amount, deposit_amount, balance, payment_status, status, created_at')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .in('payment_status', ['EN_ATTENTE', 'PARTIEL'])
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
```

- [ ] **Step 6: `session-utils.ts` (two spots)**

```typescript
// src/lib/actions/session-utils.ts — first query (~line 98)
    const { data: periodOrders } = await supabaseAdmin
        .from('orders')
        .select('id, total_amount, deposit_amount, status')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .gte('created_at', sessionStart)
```

```typescript
// src/lib/actions/session-utils.ts — second query (~line 216)
    const { data: sessionOrders } = await supabaseAdmin
        .from('orders')
        .select('is_historical, created_by, profiles!orders_created_by_fkey(full_name, role_slug)')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .gte('created_at', sessionStart)
```

- [ ] **Step 7: `api/cron/daily-report/route.ts`**

```typescript
// src/app/api/cron/daily-report/route.ts
                .from('orders')
                .select('id, total_amount, deposit_amount, status')
                .eq('organization_id', orgId)
                .is('deleted_at', null)
                .gte('created_at', today.toISOString())
                .lt('created_at', tomorrow.toISOString())
```

- [ ] **Step 8: `AdminClient.tsx`**

```typescript
// src/components/admin/AdminClient.tsx
            supabase.from('orders').select('id, order_number, created_at').eq('organization_id', selectedOrg.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(3),
```

- [ ] **Step 9: Type-check**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(pâtisserie)/commandes/page.tsx" "src/app/(pâtisserie)/caisse/page.tsx" "src/app/(pâtisserie)/dashboard/ProductionPlan.tsx" "src/app/(pâtisserie)/dashboard/page.tsx" src/lib/actions/stats.ts src/lib/actions/session-utils.ts src/app/api/cron/daily-report/route.ts src/components/admin/AdminClient.tsx
git commit -m "fix: exclude soft-deleted orders from every order list query"
```

---

### Task 9: `ConfirmModalWithReason` component

**Files:**
- Create: `src/components/ui/ConfirmModalWithReason.tsx`

**Interfaces:**
- Consumes: `isValidDeletionReason` from `src/lib/domain/order-deletion.ts` (Task 6).
- Produces: `<ConfirmModalWithReason isOpen onClose onConfirm={(reason: string) => void} title message reasonLabel? reasonPlaceholder? confirmText? cancelText? isLoading? />`.
- Consumed by: Task 10 (delete) and Task 11 (restore).

- [ ] **Step 1: Write the component**

```tsx
'use client'

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, X } from 'lucide-react'
import { isValidDeletionReason } from '@/lib/domain/order-deletion'

interface ConfirmModalWithReasonProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  title: string
  message: string
  reasonLabel?: string
  reasonPlaceholder?: string
  confirmText?: string
  cancelText?: string
  isLoading?: boolean
}

export default function ConfirmModalWithReason({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  reasonLabel = 'Commentaire (obligatoire)',
  reasonPlaceholder = 'Expliquez la raison de cette action…',
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  isLoading = false
}: ConfirmModalWithReasonProps) {
  const [reason, setReason] = useState('')

  if (!isOpen) return null

  const canConfirm = isValidDeletionReason(reason) && !isLoading

  const handleClose = () => {
    setReason('')
    onClose()
  }

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm(reason.trim())
    setReason('')
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div
        onClick={!isLoading ? handleClose : undefined}
        style={{ position: 'absolute', inset: 0, background: 'rgba(45, 27, 14, 0.4)', backdropFilter: 'blur(8px)' }}
      />
      <div style={{
        position: 'relative', width: '100%', maxWidth: '440px', background: '#fff', borderRadius: '24px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)', padding: '32px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center'
      }}>
        {!isLoading && (
          <button
            onClick={handleClose}
            style={{
              position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', padding: '8px',
              cursor: 'pointer', color: 'var(--color-muted)', borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        )}

        <div style={{
          width: '64px', height: '64px', borderRadius: '50%', background: '#FEF2F2', display: 'flex',
          alignItems: 'center', justifyContent: 'center', marginBottom: '20px'
        }}>
          <AlertCircle size={32} color="#EF4444" />
        </div>

        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)', marginBottom: '12px', margin: 0 }}>
          {title}
        </h3>
        <p style={{ fontSize: '0.95rem', lineHeight: '1.5', color: '#6B7280', marginBottom: '20px', padding: '0 10px' }}>
          {message}
        </p>

        <div style={{ width: '100%', textAlign: 'left', marginBottom: '24px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)', display: 'block', marginBottom: '8px' }}>
            {reasonLabel}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            disabled={isLoading}
            rows={3}
            style={{
              width: '100%', borderRadius: '12px', border: '1.5px solid var(--color-border)', padding: '10px 12px',
              fontSize: '0.9rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button
            onClick={handleClose}
            disabled={isLoading}
            style={{
              flex: 1, padding: '14px', borderRadius: '14px', border: '1.5px solid var(--color-border)',
              background: '#fff', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)', cursor: 'pointer'
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              flex: 1, padding: '14px', borderRadius: '14px', border: 'none', background: '#EF4444',
              fontSize: '0.95rem', fontWeight: 700, color: '#fff',
              cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.6
            }}
          >
            {isLoading ? 'Chargement...' : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/ConfirmModalWithReason.tsx
git commit -m "feat(ui): add ConfirmModalWithReason for mandatory-comment confirmations"
```

---

### Task 10: Wire the delete flow in `OrdersClient.tsx` to `softDeleteOrder` + update the e2e test

**Files:**
- Modify: `src/components/orders/OrdersClient.tsx`
- Modify: `e2e/commandes.spec.ts`

**Interfaces:**
- Consumes: `softDeleteOrder` (Task 7), `ConfirmModalWithReason` (Task 9).
- Produces: the trash-can button on an order card opens a modal that requires a comment before "Supprimer" is enabled; on success the order disappears from the list (soft-deleted) and a toast explains it can be restored from the audit page.

- [ ] **Step 1: Swap the import**

```typescript
// src/components/orders/OrdersClient.tsx:8
import { updateOrderStatus, softDeleteOrder, getHistoricalOrders, getVitrineSales, deleteVitrineSale } from '@/lib/actions/orders'
```

Also add, near the other UI imports at the top of the file:

```typescript
import ConfirmModalWithReason from '@/components/ui/ConfirmModalWithReason'
```

- [ ] **Step 2: Update `handleDelete` to take a reason and call `softDeleteOrder`**

Replace the existing `handleDelete` (`src/components/orders/OrdersClient.tsx:437-467`):

```typescript
    const handleDelete = async (reason: string) => {
        if (!orderToDelete) return

        const { id } = orderToDelete
        setDeletingId(id)
        setOrderToDelete(null)

        const deletePromise = async () => {
            const result = await softDeleteOrder(id, reason)
            if (result && typeof result === 'object' && 'error' in result && result.error) {
                throw new Error(String(result.error))
            }
            return result
        }

        toast.promise(deletePromise(), {
            loading: 'Suppression de la commande...',
            success: () => {
                setLocalOrders(prev => prev.filter(o => o.id !== id))
                setHistoryOrders(prev => prev.filter(o => o.id !== id))
                router.refresh()
                setDeletingId(null)
                return 'Commande supprimée. Restaurable pendant 30 jours depuis "Historique des suppressions".'
            },
            error: (err) => {
                setDeletingId(null)
                router.refresh()
                return err instanceof Error ? err.message : 'Une erreur est survenue.'
            }
        })
    }
```

- [ ] **Step 3: Replace the inline delete-confirmation modal with `ConfirmModalWithReason`**

Replace the `{/* --- MODAL CONFIRMATION DE SUPPRESSION --- */}` block (`src/components/orders/OrdersClient.tsx:1308-1343`):

```tsx
            {/* --- MODAL CONFIRMATION DE SUPPRESSION --- */}
            <ConfirmModalWithReason
                isOpen={!!orderToDelete}
                onClose={() => setOrderToDelete(null)}
                onConfirm={handleDelete}
                title="Supprimer la commande ?"
                message={`Êtes-vous sûr de vouloir supprimer la commande de ${orderToDelete?.name ?? ''} ? Elle restera restaurable pendant 30 jours depuis la page d'audit.`}
                confirmText="Supprimer"
                reasonLabel="Raison de la suppression (obligatoire)"
            />
```

- [ ] **Step 4: Update the e2e test to fill in the now-mandatory reason field**

In `e2e/commandes.spec.ts`, the "Parcours complet de création et suppression de commande" test currently clicks "Supprimer" right after the confirmation modal appears (lines 180-182). Update it to fill the reason first:

```typescript
    // Confirmer la suppression dans la modale de confirmation
    await expect(page.locator('h3:has-text("Supprimer la commande ?")')).toBeVisible();
    await page.fill('textarea', 'Suppression de test E2E');
    await page.locator('button:has-text("Supprimer")').click();
```

- [ ] **Step 5: Type-check**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev`, log in as a `vendeur` account, go to `/commandes`, click the trash icon on an order. Confirm: the "Supprimer" button is disabled until you type something in the comment field, and enabled once you do. Confirm deletion; the order disappears from the list and the toast mentions the 30-day restore window.

- [ ] **Step 7: Commit**

```bash
git add src/components/orders/OrdersClient.tsx e2e/commandes.spec.ts
git commit -m "feat(orders): require a comment to soft-delete an order from the Commandes page"
```

---

### Task 11: Audit page (`/commandes/audit`) and `OrderAuditClient`

**Files:**
- Create: `src/app/(pâtisserie)/commandes/audit/page.tsx`
- Create: `src/components/orders/OrderAuditClient.tsx`

**Interfaces:**
- Consumes: `getOrderDeletionAudit`, `restoreOrder`, `OrderDeletionAuditEntry` (Task 7); `getDaysUntilPurge`, `isPurgeable` (Task 6); `ConfirmModalWithReason` (Task 9).
- Produces: a standalone, filterable, paginated audit list reachable at `/commandes/audit`, with an inline "Restaurer" action on still-active deletions.

- [ ] **Step 1: Write the page (server component)**

```tsx
import { createClient } from '@/lib/supabase/server'
import { getOrderDeletionAudit } from '@/lib/actions/orders'
import OrderAuditClient from '@/components/orders/OrderAuditClient'

export default async function CommandesAuditPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('role_slug')
        .eq('id', user.id)
        .single()

    if (!profile || !['vendeur', 'gerant', 'super_admin'].includes(profile.role_slug)) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)' }}>
                Accès réservé aux vendeurs et gérants.
            </div>
        )
    }

    const result = await getOrderDeletionAudit({ page: 1, pageSize: 30 })

    if ('error' in result) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-error)' }}>
                {result.error}
            </div>
        )
    }

    return (
        <OrderAuditClient
            initialEntries={result.entries}
            initialCount={result.count}
            initialHasMore={result.hasMore}
        />
    )
}
```

- [ ] **Step 2: Write the client component**

```tsx
'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, ChevronUp, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { getOrderDeletionAudit, restoreOrder, type OrderDeletionAuditEntry } from '@/lib/actions/orders'
import { getDaysUntilPurge, isPurgeable } from '@/lib/domain/order-deletion'
import ConfirmModalWithReason from '@/components/ui/ConfirmModalWithReason'

type AuditEntry = OrderDeletionAuditEntry & { isRestorable: boolean }

const ACTION_LABELS: Record<AuditEntry['action'], { label: string; bg: string; color: string }> = {
    delete: { label: 'Suppression', bg: '#FEF2F2', color: '#EF4444' },
    restore: { label: 'Restauration', bg: '#ECFDF5', color: '#10B981' },
    purge: { label: 'Purge définitive', bg: '#F3F4F6', color: '#6B7280' }
}

export default function OrderAuditClient({
    initialEntries,
    initialCount,
    initialHasMore
}: {
    initialEntries: AuditEntry[]
    initialCount: number
    initialHasMore: boolean
}) {
    const router = useRouter()
    const [entries, setEntries] = useState(initialEntries)
    const [hasMore, setHasMore] = useState(initialHasMore)
    const [loadingMore, setLoadingMore] = useState(false)
    const [search, setSearch] = useState('')
    const [actionFilter, setActionFilter] = useState<'all' | AuditEntry['action']>('all')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [entryToRestore, setEntryToRestore] = useState<AuditEntry | null>(null)
    const [restoring, setRestoring] = useState(false)

    const filteredEntries = useMemo(() => {
        const term = search.trim().toLowerCase()
        return entries.filter(entry => {
            if (actionFilter !== 'all' && entry.action !== actionFilter) return false
            if (!term) return true
            return (
                entry.order_reference.toLowerCase().includes(term) ||
                entry.performed_by_name.toLowerCase().includes(term) ||
                entry.reason.toLowerCase().includes(term)
            )
        })
    }, [entries, search, actionFilter])

    const loadMore = async () => {
        setLoadingMore(true)
        const nextPage = Math.floor(entries.length / 30) + 1
        const result = await getOrderDeletionAudit({ page: nextPage, pageSize: 30 })
        if ('error' in result) {
            toast.error(result.error)
        } else {
            setEntries(prev => [...prev, ...result.entries])
            setHasMore(result.hasMore)
        }
        setLoadingMore(false)
    }

    const handleRestore = async (reason: string) => {
        if (!entryToRestore) return
        const orderId = entryToRestore.order_id
        setRestoring(true)

        const result = await restoreOrder(orderId, reason)
        setRestoring(false)
        setEntryToRestore(null)

        if (result && 'error' in result && result.error) {
            toast.error(result.error)
            return
        }

        toast.success('Commande restaurée')
        router.refresh()
        const refreshed = await getOrderDeletionAudit({ page: 1, pageSize: entries.length || 30 })
        if (!('error' in refreshed)) {
            setEntries(refreshed.entries)
            setHasMore(refreshed.hasMore)
        }
    }

    return (
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 80px' }}>
            <button
                onClick={() => router.push('/commandes')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--color-muted)', fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: '16px' }}
            >
                <ArrowLeft size={18} /> Retour aux commandes
            </button>

            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '4px' }}>Historique des suppressions</h1>
            <p style={{ color: 'var(--color-muted)', marginBottom: '24px' }}>
                {initialCount} événement{initialCount > 1 ? 's' : ''} enregistré{initialCount > 1 ? 's' : ''}
            </p>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 240px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher (commande, auteur, commentaire)…"
                        style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '12px', border: '1.5px solid var(--color-border)', boxSizing: 'border-box' }}
                    />
                </div>
                <select
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value as typeof actionFilter)}
                    style={{ padding: '10px 12px', borderRadius: '12px', border: '1.5px solid var(--color-border)' }}
                >
                    <option value="all">Toutes les actions</option>
                    <option value="delete">Suppressions</option>
                    <option value="restore">Restaurations</option>
                    <option value="purge">Purges définitives</option>
                </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredEntries.map(entry => {
                    const actionMeta = ACTION_LABELS[entry.action]
                    const isExpanded = expandedId === entry.id
                    const daysLeft = entry.action === 'delete' && entry.isRestorable
                        ? getDaysUntilPurge(entry.created_at)
                        : null
                    const expired = entry.action === 'delete' && entry.isRestorable && isPurgeable(entry.created_at)

                    return (
                        <div key={entry.id} style={{ border: '1.5px solid var(--color-border)', borderRadius: '16px', padding: '16px', background: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ background: actionMeta.bg, color: actionMeta.color, fontWeight: 700, fontSize: '0.75rem', padding: '4px 10px', borderRadius: '999px' }}>
                                        {actionMeta.label}
                                    </span>
                                    <strong>{entry.order_reference}</strong>
                                    <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                                        par {entry.performed_by_name} · {new Date(entry.created_at).toLocaleString('fr-FR')}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {entry.isRestorable && !expired && (
                                        <button
                                            onClick={() => setEntryToRestore(entry)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: 'none', background: '#10B981', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
                                        >
                                            <RotateCcw size={14} /> Restaurer
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
                                    >
                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </button>
                                </div>
                            </div>

                            {daysLeft !== null && (
                                <p style={{ marginTop: '8px', fontSize: '0.8rem', color: expired ? '#EF4444' : 'var(--color-muted)' }}>
                                    {expired ? 'Purge définitive imminente' : `Purge définitive dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`}
                                </p>
                            )}

                            <p style={{ marginTop: '10px', fontSize: '0.9rem' }}>{entry.reason}</p>

                            {isExpanded && entry.order_snapshot && (
                                <pre style={{ marginTop: '12px', background: '#F9FAFB', borderRadius: '12px', padding: '12px', fontSize: '0.75rem', overflowX: 'auto' }}>
                                    {JSON.stringify(entry.order_snapshot, null, 2)}
                                </pre>
                            )}
                        </div>
                    )
                })}

                {filteredEntries.length === 0 && (
                    <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '40px 0' }}>Aucun événement trouvé.</p>
                )}
            </div>

            {hasMore && (
                <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{ display: 'block', margin: '24px auto 0', padding: '12px 24px', borderRadius: '999px', border: '1.5px solid var(--color-border)', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                    {loadingMore ? 'Chargement...' : 'Charger plus'}
                </button>
            )}

            <ConfirmModalWithReason
                isOpen={!!entryToRestore}
                onClose={() => setEntryToRestore(null)}
                onConfirm={handleRestore}
                title="Restaurer la commande ?"
                message={`La commande ${entryToRestore?.order_reference ?? ''} redeviendra active et le stock recrédité sera à nouveau décrémenté si nécessaire.`}
                confirmText="Restaurer"
                reasonLabel="Raison de la restauration (obligatoire)"
                isLoading={restoring}
            />
        </div>
    )
}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manually verify in the browser**

Run: `npm run dev`, navigate to `/commandes/audit` after deleting a test order in Task 10's manual check. Confirm: the deletion appears at the top of the list with your comment, the "Purge définitive dans 30 jours" countdown shows, clicking "Restaurer" opens the reason modal, and after restoring, the order reappears on `/commandes` and the audit row's restore button disappears.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(pâtisserie)/commandes/audit/page.tsx" src/components/orders/OrderAuditClient.tsx
git commit -m "feat(orders): add /commandes/audit page for deletion/restore/purge history"
```

---

### Task 12: Link the Commandes page to the audit page

**Files:**
- Modify: `src/components/orders/OrdersClient.tsx`

**Interfaces:**
- Consumes: existing tab bar markup (`activeTab` buttons, `src/components/orders/OrdersClient.tsx:660-725`).
- Produces: a visible, one-click path from `/commandes` to `/commandes/audit`.

- [ ] **Step 1: Add a link button next to the existing tab bar**

Immediately after the closing tag of the `vitrine` tab button (the third tab button ending around `src/components/orders/OrdersClient.tsx:725`), add:

```tsx
                        <button
                            onClick={() => router.push('/commandes/audit')}
                            style={{
                                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 14px', borderRadius: '999px', border: '1.5px solid var(--color-border)',
                                background: '#fff', color: 'var(--color-muted)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
                            }}
                        >
                            🗂️ Historique des suppressions
                        </button>
```

(`router` is already in scope in `OrdersClient.tsx`, used throughout for navigation such as `router.push(\`/caisse?order=${order.id}\`)`.)

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, open `/commandes`, confirm the "🗂️ Historique des suppressions" button is visible next to the tabs and navigates to `/commandes/audit`.

- [ ] **Step 4: Commit**

```bash
git add src/components/orders/OrdersClient.tsx
git commit -m "feat(orders): link Commandes page to the deletion audit history"
```

---

### Task 13: Full manual verification pass

No new files — this is the end-to-end check tying every previous task together, since most of this feature (RLS, RPCs, cross-role UI) isn't covered by the project's existing automated test suite (vitest only covers `src/lib/domain`; the Playwright suite covers UI structure, not RLS/roles).

- [ ] **Step 1: Run the automated checks**

```bash
npm run typecheck
npm run lint
npx vitest run
```

Expected: all green.

- [ ] **Step 2: Vendeur can delete and the comment is enforced**

Log in as a `vendeur`. Open `/commandes`, delete an order that was never checked out (e.g. still `pending`). Confirm the "Supprimer" button stays disabled until a comment is typed. Confirm the order disappears from the active list, and does **not** appear in `/caisse` or the dashboard.

- [ ] **Step 3: Stock is only touched for checked-out orders**

Create and check out (encaisser) an order for a product with `track_stock = true`, noting its `current_stock` before. Soft-delete the order from `/commandes` and confirm `current_stock` increases by the ordered quantity. Repeat with an order that was never checked out and confirm its deletion leaves `current_stock` unchanged.

- [ ] **Step 4: Restore reverses stock and both roles can do it**

From `/commandes/audit`, restore the checked-out order deleted in Step 3. Confirm `current_stock` drops back to its pre-restore value, the order reappears in `/commandes`, and its audit row no longer shows a "Restaurer" button. Repeat the whole delete → restore cycle logged in as `gerant` to confirm both roles work end-to-end.

- [ ] **Step 5: Purge job runs and survives in the audit trail**

Via the Supabase MCP `execute_sql` tool, manually backdate a test deletion to force expiry, then invoke the purge function directly:

```sql
update public.orders set deleted_at = now() - interval '31 days' where id = '<test-order-id>';
select public.purge_expired_deleted_orders();
```

Confirm the order row is gone from `public.orders`, but a `purge` row for it still exists in `public.order_deletion_audit` and is visible on `/commandes/audit`.

- [ ] **Step 6: Run the e2e delete flow**

```bash
npx playwright test e2e/commandes.spec.ts
```

Expected: PASS, including the updated delete step (Task 10) that now fills in the comment field before confirming.
