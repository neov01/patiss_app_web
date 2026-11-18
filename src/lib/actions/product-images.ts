'use server'

import { randomUUID } from 'crypto'
import { AuthContextError, requireRoleContext } from '@/lib/auth/organization-context'
import { ensureActiveSubscription } from '@/lib/utils/subscription'
import { validateOrderImage } from '@/lib/domain/order-image'

/**
 * Envoie la photo d'un produit dans le stockage, côté serveur.
 *
 * Même raison que pour les images de commande : en mode kiosque le navigateur
 * n'a pas de session Supabase (seulement un cookie signé), donc un envoi direct
 * partait en anonyme et était refusé par la politique du bucket product-images.
 */
export async function uploadProductImage(formData: FormData): Promise<{ url: string } | { error: string }> {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])

        const file = formData.get('file')
        if (!(file instanceof File)) {
            return { error: "Aucune image reçue." }
        }

        const invalid = validateOrderImage({ type: file.type, size: file.size })
        if (invalid) {
            return { error: invalid }
        }

        const safeId = randomUUID().replace(/[^A-Za-z0-9_-]/g, '')
        const path = `products/${context.organizationId}/${Date.now()}-${safeId}.webp`
        const { error: uploadError } = await context.supabase.storage
            .from('product-images')
            .upload(path, file, { contentType: file.type, upsert: false })

        if (uploadError) {
            console.error('Erreur envoi photo produit:', uploadError.message)
            return { error: "La photo n'a pas pu être enregistrée." }
        }

        const { data } = context.supabase.storage.from('product-images').getPublicUrl(path)
        return { url: data.publicUrl }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        console.error('Erreur envoi photo produit:', e instanceof Error ? e.message : 'inconnue')
        return { error: "La photo n'a pas pu être enregistrée." }
    }
}
