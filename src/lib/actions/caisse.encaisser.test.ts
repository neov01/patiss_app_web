import { beforeEach, describe, expect, it, vi } from 'vitest'

// Un refus pour doublon (23505) de encaisser_atomic ne doit JAMAIS être
// renvoyé comme un succès tant que la vente n'existe pas en base.

const { rpc, maybeSingle, eqCalls, fromTables } = vi.hoisted(() => ({
    rpc: vi.fn(),
    maybeSingle: vi.fn(),
    eqCalls: vi.fn(),
    fromTables: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/organization-context', () => {
    class AuthContextError extends Error {}
    const chain = {
        eq: (column: string, value: unknown) => {
            eqCalls(column, value)
            return chain
        },
        maybeSingle,
    }
    const supabase = {
        rpc,
        from: (table: string) => {
            fromTables(table)
            return { select: () => chain }
        },
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

import { encaisserTransaction } from './caisse'

const TX_ID = '22222222-2222-4222-8222-222222222222'

function payload() {
    return {
        id: TX_ID,
        order_id: null,
        client_name: 'Vente vitrine',
        amount: 5000,
        payment_method: 'cash',
        items: [{ product_id: null, name: 'Croissant', quantity: 5, unit_price: 1000 }],
    }
}

const duplicate = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "transactions_pkey"',
}

describe('encaisserTransaction — erreur 23505', () => {
    beforeEach(() => {
        rpc.mockReset()
        maybeSingle.mockReset()
        eqCalls.mockReset()
        fromTables.mockReset()
        maybeSingle.mockResolvedValue({ data: null, error: null })
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it("renvoie une erreur quand la vente n'existe pas en base", async () => {
        rpc.mockResolvedValue({ data: null, error: duplicate })

        const result = await encaisserTransaction(payload())

        expect(result).toHaveProperty('error')
        expect(result).not.toHaveProperty('success')
    })

    it("renvoie un succès quand c'est un rejeu du même id dans l'organisation", async () => {
        rpc.mockResolvedValue({ data: null, error: duplicate })
        maybeSingle.mockResolvedValue({ data: { id: TX_ID }, error: null })

        const result = await encaisserTransaction(payload())

        expect(result).toEqual({ success: true })
        expect(fromTables).toHaveBeenCalledWith('transactions')
        expect(eqCalls).toHaveBeenCalledWith('id', TX_ID)
        expect(eqCalls).toHaveBeenCalledWith('organization_id', 'org-1')
    })

    it("détecte aussi le doublon par le message seul", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: duplicate.message } })

        const result = await encaisserTransaction(payload())

        expect(result).toHaveProperty('error')
    })

    it("renvoie une erreur si la vérification d'existence échoue", async () => {
        rpc.mockResolvedValue({ data: null, error: duplicate })
        maybeSingle.mockResolvedValue({ data: null, error: { message: 'timeout' } })

        const result = await encaisserTransaction(payload())

        expect(result).toHaveProperty('error')
    })

    it('renvoie un succès sans relecture quand la RPC réussit', async () => {
        rpc.mockResolvedValue({ data: TX_ID, error: null })

        const result = await encaisserTransaction(payload())

        expect(result).toEqual({ success: true })
        expect(maybeSingle).not.toHaveBeenCalled()
    })
})
