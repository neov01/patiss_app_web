/**
 * Classement des erreurs de synchronisation hors ligne.
 *
 * Erreur TEMPORAIRE : la commande est valide, c'est le contexte qui n'est pas
 * prêt (réseau coupé, session expirée, caisse pas encore ouverte, abonnement à
 * renouveler). Elle ne doit pas consommer les essais : sinon une commande
 * correcte devient « morte » et n'est plus rejouée sans intervention manuelle.
 *
 * Erreur DÉFINITIVE : le serveur a refusé le contenu de la commande.
 */

const TRANSIENT_FRAGMENTS = [
    'failed to fetch',
    'load failed',
    'network',
    'timeout',
    'timed out',
    'authretryablefetcherror',
    'non authentifié',
    'caisse est fermée',
    'abonnement a expiré',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
]

const TRANSIENT_HTTP_STATUS = /\b50[234]\b/

export function isTransientSyncError(message?: string | null): boolean {
    if (!message) return false
    const text = message.toLowerCase()
    return TRANSIENT_FRAGMENTS.some(fragment => text.includes(fragment)) || TRANSIENT_HTTP_STATUS.test(text)
}
