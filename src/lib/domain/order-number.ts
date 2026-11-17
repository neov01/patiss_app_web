/**
 * Numérotation des commandes.
 *
 * Le numéro DÉFINITIF (ex. CMD-BAB-2026-000841) est attribué par la base de
 * données, dans la même transaction que la création de la commande
 * (RPC create_order_atomic), sans trou ni collision possible.
 *
 * Tant que la commande n'est pas enregistrée (formulaire ouvert, ou commande
 * en file d'attente hors ligne), on affiche une référence PROVISOIRE dérivée
 * de l'identifiant de la commande. Elle n'est jamais stockée comme numéro.
 */

const PROVISIONAL_PATTERN = /^LOC-[0-9A-F]{6}$/

export function provisionalOrderRef(orderId: string): string {
    const hex = orderId.replace(/[^0-9a-f]/gi, '').slice(0, 6).toUpperCase()
    return `LOC-${hex}`
}

export function isProvisionalOrderRef(value: string | null | undefined): boolean {
    return !!value && PROVISIONAL_PATTERN.test(value)
}
