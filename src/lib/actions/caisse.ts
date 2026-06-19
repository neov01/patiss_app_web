'use server'

import { AuthContextError, requireOpenSalesSession, requireRoleContext } from '@/lib/auth/organization-context'
import { addLoyaltyPoints, calculateLoyaltyPoints } from '@/lib/domain/loyalty'
import { getFinalPaymentMethod, type PaymentDetails } from '@/lib/domain/payments'
import { getPhoneSearchCandidates, normalizeCustomerPhone } from '@/lib/domain/phone'
import { revalidatePath } from 'next/cache'

type EncaisserAtomicArgs = {
    p_transaction_id: string
    p_organization_id: string
    p_order_id: string | null
    p_customer_id: string | null
    p_client_name: string
    p_amount: number
    p_payment_method: string
    p_payment_details: PaymentDetails
    p_label_type: string
    p_created_by: string
    p_items: Array<{
        item_id: string | null
        product_id: string | null
        name: string
        quantity: number
        unit_price: number
    }>
}

type EncaisserRpcClient = {
    rpc(
        fn: 'encaisser_atomic',
        args: EncaisserAtomicArgs
    ): Promise<{ data: string | null; error: { message?: string } | null }>
}

type EncaisserPayload = {
    id?: string
    order_id: string | null
    customer_id?: string | null
    client_name: string
    client_phone?: string
    amount: number
    payment_method: string
    payment_details?: PaymentDetails
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
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])
        await requireOpenSalesSession(context)
        const { supabase, userId, organizationId: orgId } = context

        const labelType = payload.order_id ? 'SOLDE' : 'VENTE_DIRECTE'
        const finalPaymentMethod = getFinalPaymentMethod(payload.payment_method, payload.payment_details)
        const transactionId = payload.id ?? crypto.randomUUID()

        // Auto-enregistrement client : si pas de customer_id mais qu'un téléphone est fourni,
        // on cherche ou crée le client silencieusement pour alimenter le CRM & la fidélité.
        let resolvedCustomerId = payload.customer_id || null
        const clientPhone = normalizeCustomerPhone(payload.client_phone)

        if (!resolvedCustomerId && clientPhone && payload.client_name !== 'Vente vitrine') {
            const phoneCandidates = getPhoneSearchCandidates(payload.client_phone)

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
                        phone: clientPhone,
                        organization_id: orgId,
                    })
                    .select('id')
                    .single()
                resolvedCustomerId = newCustomer?.id ?? null
            }
        }

        // Encaissement atomique : transaction + items + stock en une seule opération PostgreSQL
        const { error: atomicError } = await (supabase as unknown as EncaisserRpcClient).rpc('encaisser_atomic', {
            p_transaction_id: transactionId,
            p_organization_id: orgId,
            p_order_id: payload.order_id,
            p_customer_id: resolvedCustomerId,
            p_client_name: payload.client_name,
            p_amount: payload.amount,
            p_payment_method: finalPaymentMethod,
            p_payment_details: payload.payment_details || {},
            p_label_type: labelType,
            p_created_by: userId,
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
            const isDuplicate = atomicError.message?.includes('duplicate key') || 
                                (atomicError as { code?: string }).code === '23505'
            if (isDuplicate) {
                // Déjà traité en base, on considère cela comme un succès
                return { success: true }
            }
            const isStockError = atomicError.message?.includes('Stock insuffisant')
            return { error: isStockError ? atomicError.message : "Erreur lors de l'encaissement" }
        }

        // 4. Créditer les points de fidélité (1 point par 1000 FCFA)
        // Exécuté après l'encaissement car non critique pour l'atomicité
        if (resolvedCustomerId && payload.amount > 0) {
            const pointsToAdd = calculateLoyaltyPoints(payload.amount)
            if (pointsToAdd > 0) {
                const { data: cust } = await supabase
                    .from('customers')
                    .select('loyalty_points, lifetime_points')
                    .eq('id', resolvedCustomerId)
                    .eq('organization_id', orgId)
                    .single()
                if (cust) {
                    await supabase.from('customers').update({
                        loyalty_points: addLoyaltyPoints(cust.loyalty_points, pointsToAdd),
                        lifetime_points: addLoyaltyPoints(cust.lifetime_points, pointsToAdd),
                    })
                        .eq('id', resolvedCustomerId)
                        .eq('organization_id', orgId)
                }
            }
        }

        revalidatePath('/caisse')
        revalidatePath('/dashboard')
        revalidatePath('/catalogue')

        return { success: true }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
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
        const context = await requireRoleContext(['gerant', 'super_admin'])
        await requireOpenSalesSession(context)
        const { supabase, userId, organizationId } = context

        // Vérifier que la transaction originale appartient à l'organisation
        const { data: originalTx } = await supabase
            .from('transactions')
            .select('id, amount, organization_id, client_name, customer_id')
            .eq('id', payload.originalTransactionId)
            .eq('organization_id', organizationId)
            .single()

        if (!originalTx) return { error: "Transaction originale introuvable ou hors organisation" }
        if (payload.amount > originalTx.amount) {
            return { error: `Le montant du remboursement (${payload.amount}) ne peut pas dépasser la transaction originale (${originalTx.amount})` }
        }

        // Insérer la transaction de remboursement (montant négatif)
        const { error: refundError } = await supabase
            .from('transactions')
            .insert({
                organization_id: organizationId,
                order_id: null,
                customer_id: originalTx.customer_id,
                client_name: originalTx.client_name,
                amount: -Math.abs(payload.amount),
                payment_method: payload.paymentMethod,
                payment_details: { [payload.paymentMethod]: payload.amount },
                label_type: 'REMBOURSEMENT',
                created_by: userId,
            })

        if (refundError) {
            console.error("Erreur remboursement:", refundError)
            return { error: "Erreur lors du remboursement" }
        }

        revalidatePath('/caisse')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        const msg = e instanceof Error ? e.message : 'Erreur inattendue'
        console.error("Erreur remboursement:", msg)
        return { error: msg }
    }
}

export async function finaliserCommandeDejaPayee(orderId: string) {
    try {
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])
        await requireOpenSalesSession(context)
        const { supabase, organizationId } = context

        const { error } = await supabase
            .from('orders')
            .update({ status: 'completed' })
            .eq('id', orderId)
            .eq('organization_id', organizationId)

        if (error) {
            console.error("Erreur finalisation commande:", error)
            return { error: "Erreur lors de la finalisation" }
        }

        revalidatePath('/caisse')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        const msg = e instanceof Error ? e.message : 'Erreur inattendue'
        console.error("Erreur inattendue :", msg)
        return { error: "Erreur inattendue" }
    }
}
