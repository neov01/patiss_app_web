import { describe, expect, it } from 'vitest'
import { isTransientSyncError } from './sync-errors'

// Cause P8 : une erreur temporaire (réseau, session, caisse fermée) ne doit pas
// consommer les essais d'une commande hors ligne valide.

describe('isTransientSyncError', () => {
    it.each([
        'Failed to fetch',
        'Failed to fetch (offline)',
        'Load failed',
        'Network request failed',
        'The operation timed out',
        'Request timeout',
        'AuthRetryableFetchError',
        'Non authentifié',
        'La caisse est fermée. Ouvrez une session de vente avant cette opération.',
        'Votre abonnement a expiré. Cette action est bloquée en mode lecture seule.',
        'Bad Gateway 502',
        '503 Service Unavailable',
    ])("considère « %s » comme temporaire", message => {
        expect(isTransientSyncError(message)).toBe(true)
    })

    it.each([
        'Le nom du client est trop court',
        'Produit introuvable ou hors organisation : 123',
        "La commande doit contenir au moins un produit",
        'Montants de commande invalides',
        "Ce numéro de commande est déjà utilisé : la commande n'a pas été enregistrée. Veuillez réessayer.",
    ])("considère « %s » comme définitif (refus du serveur)", message => {
        expect(isTransientSyncError(message)).toBe(false)
    })

    it('traite un message vide ou absent comme définitif', () => {
        expect(isTransientSyncError('')).toBe(false)
        expect(isTransientSyncError(undefined)).toBe(false)
    })
})
