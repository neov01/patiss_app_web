'use server'

import { randomUUID } from 'crypto'
import { AuthContextError, requireRoleContext } from '@/lib/auth/organization-context'
import { ensureActiveSubscription } from '@/lib/utils/subscription'
import { buildOrderImagePath, validateOrderImage } from '@/lib/domain/order-image'

/**
 * Envoie l'image d'une commande dans le stockage, côté serveur.
 *
 * Pourquoi côté serveur : en mode kiosque le navigateur n'a pas de session
 * Supabase (seulement un cookie signé), donc un envoi direct partait en
 * anonyme et était refusé par la politique de stockage. Le serveur connaît
 * déjà le caissier (kiosque compris) et range l'image sous son organisation.
 */
export async function uploadOrderImage(formData: FormData): Promise<{ url: string } | { error: string }> {
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

        const path = buildOrderImagePath(context.organizationId, randomUUID())
        const { error: uploadError } = await context.supabase.storage
            .from('order-images')
            .upload(path, file, { contentType: file.type, upsert: false })

        if (uploadError) {
            console.error('Erreur envoi image de commande:', uploadError.message)
            return { error: "L'image n'a pas pu être enregistrée. Réessayez." }
        }

        const { data } = context.supabase.storage.from('order-images').getPublicUrl(path)
        return { url: data.publicUrl }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        console.error('Erreur envoi image de commande:', e instanceof Error ? e.message : 'inconnue')
        return { error: "L'image n'a pas pu être enregistrée. Réessayez." }
    }
}
