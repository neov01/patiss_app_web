/**
 * Garde-fou de quota à l'échelle du projet.
 *
 * Le rate-limiter de la route est PAR UTILISATEUR (10 req / 5 min). Or le quota
 * Gemini free tier est de 5 req/min PAR MODÈLE et PAR PROJET, donc partagé entre
 * tous les utilisateurs et toutes les organisations. Trois gérants actifs en même
 * temps épuisaient le quota sans qu'aucun ne dépasse sa propre limite.
 *
 * La cascade couvre 3 modèles, soit ~15 req/min théoriques ; on plafonne à 12
 * pour garder de la marge (une question peut consommer plusieurs modèles).
 *
 * Limite connue : ce compteur vit en mémoire du processus. En serverless
 * multi-instances il est approximatif — c'est un amortisseur, pas une garantie.
 * Un compteur partagé (Redis / table Supabase) serait nécessaire pour être exact.
 */

const GLOBAL_LIMIT_PER_MIN = 12
const WINDOW_MS = 60_000

let windowStart = Date.now()
let count = 0

export interface QuotaDecision {
    allowed: boolean
    /** Secondes avant réouverture de la fenêtre, pour informer l'utilisateur. */
    retryAfterSec: number
}

export function reserveGlobalQuota(): QuotaDecision {
    const now = Date.now()
    if (now - windowStart >= WINDOW_MS) {
        windowStart = now
        count = 0
    }
    if (count >= GLOBAL_LIMIT_PER_MIN) {
        return { allowed: false, retryAfterSec: Math.ceil((windowStart + WINDOW_MS - now) / 1000) }
    }
    count++
    return { allowed: true, retryAfterSec: 0 }
}

/** Réservé aux tests : remet la fenêtre à zéro. */
export function __resetGlobalQuota() {
    windowStart = Date.now()
    count = 0
}
