import { describe, expect, it } from 'vitest'
import { buildOrderLog } from './order-log'

const NOW = new Date('2026-11-17T16:49:11.417Z')
const ORDER_ID = '8dc312d9-6477-4f46-8460-c23c6440d6f3'

describe('buildOrderLog', () => {
    it('produit une ligne JSON avec date, événement et identifiant de commande', () => {
        const line = buildOrderLog('order.create.saved', { orderId: ORDER_ID, orderNumber: 'CMD-CAK-2026-000001' }, NOW)
        const parsed = JSON.parse(line)

        expect(parsed).toMatchObject({
            ts: '2026-11-17T16:49:11.417Z',
            event: 'order.create.saved',
            orderId: ORDER_ID,
            orderNumber: 'CMD-CAK-2026-000001',
        })
    })

    it('ne laisse jamais passer de donnée personnelle ou financière', () => {
        const fields = {
            orderId: ORDER_ID,
            customer_name: 'Mme Konan',
            customer_contact: '0102030405',
            total_amount: 45000,
            payments: [{ amount: 20000 }],
            token: 'secret',
        }

        const line = buildOrderLog('order.create.failed', fields as never, NOW)

        expect(line).not.toContain('Konan')
        expect(line).not.toContain('0102030405')
        expect(line).not.toContain('45000')
        expect(line).not.toContain('secret')
        expect(Object.keys(JSON.parse(line)).sort()).toEqual(['event', 'orderId', 'ts'])
    })

    it('tronque les textes trop longs et ignore les valeurs absentes', () => {
        const parsed = JSON.parse(
            buildOrderLog('order.create.failed', { reason: 'x'.repeat(1000), code: undefined, step: null as never }, NOW)
        )

        expect(parsed.reason.length).toBeLessThanOrEqual(300)
        expect(parsed).not.toHaveProperty('code')
        expect(parsed).not.toHaveProperty('step')
    })
})
