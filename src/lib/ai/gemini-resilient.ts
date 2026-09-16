import { GoogleGenerativeAI, type GenerateContentStreamResult } from '@google/generative-ai'
import { env } from '@/lib/env'
import { MODEL_CASCADE, classifyFailure, serverRetryDelayMs, statusOf } from './retry-policy'

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)

/** Budget global : au-delà, on rend la main plutôt que de risquer un timeout de fonction. */
const DEFAULT_TIME_BUDGET_MS = 20_000
/** Une seule reprise rapide par modèle : au-delà, la cascade est plus rentable que l'attente. */
const RETRIES_PER_MODEL = 1
const BASE_BACKOFF_MS = 400

export interface AttemptLog {
    model: string
    attempt: number
    status?: number
    outcome: 'ok' | 'transient' | 'switch-model' | 'fatal'
    elapsedMs: number
}

export class AllModelsUnavailableError extends Error {
    readonly attempts: AttemptLog[]
    constructor(attempts: AttemptLog[], cause?: unknown) {
        super('Tous les modèles Gemini de la cascade sont indisponibles.')
        this.name = 'AllModelsUnavailableError'
        this.attempts = attempts
        this.cause = cause
    }
}

export interface ResilientResult {
    result: GenerateContentStreamResult
    model: string
    attempts: AttemptLog[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Jitter : évite que plusieurs requêtes concurrentes ne repartent en rafale synchronisée. */
const jitter = (ms: number) => ms + Math.floor(Math.random() * 250)

/**
 * Ouvre un stream Gemini en parcourant la cascade de modèles.
 *
 * Ne réessaie que ce qui est réellement transitoire, et bascule de modèle sur
 * quota épuisé (429) ou modèle absent (404) — attendre 30 s n'a aucun intérêt
 * quand le modèle suivant dispose d'un compteur de quota distinct.
 */
export async function generateContentStreamResilient(
    prompt: string,
    systemInstruction: string,
    options: { timeBudgetMs?: number } = {}
): Promise<ResilientResult> {
    const budget = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS
    const startedAt = Date.now()
    const attempts: AttemptLog[] = []
    let lastErr: unknown

    for (const modelName of MODEL_CASCADE) {
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction })

        for (let attempt = 1; attempt <= RETRIES_PER_MODEL + 1; attempt++) {
            const t0 = Date.now()
            try {
                const result = await model.generateContentStream(prompt)
                attempts.push({ model: modelName, attempt, outcome: 'ok', elapsedMs: Date.now() - t0 })
                return { result, model: modelName, attempts }
            } catch (err) {
                lastErr = err
                const status = statusOf(err)
                const kind = classifyFailure(err)
                attempts.push({ model: modelName, attempt, status, outcome: kind, elapsedMs: Date.now() - t0 })

                if (kind === 'fatal') throw err
                if (kind === 'switch-model') break

                const isLastAttemptOnModel = attempt > RETRIES_PER_MODEL
                if (isLastAttemptOnModel) break

                const wait = jitter(Math.max(serverRetryDelayMs(err) ?? 0, BASE_BACKOFF_MS * attempt))
                // Ne pas dormir si le réveil se ferait déjà hors budget : la cascade est plus utile.
                if (Date.now() - startedAt + wait >= budget) break
                await sleep(wait)
            }
        }

        if (Date.now() - startedAt >= budget) break
    }

    throw new AllModelsUnavailableError(attempts, lastErr)
}

export { MODEL_CASCADE } from './retry-policy'
