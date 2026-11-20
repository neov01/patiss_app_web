'use server'

import { revalidatePath } from 'next/cache'
import { closeSingleSession } from './session-utils'
import { calculateCaisseMetrics, type CaisseTransactionInput } from '@/lib/domain/caisse-metrics'
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
        const { supabase, organizationId, userId } = await requireOrgRole(['gerant', 'super_admin', 'vendeur'])
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
        return { success: false, error: status === 403 ? 'Seul un gérant ou un vendeur peut clôturer la caisse' : getErrorMessage(err) }
    }
}

export type SessionClosingPreview = {
    openedAt: string
    totalRevenue: number
    totalCash: number
    totalMobileMoney: number
    transactionCount: number
    totalPending: number
}

/**
 * Récapitulatif de la journée affiché avant la clôture. Lecture seule : mêmes
 * métriques que la clôture, mais calculées avec le client de l'utilisateur
 * (RLS) et sans aucune écriture.
 */
export async function getSessionClosingPreviewAction(): Promise<
    { success: true; preview: SessionClosingPreview } | { success: false; error: string }
> {
    try {
        const { supabase, organizationId } = await requireOrgRole(['gerant', 'super_admin', 'vendeur'])

        const { data: session, error } = await supabase
            .from('sales_sessions')
            .select('id, opened_at')
            .eq('organization_id', organizationId)
            .eq('status', 'open')
            .maybeSingle()
        if (error) return { success: false, error: error.message }
        if (!session?.opened_at) return { success: false, error: 'Aucune session ouverte' }

        // Mêmes périmètres que la clôture : pas d'imports historiques, rien de daté après « maintenant ».
        const closingWindowEnd = new Date().toISOString()

        const [{ data: transactions, error: txError }, { data: orders, error: orderError }] = await Promise.all([
            supabase
                .from('transactions')
                .select('amount, payment_method, payment_details, label_type')
                .eq('organization_id', organizationId)
                .is('deleted_at', null)
                .eq('is_historical', false)
                .gte('created_at', session.opened_at)
                .lte('created_at', closingWindowEnd),
            supabase
                .from('orders')
                .select('id, total_amount, deposit_amount, status')
                .eq('organization_id', organizationId)
                .is('deleted_at', null)
                .eq('is_historical', false)
                .gte('created_at', session.opened_at),
        ])
        if (txError || orderError) return { success: false, error: (txError || orderError)!.message }

        const metrics = calculateCaisseMetrics((transactions ?? []) as unknown as CaisseTransactionInput[], orders ?? [])
        return {
            success: true,
            preview: {
                openedAt: session.opened_at,
                totalRevenue: metrics.totalRevenue,
                totalCash: metrics.totalCash,
                totalMobileMoney: metrics.totalMobileMoney,
                transactionCount: (transactions ?? []).length,
                totalPending: metrics.totalPending,
            },
        }
    } catch (err: unknown) {
        return { success: false, error: getErrorMessage(err) }
    }
}
