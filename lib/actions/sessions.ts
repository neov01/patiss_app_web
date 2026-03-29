'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
        // Close session via the API endpoint (which also computes metrics and sends the report email)
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
        const res = await fetch(`${baseUrl}/api/cron/close-session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.CRON_SECRET}`
            },
            body: JSON.stringify({ session_id: currentlyOpenSessionId, closed_by: userId })
        })

        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            return { success: false, error: data.error || 'Erreur lors de la clôture' }
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
