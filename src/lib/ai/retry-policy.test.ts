import { describe, expect, it } from 'vitest'
import { GoogleGenerativeAIFetchError } from '@google/generative-ai'
import { MODEL_CASCADE, classifyFailure, serverRetryDelayMs, statusOf } from './retry-policy'

const fetchError = (status: number, details?: Record<string, unknown>[]) =>
    new GoogleGenerativeAIFetchError('boom', status, 'Error', details)

describe('cascade de modèles', () => {
    it("n'utilise aucun alias mouvant (cause de la panne d'origine)", () => {
        // `gemini-flash-latest` pointait sur gemini-3.7-flash, saturé en free tier.
        expect(MODEL_CASCADE).not.toContain('gemini-flash-latest')
    })

    it('propose plusieurs modèles distincts, pour multiplier les compteurs de quota', () => {
        expect(MODEL_CASCADE.length).toBeGreaterThanOrEqual(3)
        expect(new Set(MODEL_CASCADE).size).toBe(MODEL_CASCADE.length)
    })
})

describe('classifyFailure', () => {
    it('traite la surcharge Google (503) comme transitoire', () => {
        expect(classifyFailure(fetchError(503))).toBe('transient')
    })

    it.each([500, 502, 504, 408])('traite %i comme transitoire', (status) => {
        expect(classifyFailure(fetchError(status))).toBe('transient')
    })

    it('bascule de modèle sur quota épuisé (429) au lieu d\'attendre', () => {
        // Le quota est compté par modèle : attendre 30 s est inutile.
        expect(classifyFailure(fetchError(429))).toBe('switch-model')
    })

    it('bascule de modèle si le modèle est absent pour cette clé (404)', () => {
        expect(classifyFailure(fetchError(404))).toBe('switch-model')
    })

    it.each([400, 401, 403])('ne réessaie jamais sur %i (brûlerait du quota)', (status) => {
        expect(classifyFailure(fetchError(status))).toBe('fatal')
    })

    it('traite une panne réseau sans code HTTP comme transitoire', () => {
        expect(classifyFailure(new Error('fetch failed'))).toBe('transient')
    })
})

describe('statusOf', () => {
    it('lit le status typé du SDK', () => {
        expect(statusOf(fetchError(503))).toBe(503)
    })

    it('retombe sur le code présent dans le message brut', () => {
        expect(statusOf(new Error('[503 Service Unavailable] overloaded'))).toBe(503)
    })

    it('renvoie undefined quand aucun code n\'est identifiable', () => {
        expect(statusOf(new Error('network down'))).toBeUndefined()
    })
})

describe('serverRetryDelayMs', () => {
    it('respecte le RetryInfo renvoyé par Google', () => {
        const err = fetchError(429, [
            { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '31s' },
        ])
        expect(serverRetryDelayMs(err)).toBe(31_000)
    })

    it('gère un délai fractionnaire', () => {
        const err = fetchError(429, [{ retryDelay: '12.638447746s' }])
        expect(serverRetryDelayMs(err)).toBe(12_638)
    })

    it('renvoie undefined sans RetryInfo', () => {
        expect(serverRetryDelayMs(fetchError(503))).toBeUndefined()
    })
})
