import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { calculateCaisseMetrics } from '@/lib/domain/caisse-metrics'
import { REPORT_FROM } from '@/lib/reports/constants'
import { loadDailyReportData } from '@/lib/reports/daily-report-data'
import { dailySubject } from '@/lib/reports/emails/DailyReportEmail'
import { renderDailyReportEmail } from '@/lib/reports/emails/render'
import { resolveReportRecipient } from '@/lib/reports/report-recipient'

function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

type OrganizationSummary = {
    name?: string | null
    currency_symbol?: string | null
}

export type SessionResult = {
    sessionId?: string
    id?: string
    organization_id?: string | null
    opened_at?: string | null
    opened_by?: string | null
    organizations?: OrganizationSummary | OrganizationSummary[] | null
    success?: boolean
    error?: string
    emailSent?: boolean
    reason?: string
    to?: string
}

function getRelation<T>(relation: T | T[] | null | undefined): T | null {
    if (Array.isArray(relation)) return relation[0] ?? null
    return relation ?? null
}

/**
 * Logique centrale de clôture d'une session de vente.
 * Calcule les métriques, met à jour la base de données et envoie le rapport par email.
 */
export async function closeSingleSession(
    sessionId: string, 
    closedBy: string | null, 
    preloadedSession?: SessionResult,
    expectedOrgId?: string
): Promise<SessionResult> {
    const supabaseAdmin = createAdminClient()
    
    // 1. Récupération de la session et de l'organisation
    let session = preloadedSession
    if (!session) {
        const { data, error } = await supabaseAdmin
            .from('sales_sessions')
            .select('*, organizations(name, currency_symbol)')
            .eq('id', sessionId)
            .single()
        if (error || !data) return { sessionId, success: false, error: error?.message }
        session = data
    }
    if (!session) return { sessionId, success: false, error: 'Session not found' }

    const org = getRelation(session.organizations)
    const orgId = session.organization_id
    const sessionStart = session.opened_at

    if (!orgId || !sessionStart) {
        return { sessionId, success: false, error: 'Session invalide' }
    }

    if (expectedOrgId && orgId !== expectedOrgId) {
        return { sessionId, success: false, error: 'Session hors organisation' }
    }

    // 2. CALCUL DES MÉTRIQUES
    // Fin de la fenêtre de clôture : rien de daté après « maintenant » n'appartient à la session.
    const closingWindowEnd = new Date().toISOString()

    // Récupération des transactions depuis l'ouverture de la session.
    // Les imports historiques (commandes papier) ne sont pas passés par cette caisse.
    const { data: periodTransactions } = await supabaseAdmin
        .from('transactions')
        .select('amount, payment_method, payment_details, label_type')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .eq('is_historical', false)
        .gte('created_at', sessionStart)
        .lte('created_at', closingWindowEnd)

    // Récupération des commandes depuis l'ouverture de la session (hors imports historiques)
    const { data: periodOrders } = await supabaseAdmin
        .from('orders')
        .select('id, total_amount, deposit_amount, status')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .eq('is_historical', false)
        .gte('created_at', sessionStart)

    const transactions = periodTransactions ?? []
    const orders = periodOrders ?? []

    const metrics = calculateCaisseMetrics(transactions, orders)
    const {
        paymentBreakdown,
        totalCash,
        totalMobileMoney,
        totalRevenue,
        totalAcomptes,
        totalSoldes,
        totalVentesDirectes,
        totalPending,
        totalOrders,
        completedOrders,
    } = metrics
    const totalEspeces = paymentBreakdown['Espèces']
    const totalOrangeMoney = paymentBreakdown['Orange Money']
    const totalWave = paymentBreakdown.Wave
    const totalMtnMomo = paymentBreakdown['MTN MOMO']
    const totalMoovMoney = paymentBreakdown['Moov Money']
    const currency = org?.currency_symbol ?? ''

    // 3. VÉRIFICATION DES STOCKS BAS — filtre côté serveur pour comparer deux colonnes
    const { data: allIngredients } = await supabaseAdmin
        .from('ingredients')
        .select('name, current_stock, alert_threshold, unit')
        .eq('organization_id', orgId)

    const alertItems = (allIngredients ?? []).filter(i => i.current_stock <= i.alert_threshold)

    // 3b. RÉGIE DÉPENSES — dépenses saisies pendant la session et solde de l'enveloppe (lecture seule)
    const [{ data: dayExpenses }, { data: activeExpenseCycle }] = await Promise.all([
        supabaseAdmin
            .from('expenses')
            .select('amount')
            .eq('organization_id', orgId)
            .eq('is_cancelled', false)
            .gte('created_at', sessionStart),
        supabaseAdmin
            .from('expense_cycles')
            .select('id, current_balance')
            .eq('organization_id', orgId)
            .eq('status', 'active')
            .maybeSingle(),
    ])
    const expensesSummary = {
        totalDay: (dayExpenses ?? []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
        countDay: (dayExpenses ?? []).length,
        envelopeBalance: activeExpenseCycle ? Number(activeExpenseCycle.current_balance) || 0 : null,
        cycleId: activeExpenseCycle?.id ?? null,
    }

    // 4. CLÔTURE OFFICIELLE EN DB
    const { error: updateError } = await supabaseAdmin
        .from('sales_sessions')
        .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
            closed_by: closedBy,
            total_cash: totalCash,
            total_mobile_money: totalMobileMoney,
            total_orders: totalOrders,
            metrics_snapshot: {
                totalRevenue, totalCash, totalMobileMoney,
                totalEspeces, totalOrangeMoney, totalWave, totalMtnMomo, totalMoovMoney,
                totalAcomptes, totalSoldes, totalVentesDirectes,
                totalPending, totalOrders, completedOrders, alertItems,
                expenses: expensesSummary,
                generatedAt: new Date().toISOString()
            }
        })
        .eq('id', sessionId)
        .eq('organization_id', orgId)
        .eq('status', 'open')
        .select('id')
        .single()

    if (updateError) {
        console.error('Error closing session in DB:', updateError)
        return { sessionId, success: false, error: updateError.message }
    }

    // 5. ENVOI DU RAPPORT PAR EMAIL
    // La session est déjà clôturée : aucune erreur ci-dessous ne doit remonter.
    const recipient = await resolveReportRecipient(supabaseAdmin, orgId).catch(() => null)
    if (!recipient) {
        return { sessionId, success: true, emailSent: false, reason: 'No manager email found' }
    }
    if (!resend) {
        return { sessionId, success: true, emailSent: false, reason: 'Resend non configuré', to: recipient }
    }

    try {
        const report = await loadDailyReportData(supabaseAdmin, {
            orgId,
            orgName: org?.name ?? 'Votre pâtisserie',
            currency: currency || 'FCFA',
            openedAt: sessionStart,
            openedBy: session.opened_by ?? null,
            closedBy,
            now: new Date(),
            metrics,
            alertItems,
            expenses: { totalDay: expensesSummary.totalDay, countDay: expensesSummary.countDay },
        })
        const html = await renderDailyReportEmail(report)
        const { error: emailError } = await resend.emails.send({
            from: REPORT_FROM,
            to: [recipient],
            subject: dailySubject(report),
            html,
        })
        return {
            sessionId,
            success: true,
            emailSent: !emailError,
            error: emailError?.message,
            to: recipient,
        }
    } catch {
        console.error('[daily-report] rendu ou envoi du rapport impossible', { orgId })
        return { sessionId, success: true, emailSent: false, error: 'Rapport non envoyé', to: recipient }
    }
}
