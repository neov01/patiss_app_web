import { beforeEach, describe, expect, it, vi } from 'vitest'

// Vente vitrine : numéro attribué par la base et idempotence par id.

const { rpc, maybeSingle, eqCalls } = vi.hoisted(() => ({
    rpc: vi.fn(),
    maybeSingle: vi.fn(),
    eqCalls: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/utils/subscription', () => ({
    ensureActiveSubscription: vi.fn().mockResolvedValue({ active: true }),
}))
vi.mock('@/lib/auth/organization-context', () => {
    class AuthContextError extends Error {}
    const chain = {
        eq: (column: string, value: unknown) => {
            eqCalls(column, value)
            return chain
        },
        maybeSingle,
    }
    const supabase = { rpc, from: () => ({ select: () => chain }) }
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

import { createVitrineSale } from './orders'

const SALE_ID = '33333333-3333-4333-8333-333333333333'
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444'

function input(withId = true) {
    return {
        ...(withId ? { id: SALE_ID } : {}),
        total_amount: 3000,
        items: [{ product_id: PRODUCT_ID, quantity: 3, unit_price: 1000 }],
    }
}

const duplicate = { code: '23505', message: 'duplicate key value violates unique constraint "orders_pkey"' }

describe('createVitrineSale', () => {
    beforeEach(() => {
        rpc.mockReset()
        maybeSingle.mockReset()
        eqCalls.mockReset()
        maybeSingle.mockResolvedValue({ data: null, error: null })
    })

    it("transmet l'id et n'envoie pas de numéro de commande", async () => {
        rpc.mockResolvedValue({ data: { order: { id: SALE_ID } }, error: null })

        const result = await createVitrineSale(input())

        expect(result).toEqual({ success: true })
        const args = rpc.mock.calls[0][1] as { p_order: Record<string, unknown> }
        expect(args.p_order.id).toBe(SALE_ID)
        expect(args.p_order).not.toHaveProperty('order_number')
    })

    it("renvoie un succès sur 23505 quand la vente existe déjà (rejeu)", async () => {
        rpc.mockResolvedValue({ data: null, error: duplicate })
        maybeSingle.mockResolvedValue({ data: { id: SALE_ID }, error: null })

        const result = await createVitrineSale(input())

        expect(result).toEqual({ success: true })
        expect(eqCalls).toHaveBeenCalledWith('id', SALE_ID)
        expect(eqCalls).toHaveBeenCalledWith('organization_id', 'org-1')
    })

    it("renvoie une erreur sur 23505 quand la vente n'existe pas", async () => {
        rpc.mockResolvedValue({ data: null, error: duplicate })

        const result = await createVitrineSale(input())

        expect(result).toHaveProperty('error')
        expect(result).not.toHaveProperty('success')
    })

    it("renvoie une erreur sur 23505 sans id (aucun rejeu possible)", async () => {
        rpc.mockResolvedValue({ data: null, error: duplicate })

        const result = await createVitrineSale(input(false))

        expect(result).toHaveProperty('error')
        expect(maybeSingle).not.toHaveBeenCalled()
    })
})
