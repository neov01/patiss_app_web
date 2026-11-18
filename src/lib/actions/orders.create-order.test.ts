import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cause P1 : une collision de order_number (23505) ne doit JAMAIS être
// renvoyée comme un succès tant que la commande n'existe pas en base.

const { rpc, maybeSingle, selectColumns } = vi.hoisted(() => ({
    rpc: vi.fn(),
    maybeSingle: vi.fn(),
    selectColumns: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/utils/subscription', () => ({
    ensureActiveSubscription: vi.fn().mockResolvedValue({ active: true }),
}))
vi.mock('@/lib/auth/organization-context', () => {
    class AuthContextError extends Error {}
    const supabase = {
        rpc,
        from: () => ({
            select: (columns: string) => {
                selectColumns(columns)
                return { eq: () => ({ eq: () => ({ maybeSingle }), maybeSingle }) }
            },
        }),
    }
    return {
        AuthContextError,
        requireRoleContext: vi.fn().mockResolvedValue({
            supabase,
            userId: 'user-1',
            organizationId: 'org-1',
            role: 'vendeur',
        }),
        requireOpenSalesSession: vi.fn().mockResolvedValue('session-1'),
    }
})

import { createOrder } from './orders'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'

function validInput() {
    return {
        id: ORDER_ID,
        order_number: 'CMD-2026-1234',
        customer_name: 'Cliente Test',
        customer_contact: '0102030405',
        pickup_date: '2026-11-20T10:00:00.000Z',
        reception_type: 'retrait',
        subtotal: 10000,
        discount_amount: 0,
        total_amount: 10000,
        deposit_amount: 0,
        items: [
            { name: 'Gateau', quantity: 1, unit_price: 10000, from_inventory: false },
        ],
    }
}

const numberCollision = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "orders_order_number_key"',
}

