'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { closeSingleSession } from './session-utils'

export async function getOpenSession(orgId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('sales_sessions')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'open')
        .maybeSingle()

    if (error) {
        console.error("Error fetching open session:", error)
        return null
    }
    return data
}

export async function toggleSession(orgId: string, userId: string, currentlyOpenSessionId?: string | null) {
    const supabase = await createClient()

    if (currentlyOpenSessionId) {
        // Clôture DIRECTE et FIABLE sans passer par un appel HTTP interne instable
        const result = await closeSingleSession(currentlyOpenSessionId, userId)
        
        if (!result.success) {
            return { success: false, error: result.error || 'Erreur lors de la clôture' }
        }
    } else {
        // Open new session
        const { error } = await supabase
            .from('sales_sessions')
            .insert({
                organization_id: orgId,
                status: 'open',
                opened_by: userId
            })

        if (error) return { success: false, error: error.message }
    }

    revalidatePath('/', 'layout')
    return { success: true }
}
