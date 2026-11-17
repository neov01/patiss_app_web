/**
 * Règles des images de commande (gâteaux personnalisés).
 * Pures et testables : utilisées par l'action serveur d'envoi.
 */

/** Une image compressée côté client pèse ~35 Ko ; 3 Mo laisse une large marge. */
export const ORDER_IMAGE_MAX_BYTES = 3 * 1024 * 1024

const ALLOWED_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png'])

/** Renvoie un message d'erreur lisible, ou null si le fichier est acceptable. */
export function validateOrderImage(file: { type: string; size: number }): string | null {
    if (!ALLOWED_TYPES.has(file.type)) {
        return "Le fichier doit être une image (WebP, JPEG ou PNG)."
    }
    if (file.size <= 0) {
        return "Le fichier image est vide."
    }
    if (file.size > ORDER_IMAGE_MAX_BYTES) {
        return "L'image est trop volumineuse (3 Mo maximum)."
    }
    return null
}

/** Chemin de stockage : orders/<organisation>/<horodatage>-<identifiant>.webp */
export function buildOrderImagePath(organizationId: string, uniqueId: string, now: Date = new Date()): string {
    const safeId = uniqueId.replace(/[^A-Za-z0-9_-]/g, '')
    return `orders/${organizationId}/${now.getTime()}-${safeId}.webp`
}
