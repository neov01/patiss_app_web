'use server'

import { revalidatePath } from 'next/cache'
import { closeSingleSession } from './session-utils'
import { AuthContextError, requireOrgRole } from '@/lib/auth/organization-context'

function getErrorMessage(err: unknown) {
    return err instanceof Error ? err.message : 'Erreur inconnue'
}

export async function getOpenSession() {
    const { supabase, organizationId } = await requireOrgRole(['gerant', 'super_admin', 'vendeur', 'patissier'])
    const { data, error } = await supabase
        .from('sales_sessions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'open')
        .maybeSingle()

    if (error) {
        console.error("Error fetching open session:", error)
        return null
    }
    return data
}

export async function openSession() {
    try {
        const { supabase, organizationId, userId } = await requireOrgRole(['gerant', 'super_admin', 'vendeur'])

        const { data: existing, error: existingError } = await supabase
            .from('sales_sessions')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('status', 'open')
            .maybeSingle()

        if (existingError) return { success: false, error: existingError.message }
        if (existing) return { success: true }

        const { error } = await supabase
            .from('sales_sessions')
            .insert({
                organization_id: organizationId,
                status: 'open',
                opened_by: userId
            })

        if (error) return { success: false, error: error.message }

        revalidatePath('/', 'layout')
        return { success: true }
    } catch (err: unknown) {
        return { success: false, error: getErrorMessage(err) }
    }
}

export async function closeCurrentSession() {
    try {
        const { supabase, organizationId, userId } = await requireOrgRole(['gerant', 'super_admin'])
        const { data: openSession, error } = await supabase
            .from('sales_sessions')
            .select('*, organizations(name, currency_symbol)')
            .eq('organization_id', organizationId)
            .eq('status', 'open')
            .maybeSingle()

        if (error) return { success: false, error: error.message }
        if (!openSession) return { success: false, error: 'Aucune session ouverte à clôturer' }

        const result = await closeSingleSession(openSession.id, userId, openSession, organizationId)
        if (!result.success) {
            return { success: false, error: result.error || 'Erreur lors de la clôture' }
        }

        const { data: closedSession } = await supabase
            .from('sales_sessions')
            .select('*')
            .eq('id', openSession.id)
            .single()

        revalidatePath('/', 'layout')
        return { success: true, session: closedSession }
    } catch (err: unknown) {
        const status = err instanceof AuthContextError ? err.status : 500
        return { success: false, error: status === 403 ? 'Seul un gérant peut clôturer la caisse' : getErrorMessage(err) }
    }
}
