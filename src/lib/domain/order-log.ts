/**
 * Journal structuré du parcours de création d'une commande.
 *
 * Une ligne JSON par étape, corrélée par l'identifiant de commande (la clé
 * d'idempotence générée par le client) : on peut ainsi retracer n'importe
 * quelle commande dans les journaux Vercel.
 *
 * Liste blanche stricte : seules des clés techniques passent. Aucun nom de
 * client, téléphone, montant, paiement ni jeton ne peut être journalisé,
 * même si un appelant en fournit par erreur.
 */

export type OrderLogEvent =
    | 'order.create.received'
    | 'order.create.rejected'
    | 'order.create.replayed'
    | 'order.create.saved'
    | 'order.create.failed'

export interface OrderLogFields {
    orderId?: string | null
    organizationId?: string | null
    userId?: string | null
    step?: string | null
    code?: string | null
    reason?: string | null
    orderNumber?: string | null
    durationMs?: number | null
}

const ALLOWED_KEYS: ReadonlyArray<keyof OrderLogFields> = [
    'orderId',
    'organizationId',
    'userId',
    'step',
    'code',
    'reason',
    'orderNumber',
    'durationMs',
]

const MAX_TEXT_LENGTH = 300

export function buildOrderLog(event: OrderLogEvent, fields: OrderLogFields = {}, now: Date = new Date()): string {
    const entry: Record<string, string | number> = { ts: now.toISOString(), event }

    for (const key of ALLOWED_KEYS) {
        const value = (fields as Record<string, unknown>)[key]
        if (typeof value === 'string') {
            entry[key] = value.slice(0, MAX_TEXT_LENGTH)
        } else if (typeof value === 'number' && Number.isFinite(value)) {
            entry[key] = value
        }
    }

    return JSON.stringify(entry)
}
