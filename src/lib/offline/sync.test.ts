import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cause P8 : file hors ligne. Le rejeu doit être séquentiel et chronologique
// (numéros attribués dans l'ordre de saisie), ne pas brûler les essais sur une
// erreur temporaire, et remonter le numéro définitif de chaque commande.

const mocks = vi.hoisted(() => ({
    getPendingTransactions: vi.fn(),
    removePendingTransaction: vi.fn(),
    updatePendingTransactionRetry: vi.fn(),
    getPendingOrders: vi.fn(),
    removePendingOrder: vi.fn(),
    updatePendingOrderRetry: vi.fn(),
    createOrder: vi.fn(),
    encaisserTransaction: vi.fn(),
}))

vi.mock('./db', () => ({
    MAX_OFFLINE_RETRIES: 3,
    getPendingTransactions: mocks.getPendingTransactions,
    removePendingTransaction: mocks.removePendingTransaction,
    updatePendingTransactionRetry: mocks.updatePendingTransactionRetry,
    getPendingOrders: mocks.getPendingOrders,
    removePendingOrder: mocks.removePendingOrder,
    updatePendingOrderRetry: mocks.updatePendingOrderRetry,
}))
vi.mock('@/lib/actions/orders', () => ({ createOrder: mocks.createOrder }))
vi.mock('@/lib/actions/caisse', () => ({ encaisserTransaction: mocks.encaisserTransaction }))
vi.mock('@/lib/supabase/client', () => ({
    createClient: () => ({ auth: { getSession: async () => ({ data: { session: {} } }), refreshSession: async () => ({}) } }),
}))

import { syncPendingData, syncSingleOrder } from './sync'
import { provisionalOrderRef } from '@/lib/domain/order-number'

function pendingOrder(overrides: Record<string, unknown> = {}) {
    return {
        offlineId: 1,
        id: '8dc312d9-6477-4f46-8460-c23c6440d6f3',
        customer_name: 'Cliente Test',
        customer_contact: '0102030405',
        pickup_date: '2026-11-20T10:00:00.000Z',
        reception_type: 'retrait',
        priority: 'normale',
        createdAt: '2026-11-17T16:00:00.000Z',
        items: [{ id: 'i1', product_id: null, name: 'Gateau', quantity: 1, unit_price: 10000 }],
        ...overrides,
    }
}

describe('rejeu des commandes hors ligne', () => {
    beforeEach(() => {
        Object.values(mocks).forEach(m => m.mockReset())
        vi.stubGlobal('navigator', { onLine: true })
        mocks.getPendingTransactions.mockResolvedValue([])
        mocks.getPendingOrders.mockResolvedValue([])
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it("rejoue les commandes l'une après l'autre, dans l'ordre chronologique de saisie", async () => {
        const seen: string[] = []
        let running = 0
        let maxParallel = 0
        mocks.createOrder.mockImplementation(async (input: { id: string }) => {
            running++
            maxParallel = Math.max(maxParallel, running)
            await new Promise(resolve => setTimeout(resolve, 5))
            seen.push(input.id)
            running--
            return { data: { id: input.id, order_number: `CMD-CAK-2026-00000${seen.length}` } }
        })
        mocks.getPendingOrders.mockResolvedValue([
            pendingOrder({ offlineId: 2, id: 'B', createdAt: '2026-11-17T16:30:00.000Z' }),
            pendingOrder({ offlineId: 1, id: 'A', createdAt: '2026-11-17T16:00:00.000Z' }),
            pendingOrder({ offlineId: 3, id: 'C', createdAt: '2026-11-17T17:00:00.000Z' }),
        ])

        await syncPendingData()

        expect(seen).toEqual(['A', 'B', 'C'])
        expect(maxParallel).toBe(1)
    })

    it("ne consomme pas d'essai sur une erreur temporaire (caisse fermée)", async () => {
        mocks.createOrder.mockResolvedValue({ error: 'La caisse est fermée. Ouvrez une session de vente avant cette opération.' })

        const res = await syncSingleOrder(pendingOrder() as never)

        expect(res.success).toBe(false)
        expect(mocks.updatePendingOrderRetry).toHaveBeenCalledWith(1, expect.stringContaining('caisse'), false)
    })

    it("ne consomme pas d'essai sur une coupure réseau", async () => {
        mocks.createOrder.mockRejectedValue(new TypeError('Failed to fetch'))

        await syncSingleOrder(pendingOrder() as never)

        expect(mocks.updatePendingOrderRetry).toHaveBeenCalledWith(1, 'Failed to fetch', false)
    })

    it("consomme un essai quand le serveur refuse définitivement la commande", async () => {
        mocks.createOrder.mockResolvedValue({ error: 'Produit introuvable ou hors organisation : 123' })

        await syncSingleOrder(pendingOrder() as never)

        expect(mocks.updatePendingOrderRetry).toHaveBeenCalledWith(1, expect.stringContaining('Produit introuvable'), true)
    })

    it('retire la commande de la file et renvoie son numéro définitif après succès', async () => {
        mocks.createOrder.mockResolvedValue({ data: { id: 'x', order_number: 'CMD-CAK-2026-000841' } })

        const res = await syncSingleOrder(pendingOrder() as never)

        expect(res).toMatchObject({ success: true, orderNumber: 'CMD-CAK-2026-000841' })
        expect(mocks.removePendingOrder).toHaveBeenCalledWith(1)
    })

    it('associe chaque référence provisoire au numéro définitif dans le résultat de synchronisation', async () => {
        mocks.createOrder.mockResolvedValue({ data: { id: 'x', order_number: 'CMD-CAK-2026-000841' } })
        const order = pendingOrder()
        mocks.getPendingOrders.mockResolvedValue([order])

        const result = await syncPendingData()

        expect(result.syncedOrders).toBe(1)
        expect(result.syncedOrderRefs).toEqual([
            { ref: provisionalOrderRef(order.id), orderNumber: 'CMD-CAK-2026-000841' },
        ])
    })

    it('ignore et compte comme « morte » une commande qui a épuisé ses essais', async () => {
        mocks.getPendingOrders.mockResolvedValue([pendingOrder({ retryCount: 3 })])

        const result = await syncPendingData()

        expect(mocks.createOrder).not.toHaveBeenCalled()
        expect(result.deadOrders).toBe(1)
    })
})
