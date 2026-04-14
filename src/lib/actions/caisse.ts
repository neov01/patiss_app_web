'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type EncaisserPayload = {
    order_id: string | null
    client_name: string
    amount: number
    payment_method: string
    payment_details?: Record<string, number>
    items: Array<{
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

        // Mêmes vérifications pour l'utilisateur
        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .single()

        if (!profile?.organization_id) return { error: "Organisation non trouvée" }

        const orgId = profile.organization_id

        // 1. Transaction d'encaissement principale
        // Déterminer le label : SOLDE si lié à une commande, VENTE_DIRECTE sinon
        const labelType = payload.order_id ? 'SOLDE' : 'VENTE_DIRECTE'

        // Déterminer si c'est un paiement mixte
        const isMixed = payload.payment_details && Object.keys(payload.payment_details).length > 1
        const finalPaymentMethod = isMixed ? 'MIXTE' : payload.payment_method

        const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .insert({
                organization_id: orgId,
                order_id: payload.order_id,
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

        // 2. Insérer le détail (transaction_items)
        const itemsToInsert = payload.items.map(item => ({
            transaction_id: transaction.id,
            product_id: item.product_id,
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unit_price
        }))

        const { error: itemsError } = await supabase
            .from('transaction_items')
            .insert(itemsToInsert)

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

        // 4. Décrémenter les stocks des produits
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
