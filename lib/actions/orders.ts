'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createOrder(formData: {
    customer_name: string
    customer_contact?: string
    pickup_date: string
    deposit_amount: number
    total_amount: number
    custom_image_url?: string
    items: { recipe_id: string; quantity: number; unit_price: number }[]
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Non authentifié' }

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    if (!profile?.organization_id) return { error: 'Organisation introuvable' }

    const { data: order, error } = await supabase.from('orders').insert({
        organization_id: profile.organization_id,
        customer_name: formData.customer_name,
        customer_contact: formData.customer_contact,
        pickup_date: formData.pickup_date,
        total_amount: formData.total_amount,
        deposit_amount: formData.deposit_amount,
        custom_image_url: formData.custom_image_url,
        created_by: user.id,
        status: 'pending',
    }).select().single()

    if (error) return { error: error.message }

    if (formData.items.length > 0) {
        await supabase.from('order_items').insert(
            formData.items.map(i => ({ order_id: order.id, ...i }))
        )
    }

    revalidatePath('/commandes')
    revalidatePath('/dashboard')
    return { data: order }
}

export async function updateOrderStatus(orderId: string, status: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
    if (error) return { error: error.message }
    revalidatePath('/commandes')
    return { success: true }
}

export async function deleteOrder(orderId: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('orders').delete().eq('id', orderId)
    if (error) return { error: error.message }
    revalidatePath('/commandes')
    return { success: true }
}
