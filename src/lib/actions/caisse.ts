'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type EncaisserPayload = {
    id?: string
    order_id: string | null
    customer_id?: string | null
    client_name: string
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

        const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .insert({
                id: payload.id, // Utilisé si fourni (Offline UUID)
                organization_id: orgId,
                order_id: payload.order_id,
                customer_id: payload.customer_id || null,
                client_name: payload.client_name,
                amount: payload.amount,
                payment_method: finalPaymentMethod,
                payment_details: payload.payment_details || {},
                label_type: labelType,
                created_by: user.id
            })
            .select('id')
            .single()

        if (txError) {
            console.error("Erreur insertion transaction:", txError)
            return { error: "Erreur lors de l'encaissement" }
        }

        const itemsToInsert = payload.items.map(item => ({
            id: item.id, // Utilisé si fourni
            transaction_id: transaction.id,
            product_id: item.product_id,
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unit_price
        }))

        const { error: itemsError } = await supabase
            .from('transaction_items')
            .insert(itemsToInsert as any)

        if (itemsError) {
            console.error("Erreur insertion transaction_items:", itemsError)
            return { error: "Erreur lors du détail de l'encaissement" }
        }

        // 3. Mettre à jour la commande si elle existe
        if (payload.order_id) {
            const { error: orderError } = await supabase
                .from('orders')
                .update({ status: 'completed', payment_status: 'SOLDEE', balance: 0 })
                .eq('id', payload.order_id)

            if (orderError) console.error("Erreur mise à jour commande:", orderError)
        }

        // 4. Créditer les points de fidélité (1 point par 1000 FCFA)
        if (payload.customer_id && payload.amount > 0) {
            const pointsToAdd = Math.floor(payload.amount / 1000)
            if (pointsToAdd > 0) {
                const { data: cust } = await supabase.from('customers').select('loyalty_points, lifetime_points').eq('id', payload.customer_id).single()
                if (cust) {
                    await supabase.from('customers').update({
                        loyalty_points: (cust.loyalty_points || 0) + pointsToAdd,
                        lifetime_points: (cust.lifetime_points || 0) + pointsToAdd,
                    }).eq('id', payload.customer_id)
                }
            }
        }

        // 5. Décrémenter les stocks des produits
        for (const item of payload.items) {
            if (item.product_id) {
                // Utilisation de la fonction RPC créée pour le nouveau catalogue
                const { error: stockError } = await supabase.rpc('decrement_product_stock' as any, {
                    p_product_id: item.product_id,
                    p_qty: item.quantity
                })
                
                if (stockError) console.error("Erreur décrémentation stock:", stockError)
            }
        }

        revalidatePath('/caisse')
        revalidatePath('/dashboard')
        revalidatePath('/catalogue')

        return { success: true }
    } catch (e: any) {
        console.error("Erreur inattendue :", e)
        return { error: "Erreur inattendue" }
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
    } catch (e: any) {
        console.error("Erreur inattendue :", e)
        return { error: "Erreur inattendue" }
    }
}
