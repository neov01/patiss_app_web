'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ensureActiveSubscription } from '@/lib/utils/subscription'

export async function createOrder(formData: {
    customer_name: string
    customer_contact?: string
    pickup_date: string
    deposit_amount: number
    total_amount: number
    custom_image_url?: string
    order_number: string
    priority: string
    reception_type: string
    delivery_address?: string
    order_channel?: string
    subtotal: number
    delivery_fee: number
    balance: number
    customization_notes?: string
    status: string
    deposit_payment_method?: string
    items: { product_id?: string; name: string; quantity: number; unit_price: number; subtotal?: number; from_inventory: boolean }[]
}) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Non authentifié' }

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    if (!profile?.organization_id) return { error: 'Organisation introuvable' }

    // Déterminer le statut de paiement initial
    const paymentStatus = formData.deposit_amount >= formData.total_amount
        ? 'SOLDEE'
        : formData.deposit_amount > 0
            ? 'PARTIEL'
            : 'EN_ATTENTE'

    const { data: order, error } = await supabase.from('orders').insert({
        organization_id: profile.organization_id,
        order_number: formData.order_number,
        customer_name: formData.customer_name,
        customer_contact: formData.customer_contact,
        pickup_date: formData.pickup_date,
        total_amount: formData.total_amount,
        deposit_amount: formData.deposit_amount,
        custom_image_url: formData.custom_image_url,
        priority: formData.priority,
        reception_type: formData.reception_type,
        delivery_address: formData.delivery_address,
        order_channel: formData.order_channel,
        subtotal: formData.subtotal,
        delivery_fee: formData.delivery_fee,
        balance: formData.balance,
        customization_notes: formData.customization_notes,
        created_by: user.id,
        status: formData.status || 'pending',
        payment_status: paymentStatus,
    }).select().single()

    if (error) return { error: error.message }

    if (formData.items && formData.items.length > 0) {
        await supabase.from('order_items').insert(
            formData.items.map(i => ({ 
                order_id: order.id, 
                product_id: i.product_id || null,
                name: i.name,
                quantity: i.quantity,
                unit_price: i.unit_price,
                from_inventory: i.from_inventory
             })) as any
        )
    }

    // Enregistrer l'acompte comme transaction avec label ACOMPTE
    if (formData.deposit_amount > 0) {
        const labelType = formData.deposit_amount >= formData.total_amount ? 'SOLDE' : 'ACOMPTE'
        await supabase.from('transactions').insert({
            organization_id: profile.organization_id,
            order_id: order.id,
            client_name: formData.customer_name,
            amount: formData.deposit_amount,
            payment_method: formData.deposit_payment_method || 'Espèces',
            label_type: labelType,
            created_by: user.id
        })
    }

    revalidatePath('/commandes')
    revalidatePath('/dashboard')
    return { data: order }
}

export async function updateOrderStatus(orderId: string, status: string) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
    if (error) return { error: error.message }
    revalidatePath('/commandes')
    return { success: true }
}

export async function deleteOrder(orderId: string) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('orders').delete().eq('id', orderId)
    if (error) return { error: error.message }
    revalidatePath('/commandes')
    return { success: true }
}

export async function createVitrineSale(formData: {
    total_amount: number
    items: { product_id: string; quantity: number; unit_price: number }[]
}) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Non authentifié' }

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    if (!profile?.organization_id) return { error: 'Organisation introuvable' }

    // Vente vitrine: Commande instantanée complétée
    const { data: order, error } = await supabase.from('orders').insert({
        organization_id: profile.organization_id,
        customer_name: 'Client Vitrine',
        pickup_date: new Date().toISOString(),
        total_amount: formData.total_amount,
        deposit_amount: formData.total_amount, 
        created_by: user.id,
        status: 'completed',
    }).select().single()

    if (error) return { error: error.message }

    if (formData.items.length > 0) {
        await supabase.from('order_items').insert(
            formData.items.map(i => ({ order_id: order.id, ...i }))
        )
    }

    revalidatePath('/dashboard')
    revalidatePath('/commandes')
    return { success: true }
}
