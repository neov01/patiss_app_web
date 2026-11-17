import { describe, expect, it } from 'vitest'
import { isProvisionalOrderRef, provisionalOrderRef } from './order-number'

const ID_A = '8dc312d9-6477-4f46-8460-c23c6440d6f3'
const ID_B = '7e0dba4b-33df-45da-ba3c-e388b5d5129a'

describe('provisionalOrderRef', () => {
    it('est déterministe pour un même id de commande', () => {
        expect(provisionalOrderRef(ID_A)).toBe(provisionalOrderRef(ID_A))
    })

    it('a le format LOC-XXXXXX en majuscules, dérivé de l\'id', () => {
        expect(provisionalOrderRef(ID_A)).toBe('LOC-8DC312')
    })

    it('diffère pour deux commandes différentes', () => {
        expect(provisionalOrderRef(ID_A)).not.toBe(provisionalOrderRef(ID_B))
    })

    it('ne ressemble jamais à un numéro définitif CMD-', () => {
        expect(provisionalOrderRef(ID_A).startsWith('CMD-')).toBe(false)
    })
})

describe('isProvisionalOrderRef', () => {
    it('reconnaît une référence provisoire', () => {
        expect(isProvisionalOrderRef('LOC-8DC312')).toBe(true)
    })

    it('rejette un numéro définitif, un ancien numéro aléatoire ou une valeur vide', () => {
        expect(isProvisionalOrderRef('CMD-BAB-2026-000841')).toBe(false)
        expect(isProvisionalOrderRef('CMD-2026-4821')).toBe(false)
        expect(isProvisionalOrderRef(null)).toBe(false)
        expect(isProvisionalOrderRef(undefined)).toBe(false)
        expect(isProvisionalOrderRef('')).toBe(false)
    })
})