describe('createOrder — erreur 23505 (cause P1)', () => {
    beforeEach(() => {
        rpc.mockReset()
        maybeSingle.mockReset()
        maybeSingle.mockResolvedValue({ data: null, error: null }) // défaut : relecture sans résultat
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it("renvoie une erreur quand le numéro est déjà pris par une autre commande", async () => {
        rpc.mockResolvedValue({ data: null, error: numberCollision })
        maybeSingle.mockResolvedValue({ data: null, error: null }) // l'id n'existe pas

        const result = await createOrder(validInput())

        expect(result).toHaveProperty('error')
        expect(result).not.toHaveProperty('data')
    })

    it("renvoie la commande existante quand c'est un rejeu du même id (idempotence)", async () => {
        rpc.mockResolvedValue({ data: null, error: numberCollision })
        const existing = { id: ORDER_ID, order_number: 'CMD-2026-1234' }
        maybeSingle.mockResolvedValue({ data: existing, error: null })

        const result = await createOrder(validInput())

        expect(result).toEqual({ data: existing })
    })

    it("renvoie une erreur si la vérification d'existence échoue", async () => {
        rpc.mockResolvedValue({ data: null, error: numberCollision })
        maybeSingle.mockResolvedValue({ data: null, error: { message: 'timeout' } })

        const result = await createOrder(validInput())

        expect(result).toHaveProperty('error')
    })
})

describe('createOrder — numéro attribué par la base (cause P1, correction C5)', () => {
    beforeEach(() => {
        rpc.mockReset()
        maybeSingle.mockReset()
        maybeSingle.mockResolvedValue({ data: null, error: null }) // défaut : relecture sans résultat
    })

    it("accepte une commande sans order_number (le client n'en fabrique plus)", async () => {
        rpc.mockResolvedValue({ data: { order: { id: ORDER_ID, order_number: 'CMD-BAB-2026-000001' } }, error: null })
        const { order_number: _omit, ...withoutNumber } = validInput()
        void _omit

        const result = await createOrder(withoutNumber)

        expect(result).not.toHaveProperty('error')
        expect(result).toHaveProperty('data')
    })

    it("n'envoie jamais le numéro fourni par le client à la RPC", async () => {
        rpc.mockResolvedValue({ data: { order: { id: ORDER_ID, order_number: 'CMD-BAB-2026-000001' } }, error: null })

        await createOrder(validInput()) // contient encore order_number (ancien client en cache)

        const args = rpc.mock.calls[0][1] as { p_order: Record<string, unknown> }
        expect(args.p_order).not.toHaveProperty('order_number')
    })
})

// ── C4 : journalisation structurée, corrélée à l'identifiant de commande ──

type LogLine = { event: string; orderId?: string; organizationId?: string; userId?: string; step?: string; code?: string; reason?: string; orderNumber?: string; durationMs?: number }

function collectLogs(spies: Array<ReturnType<typeof vi.spyOn>>): LogLine[] {
    return spies
        .flatMap(spy => spy.mock.calls)
        .map(call => call[0])
        .filter((first): first is string => typeof first === 'string' && first.startsWith('{'))
        .map(first => JSON.parse(first) as LogLine)
}

describe('createOrder — journalisation (cause P6, correction C4)', () => {
    let info: ReturnType<typeof vi.spyOn>
    let warn: ReturnType<typeof vi.spyOn>
    let error: ReturnType<typeof vi.spyOn>
    const logs = () => collectLogs([info, warn, error])

    beforeEach(() => {
        rpc.mockReset()
        maybeSingle.mockReset()
        maybeSingle.mockResolvedValue({ data: null, error: null }) // défaut : relecture sans résultat
        info = vi.spyOn(console, 'info').mockImplementation(() => {})
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        error = vi.spyOn(console, 'error').mockImplementation(() => {})
        // Les espions des tests précédents conservent leurs appels : repartir de zéro
        info.mockClear()
        warn.mockClear()
        error.mockClear()
    })

    it("journalise « reçue » puis « enregistrée » avec l'id, le numéro et la durée", async () => {
        rpc.mockResolvedValue({ data: { order: { id: ORDER_ID, order_number: 'CMD-CAK-2026-000001' } }, error: null })

        await createOrder(validInput())

        const lines = logs()
        expect(lines.map(l => l.event)).toEqual(['order.create.received', 'order.create.saved'])
        expect(lines[1]).toMatchObject({
            orderId: ORDER_ID,
            organizationId: 'org-1',
            userId: 'user-1',
            orderNumber: 'CMD-CAK-2026-000001',
        })
        expect(typeof lines[1].durationMs).toBe('number')
    })

    it("n'écrit jamais le nom, le téléphone ni les montants dans les journaux", async () => {
        rpc.mockResolvedValue({ data: { order: { id: ORDER_ID, order_number: 'CMD-CAK-2026-000001' } }, error: null })

        await createOrder(validInput())

        const raw = JSON.stringify(logs())
        expect(raw).not.toContain('Cliente Test')
        expect(raw).not.toContain('0102030405')
        expect(raw).not.toContain('10000')
    })

    it("journalise un échec de la base avec le code et la raison", async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'La caisse est fermée.' } })

        const result = await createOrder(validInput())

        expect(result).toHaveProperty('error')
        const failed = logs().find(l => l.event === 'order.create.failed')
        expect(failed).toMatchObject({ orderId: ORDER_ID, step: 'rpc', code: '42501', reason: 'La caisse est fermée.' })
    })

    it('journalise une collision (23505) sans commande existante comme un échec', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "orders_order_number_key"' } })
        maybeSingle.mockResolvedValue({ data: null, error: null })

        await createOrder(validInput())

        expect(logs().find(l => l.event === 'order.create.failed')).toMatchObject({ orderId: ORDER_ID, code: '23505' })
    })

    it('journalise un rejeu (23505 avec commande existante) comme « replayed »', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "orders_pkey"' } })
        maybeSingle.mockResolvedValue({ data: { id: ORDER_ID, order_number: 'CMD-CAK-2026-000001' }, error: null })

        await createOrder(validInput())

        expect(logs().map(l => l.event)).toContain('order.create.replayed')
        expect(logs().map(l => l.event)).not.toContain('order.create.failed')
    })

    it('journalise un rejet de validation avec l\'id de commande', async () => {
        const { items: _items, ...withoutItems } = validInput()
        void _items

        const result = await createOrder(withoutItems)

        expect(result).toHaveProperty('error')
        expect(logs().find(l => l.event === 'order.create.rejected')).toMatchObject({ orderId: ORDER_ID, step: 'validation' })
    })
})

// ── Compatibilité avec l'injection de la commande dans la liste (OrdersClient) ──

describe('createOrder — rejeu : commande complète renvoyée', () => {
    beforeEach(() => {
        rpc.mockReset()
        maybeSingle.mockReset()
        maybeSingle.mockResolvedValue({ data: null, error: null }) // défaut : relecture sans résultat
        selectColumns.mockReset()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'info').mockImplementation(() => {})
    })

    it("relit la commande existante avec ses lignes et ses paiements, comme le chemin normal", async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "orders_pkey"' } })
        maybeSingle.mockResolvedValue({ data: { id: ORDER_ID, order_items: [], order_payments: [] }, error: null })

        await createOrder(validInput())

        const columns = String(selectColumns.mock.calls[0]?.[0] ?? '')
        expect(columns).toContain('order_items')
        expect(columns).toContain('order_payments')
    })
})
