import { GoogleGenerativeAIFetchError } from '@google/generative-ai'

/**
 * Politique de reprise, isolée de tout I/O pour être testable sans réseau ni env.
 */

/**
 * Modèles épinglés, ordonnés du plus rapide au plus capable.
 *
 * On n'utilise PLUS `gemini-flash-latest` : c'est un alias mouvant qui pointait
 * sur `gemini-3.7-flash`, saturé en permanence sur le free tier (mesuré :
 * 1 succès sur 10, `503 "This model is currently experiencing high demand"`).
 * Un alias peut re-glisser vers le prochain modèle chaud sans prévenir.
 *
 * Le quota free tier (5 req/min) est compté PAR MODÈLE et PAR PROJET : basculer
 * de modèle plutôt que marteler le même triple le débit réellement disponible.
 */
export const MODEL_CASCADE = [
    'gemini-2.5-flash',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash',
] as const

export type FailureKind =
    /** Surcharge côté Google : une reprise rapide vaut le coup. */
    | 'transient'
    /** Quota épuisé ou modèle absent : changer de modèle, ne pas attendre. */
    | 'switch-model'
    /** Erreur déterministe : réessayer ne ferait que brûler du quota. */
    | 'fatal'

const TRANSIENT_STATUS = new Set([408, 500, 502, 503, 504])
const FATAL_STATUS = new Set([400, 401, 403])

export function statusOf(err: unknown): number | undefined {
    if (err instanceof GoogleGenerativeAIFetchError) return err.status
    // Filet de sécurité : certaines couches réseau n'exposent le code que dans le message.
    const msg = err instanceof Error ? err.message : String(err)
    const m = msg.match(/\[(\d{3})\s/)
    return m ? Number(m[1]) : undefined
}

export function classifyFailure(err: unknown): FailureKind {
    const status = statusOf(err)
    // Panne réseau sans code HTTP : traitée comme transitoire.
    if (status === undefined) return 'transient'
    if (FATAL_STATUS.has(status)) return 'fatal'
    // 429 = quota (compteur distinct par modèle), 404 = modèle indisponible pour cette clé.
    if (status === 429 || status === 404) return 'switch-model'
    if (TRANSIENT_STATUS.has(status)) return 'transient'
    return 'fatal'
}

/** Le serveur renvoie parfois un RetryInfo ("31s") : on le respecte plutôt qu'un délai arbitraire. */
export function serverRetryDelayMs(err: unknown): number | undefined {
    if (!(err instanceof GoogleGenerativeAIFetchError) || !err.errorDetails) return undefined
    for (const detail of err.errorDetails) {
        const raw = detail['retryDelay']
        if (typeof raw === 'string') {
            const secs = parseFloat(raw.replace(/s$/, ''))
            if (Number.isFinite(secs)) return Math.round(secs * 1000)
        }
    }
    return undefined
}
