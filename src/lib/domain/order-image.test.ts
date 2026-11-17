import { describe, expect, it } from 'vitest'
import { ORDER_IMAGE_MAX_BYTES, buildOrderImagePath, validateOrderImage } from './order-image'

describe('validateOrderImage', () => {
    it('accepte une image compressée classique (webp, jpeg, png)', () => {
        expect(validateOrderImage({ type: 'image/webp', size: 35_000 })).toBeNull()
        expect(validateOrderImage({ type: 'image/jpeg', size: 400_000 })).toBeNull()
        expect(validateOrderImage({ type: 'image/png', size: 400_000 })).toBeNull()
    })

    it("refuse un fichier qui n'est pas une image", () => {
        expect(validateOrderImage({ type: 'application/pdf', size: 1000 })).toMatch(/image/i)
        expect(validateOrderImage({ type: '', size: 1000 })).toMatch(/image/i)
    })

    it('refuse un fichier vide ou trop volumineux', () => {
        expect(validateOrderImage({ type: 'image/webp', size: 0 })).toMatch(/vide/i)
        expect(validateOrderImage({ type: 'image/webp', size: ORDER_IMAGE_MAX_BYTES + 1 })).toMatch(/volumineuse/i)
    })
})

describe('buildOrderImagePath', () => {
    const NOW = new Date('2026-11-17T16:49:11.417Z')

    it("range l'image sous l'organisation, avec un nom unique en .webp", () => {
        expect(buildOrderImagePath('org-1', 'abc123', NOW)).toBe(`orders/org-1/${NOW.getTime()}-abc123.webp`)
    })

    it('ne laisse passer aucun caractère de chemin dangereux', () => {
        const path = buildOrderImagePath('org-1', '../../etc/passwd', NOW)

        expect(path.startsWith('orders/org-1/')).toBe(true)
        expect(path).not.toContain('..')
        expect(path.split('/').length).toBe(3)
    })
})
