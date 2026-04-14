'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ensureActiveSubscription } from '@/lib/utils/subscription'
import { z } from 'zod'

import { orderSchema } from '@/lib/schemas/order.schema'

export async function createOrder(input: any) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    // 1. Validation Serveur (Zod)
    const result = orderSchema.safeParse(input)
    if (!result.success) {
        const errors = result.error.flatten().fieldErrors
        const firstErr = Object.values(errors).flat()[0]
        return { error: firstErr || 'Données de commande invalides' }
    }
    const formData = result.data

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Non authentifié' }

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    if (!profile?.organization_id) return { error: 'Organisation introuvable' }

    // 2. Calculs Sécurisés (Business Logic)
    const totalAmount = formData.total_amount
    const depositAmount = formData.deposit_amount
    const balance = Math.max(0, totalAmount - depositAmount)

    // Déterminer le statut de paiement initial
    const paymentStatus = depositAmount >= totalAmount
        ? 'SOLDEE'
        : depositAmount > 0
            ? 'PARTIEL'
            : 'EN_ATTENTE'

    const { data: order, error } = await supabase.from('orders').insert({
        organization_id: profile.organization_id,
        order_number: formData.order_number,
        customer_name: formData.customer_name,
        customer_contact: formData.customer_contact,
        pickup_date: formData.pickup_date,
        total_amount: totalAmount,
        deposit_amount: depositAmount,
        custom_image_url: formData.custom_image_url,
        priority: formData.priority,
        reception_type: formData.reception_type,
        delivery_address: formData.delivery_address,
        order_channel: formData.order_channel,
        subtotal: formData.subtotal,
        delivery_fee: formData.delivery_fee,
        balance: balance,
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
    if (depositAmount > 0) {
        const labelType = depositAmount >= totalAmount ? 'SOLDE' : 'ACOMPTE'
        await supabase.from('transactions').insert({
            organization_id: profile.organization_id,
            order_id: order.id,
            client_name: formData.customer_name,
            amount: depositAmount,
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

export async function createVitrineSale(input: any) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    // Validation rapide pour la vitrine
    const vitrineSchema = z.object({
        total_amount: z.number().min(0),
        items: z.array(z.object({
            product_id: z.string().uuid(),
            quantity: z.number().positive(),
            unit_price: z.number().min(0)
        })).min(1)
    })

    const result = vitrineSchema.safeParse(input)
    if (!result.success) return { error: 'Données de vente invalides' }
    const formData = result.data

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
        payment_status: 'SOLDEE'
    }).select().single()

    if (error) return { error: error.message }

    if (formData.items.length > 0) {
        await supabase.from('order_items').insert(
            formData.items.map((i: any) => ({ order_id: order.id, ...i }))
        )
        
        // Enregistrer la transaction associée
        await supabase.from('transactions').insert({
            organization_id: profile.organization_id,
            order_id: order.id,
            client_name: 'Client Vitrine',
            amount: formData.total_amount,
            payment_method: 'Espèces', // Par défaut
            label_type: 'SOLDE',
            created_by: user.id
        })
    }

    revalidatePath('/dashboard')
    revalidatePath('/commandes')
    return { success: true }
}
