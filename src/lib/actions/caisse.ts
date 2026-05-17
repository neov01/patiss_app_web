'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type EncaisserPayload = {
    id?: string
    order_id: string | null
    customer_id?: string | null
    client_name: string
    client_phone?: string
    amount: number
    payment_method: string
    payment_details?: Record<string, number>
    items: Array<{
        id?: string
        product_id: string | null
        name: string
        quantity: number
        unit_price: number
    }>
}

export async function encaisserTransaction(payload: EncaisserPayload) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) return { error: "Non autorisé" }

        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .single()

        if (!profile?.organization_id) return { error: "Organisation non trouvée" }

        const orgId = profile.organization_id

        const labelType = payload.order_id ? 'SOLDE' : 'VENTE_DIRECTE'
        const isMixed = payload.payment_details && Object.keys(payload.payment_details).length > 1
        const finalPaymentMethod = isMixed ? 'MIXTE' : payload.payment_method
        const transactionId = payload.id ?? crypto.randomUUID()

        // Auto-enregistrement client : si pas de customer_id mais qu'un téléphone est fourni,
        // on cherche ou crée le client silencieusement pour alimenter le CRM & la fidélité.
        let resolvedCustomerId = payload.customer_id || null
        const clientPhone = payload.client_phone?.replace(/\D/g, '') || null

        if (!resolvedCustomerId && clientPhone && payload.client_name !== 'Vente vitrine') {
            // Normaliser le numéro pour la recherche (format Ivoirien +225 → local)
            let normalizedPhone = clientPhone
            if (clientPhone.startsWith('225') && clientPhone.length >= 11) {
                normalizedPhone = clientPhone.slice(3)
            }
            const phoneCandidates = Array.from(new Set([clientPhone, normalizedPhone]))

            const { data: existingCustomer } = await supabase
                .from('customers')
                .select('id')
                .eq('organization_id', orgId)
                .in('phone', phoneCandidates)
                .limit(1)
                .maybeSingle()

            if (existingCustomer) {
                resolvedCustomerId = existingCustomer.id
            } else {
                const { data: newCustomer } = await supabase
                    .from('customers')
                    .insert({
                        name: payload.client_name,
                        phone: normalizedPhone || clientPhone,
                        organization_id: orgId,
                    })
                    .select('id')
                    .single()
                resolvedCustomerId = newCustomer?.id ?? null
            }
        }

        // Encaissement atomique : transaction + items + stock en une seule opération PostgreSQL
        const { data: transactionIdResult, error: atomicError } = await supabase.rpc('encaisser_atomic' as any, {
            p_transaction_id: transactionId,
            p_organization_id: orgId,
            p_order_id: payload.order_id,
            p_customer_id: resolvedCustomerId,
            p_client_name: payload.client_name,
            p_amount: payload.amount,
            p_payment_method: finalPaymentMethod,
            p_payment_details: payload.payment_details || {},
            p_label_type: labelType,
            p_created_by: user.id,
            p_items: payload.items.map(item => ({
                item_id: item.id ?? null,
                product_id: item.product_id,
                name: item.name,
                quantity: item.quantity,
                unit_price: item.unit_price,
            }))
        })

        if (atomicError) {
            console.error("Erreur encaissement atomique:", atomicError)
            const isStockError = atomicError.message?.includes('Stock insuffisant')
            return { error: isStockError ? atomicError.message : "Erreur lors de l'encaissement" }
        }

        // 4. Créditer les points de fidélité (1 point par 1000 FCFA)
        // Exécuté après l'encaissement car non critique pour l'atomicité
        if (resolvedCustomerId && payload.amount > 0) {
            const pointsToAdd = Math.floor(payload.amount / 1000)
            if (pointsToAdd > 0) {
                const { data: cust } = await supabase
                    .from('customers')
                    .select('loyalty_points, lifetime_points')
                    .eq('id', resolvedCustomerId)
                    .single()
                if (cust) {
                    await supabase.from('customers').update({
                        loyalty_points: (cust.loyalty_points || 0) + pointsToAdd,
                        lifetime_points: (cust.lifetime_points || 0) + pointsToAdd,
                    }).eq('id', resolvedCustomerId)
                }
            }
        }

        revalidatePath('/caisse')
        revalidatePath('/dashboard')
        revalidatePath('/catalogue')

        return { success: true }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erreur inattendue'
        console.error("Erreur inattendue :", msg)
        return { error: "Erreur inattendue" }
    }
}

export async function rembourserTransaction(payload: {
    originalTransactionId: string
    amount: number
    reason: string
    paymentMethod: string
}) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: "Non autorisé" }

        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id, role_slug')
            .eq('id', user.id)
            .single()

        if (!profile?.organization_id) return { error: "Organisation non trouvée" }
        if (!['gerant', 'super_admin'].includes(profile.role_slug)) {
            return { error: "Seul un gérant peut effectuer un remboursement" }
        }

        // Vérifier que la transaction originale appartient à l'organisation
        const { data: originalTx } = await supabase
            .from('transactions')
            .select('id, amount, organization_id, client_name, customer_id')
            .eq('id', payload.originalTransactionId)
            .eq('organization_id', profile.organization_id)
            .single()

        if (!originalTx) return { error: "Transaction originale introuvable ou hors organisation" }
        if (payload.amount > originalTx.amount) {
            return { error: `Le montant du remboursement (${payload.amount}) ne peut pas dépasser la transaction originale (${originalTx.amount})` }
        }

        // Insérer la transaction de remboursement (montant négatif)
        const { error: refundError } = await supabase
            .from('transactions')
            .insert({
                organization_id: profile.organization_id,
                order_id: null,
                customer_id: originalTx.customer_id,
                client_name: originalTx.client_name,
                amount: -Math.abs(payload.amount),
                payment_method: payload.paymentMethod,
                payment_details: { [payload.paymentMethod]: payload.amount },
                label_type: 'REMBOURSEMENT',
                created_by: user.id,
            })

        if (refundError) {
            console.error("Erreur remboursement:", refundError)
            return { error: "Erreur lors du remboursement" }
        }

        revalidatePath('/caisse')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erreur inattendue'
        console.error("Erreur remboursement:", msg)
        return { error: msg }
    }
}

export async function finaliserCommandeDejaPayee(orderId: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { error: "Non autorisé" }

        const { error } = await supabase
            .from('orders')
            .update({ status: 'completed' })
            .eq('id', orderId)

        if (error) {
            console.error("Erreur finalisation commande:", error)
            return { error: "Erreur lors de la finalisation" }
        }

        revalidatePath('/caisse')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Erreur inattendue'
        console.error("Erreur inattendue :", msg)
        return { error: "Erreur inattendue" }
    }
}
