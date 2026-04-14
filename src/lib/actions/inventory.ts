'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ensureActiveSubscription } from '@/lib/utils/subscription'

export async function createInventoryLog(formData: {
    ingredient_id: string
    quantity_change: number
    reason: 'production' | 'waste' | 'purchase' | 'adjustment'
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

    const { error } = await supabase.from('inventory_logs').insert({
        organization_id: profile.organization_id,
        ingredient_id: formData.ingredient_id,
        quantity_change: formData.quantity_change,
        reason: formData.reason,
        created_by: user.id,
    })

    if (error) return { error: error.message }

    revalidatePath('/inventaire')
    revalidatePath('/ingredients')
    revalidatePath('/dashboard')
    return { success: true }
}

export async function createIngredient(formData: {
    name: string
    unit: string
    cost_per_unit: number
    alert_threshold: number
    current_stock?: number
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

    const { data, error } = await supabase.from('ingredients').insert({
        organization_id: profile.organization_id,
        name: formData.name,
        unit: formData.unit,
        cost_per_unit: formData.cost_per_unit,
        alert_threshold: formData.alert_threshold,
        current_stock: formData.current_stock ?? 0,
    }).select().single()

    if (error) return { error: error.message }

    revalidatePath('/ingredients')
    return { data }
}

export async function updateIngredient(id: string, formData: {
    name: string
    unit: string
    cost_per_unit: number
    alert_threshold: number
}) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('ingredients').update({
        name: formData.name,
        unit: formData.unit,
        cost_per_unit: formData.cost_per_unit,
        alert_threshold: formData.alert_threshold,
    }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/ingredients')
    return { success: true }
}

export async function toggleIngredientStatus(id: string, is_active: boolean) {
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('ingredients').update({
        is_active: is_active
    }).eq('id', id)

    if (error) return { error: error.message }
    
    revalidatePath('/ingredients')
    revalidatePath('/inventaire')
    return { success: true }
}

export async function deleteIngredient(id: string) {
    // Gardé pour compatibilité mais non utilisé dans l'UI au profit de toggleIngredientStatus
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('ingredients').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/ingredients')
    return { success: true }
}
