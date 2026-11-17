import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cause P1 : une collision de order_number (23505) ne doit JAMAIS être
// renvoyée comme un succès tant que la commande n'existe pas en base.

const { rpc, maybeSingle } = vi.hoisted(() => ({
    rpc: vi.fn(),
    maybeSingle: vi.fn(),
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
            select: () => ({
                eq: () => ({ eq: () => ({ maybeSingle }), maybeSingle }),
            }),
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
