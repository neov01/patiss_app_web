import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY!)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SessionResult = Record<string, any>

/**
 * Logique centrale de clôture d'une session de vente.
 * Calcule les métriques, met à jour la base de données et envoie le rapport par email.
 */
export async function closeSingleSession(
    sessionId: string, 
    closedBy: string | null, 
    preloadedSession?: SessionResult
): Promise<SessionResult> {
    
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

    const org = (session as SessionResult).organizations as SessionResult
    const orgId = (session as SessionResult).organization_id
    const sessionStart = (session as SessionResult).opened_at

    // 2. CALCUL DES MÉTRIQUES
    // Récupération des transactions depuis l'ouverture de la session
    const { data: periodTransactions } = await supabaseAdmin
        .from('transactions')
        .select('amount, payment_method, payment_details, label_type')
        .eq('organization_id', orgId)
        .gte('created_at', sessionStart)

    // Récupération des commandes depuis l'ouverture de la session
    const { data: periodOrders } = await supabaseAdmin
        .from('orders')
        .select('id, total_amount, deposit_amount, status')
        .eq('organization_id', orgId)
        .gte('created_at', sessionStart)

    const transactions = periodTransactions ?? []
    const orders = periodOrders ?? []
    
    const totalOrders = orders.length
    const completedOrders = orders.filter(o => o.status === 'completed' || o.status === 'delivered').length

    let totalCash = 0
    let totalMobileMoney = 0
    let totalPending = 0

    // Les finances sont calculées à partir des transactions (Acomptes, Soldes, Ventes Directes)
    for (const tx of transactions) {
        if (tx.payment_details && Object.keys(tx.payment_details).length > 0) {
            totalCash += (tx.payment_details.especes || 0)
            totalMobileMoney += (tx.payment_details.mobile_money || 0)
        } else {
            // Repli vers payment_method si payment_details est vide
            const method = tx.payment_method?.toLowerCase()
            if (method === 'especes' || method === 'espèces') {
                totalCash += Number(tx.amount) || 0
            } else if (method === 'mobile_money' || method === 'mobile money') {
                totalMobileMoney += Number(tx.amount) || 0
            }
        }
    }

    // Le total en attente se base sur les commandes non soldées
    for (const order of orders) {
        if (order.status !== 'completed' && order.status !== 'delivered' && order.status !== 'cancelled') {
            const paid = order.deposit_amount ?? 0
            const remaining = (order.total_amount ?? 0) - paid
            totalPending += remaining
        }
    }

    const totalRevenue = totalCash + totalMobileMoney
    const currency = org?.currency_symbol ?? ''

    // 3. VÉRIFICATION DES STOCKS BAS
    const { data: lowStockItems } = await supabaseAdmin
        .from('ingredients')
        .select('name, current_stock, alert_threshold, unit')
        .eq('organization_id', orgId)
        .filter('current_stock', 'lte', 'alert_threshold')

    const alertItems = lowStockItems ?? []

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
                totalRevenue, totalCash, totalMobileMoney, totalPending,
                totalOrders, completedOrders, alertItems,
                generatedAt: new Date().toISOString()
            }
        })
        .eq('id', sessionId)

    if (updateError) {
        console.error('Error closing session in DB:', updateError)
        return { sessionId, success: false, error: updateError.message }
    }

    // 5. ENVOI DU RAPPORT PAR EMAIL
    // On cherche l'email du gérant
    const { data: manager } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .eq('organization_id', orgId)
        .eq('role_slug', 'gerant')
        .eq('is_active', true)
        .limit(1)
        .single()

    let managerEmail: string | null = null
    if (manager) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(manager.id)
        managerEmail = authUser?.user?.email ?? null
    }

    if (!managerEmail) {
        return { sessionId, success: true, emailSent: false, reason: 'No manager email found' }
    }

    const isProduction = process.env.ENVIRONMENT === 'production'
    const reportRecipient = isProduction ? managerEmail : (process.env.REPORT_DEV_EMAIL ?? 'adouwilfried@gmail.com')
    const dateStr = format(today, 'EEEE d MMMM yyyy', { locale: fr })

    const alertHtml = alertItems.length > 0
        ? `<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:16px;border-radius:8px;margin-top:24px;">
            <h3 style="margin:0 0 12px;color:#856404;">⚠️ Alertes Stock</h3>
            <ul style="margin:0;padding-left:20px;color:#856404;">
                ${alertItems.map(i => `<li>${i.name}: <strong>${i.current_stock} ${i.unit}</strong> (seuil: ${i.alert_threshold})</li>`).join('')}
            </ul>
           </div>`
        : `<div style="background:#d4edda;border-left:4px solid #28a745;padding:16px;border-radius:8px;margin-top:24px;">
            <p style="margin:0;color:#155724;">✅ Tous les stocks sont au-dessus des seuils d'alerte.</p>
           </div>`

    const html = `
<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#FDF8F3;font-family:sans-serif;">
<div style="max-width:600px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#C4836A,#C78A4A);padding:32px 40px;">
        <h1 style="margin:0;color:white;font-size:24px;">🎂 Rapport de Journée</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);">${org?.name ?? 'Votre Pâtisserie'} — ${dateStr}</p>
    </div>
    <div style="padding:40px;">
        <h2 style="margin:0 0 20px;font-size:18px;color:#2D1B0E;">💰 Résumé Financier</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div style="background:#e6f4ea;border-radius:12px;padding:20px;text-align:center;">
                <p style="margin:0;font-size:13px;color:#137333;">ESPÈCES</p>
                <p style="margin:4px 0 0;font-size:28px;font-weight:800;color:#137333;">${totalCash.toLocaleString('fr-FR')} ${currency}</p>
            </div>
            <div style="background:#e8f0fe;border-radius:12px;padding:20px;text-align:center;">
                <p style="margin:0;font-size:13px;color:#1967d2;">MOBILE MONEY</p>
                <p style="margin:4px 0 0;font-size:28px;font-weight:800;color:#1967d2;">${totalMobileMoney.toLocaleString('fr-FR')} ${currency}</p>
            </div>
        </div>
        <div style="background:#FDF8F3;border:2px solid #C4836A;border-radius:12px;padding:20px;margin-top:16px;text-align:center;">
            <p style="margin:0;font-size:14px;color:#9C8070;">TOTAL JOURNÉE</p>
            <p style="margin:4px 0 0;font-size:36px;font-weight:800;color:#C4836A;">${totalRevenue.toLocaleString('fr-FR')} ${currency}</p>
        </div>
        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #f0e8e0;">
            <h2 style="margin:0 0 16px;font-size:18px;color:#2D1B0E;">📦 Commandes</h2>
            <p>Total: ${totalOrders} | Livrées: ${completedOrders} | En attente: ${totalOrders - completedOrders}</p>
        </div>
        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #f0e8e0;">
            <h2 style="margin:0 0 16px;font-size:18px;color:#2D1B0E;">🏪 État des Stocks</h2>
            ${alertHtml}
        </div>
    </div>
</div>
</body>
</html>`

    const { error: emailError } = await resend.emails.send({
        from: "Pâtiss'App <onboarding@resend.dev>",
        to: [reportRecipient],
        subject: `📊 [Rapport de Caisse] - ${org?.name ?? 'Votre Pâtisserie'} - ${dateStr}`,
        html
    })

    return { 
        sessionId, 
        success: true, 
        emailSent: !emailError, 
        error: emailError?.message,
        to: reportRecipient 
    }
}
