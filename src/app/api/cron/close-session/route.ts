import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY!)

// This endpoint can be called:
// 1. By Vercel Cron at 21:00 (with CRON_SECRET header)
// 2. Manually from the "CLÔTURER LA JOURNÉE" button (with a session ID)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SessionResult = Record<string, any>

export async function POST(req: NextRequest): Promise<NextResponse> {
    const authHeader = req.headers.get('authorization')
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

    // Auth: must be cron job OR have a valid session cookie (handled by calling server action)
    // For cron calls, we require the secret. For manual closure, the session action handles it.
    if (!isCron) {
        // For non-cron calls, we allow the request but proceed only if a session_id is provided
        const body = await req.json().catch(() => ({}))
        if (!body.session_id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const result = await closeSingleSession(body.session_id, body.closed_by)
        return NextResponse.json(result)
    }

    // CRON path: find ALL open sessions across ALL organizations and close them
    const { data: openSessions, error } = await supabaseAdmin
        .from('sales_sessions')
        .select('*, organizations(name, currency_symbol)')
        .eq('status', 'open')

    if (error) {
        console.error('Cron: error fetching open sessions', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!openSessions || openSessions.length === 0) {
        return NextResponse.json({ message: 'No open sessions to close.' })
    }

    const results = await Promise.all(openSessions.map(s => closeSingleSession(s.id, null, s)))

    return NextResponse.json({
        message: `Closed ${results.length} session(s)`,
        details: results
    })
}

async function closeSingleSession(sessionId: string, closedBy: string | null, preloadedSession?: SessionResult): Promise<SessionResult> {
    // Fetch session + org details
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
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

    // --- CALCULATE METRICS ---
    // 1. Orders for today
    const { data: todayOrders } = await supabaseAdmin
        .from('orders')
        .select('total_amount, deposit_amount, payment_method, mobile_money_amount, status')
        .eq('organization_id', orgId)
        .gte('created_at', todayStart)

    const orders = todayOrders ?? []
    const totalOrders = orders.length
    const completedOrders = orders.filter(o => o.status === 'completed').length

    let totalCash = 0
    let totalMobileMoney = 0
    let totalPending = 0

    for (const order of orders) {
        const paid = order.deposit_amount ?? 0
        const remaining = (order.total_amount ?? 0) - paid
        const method = order.payment_method ?? 'en_attente'

        if (order.status === 'completed') {
            if (method === 'especes') totalCash += order.total_amount
            else if (method === 'mobile_money') totalMobileMoney += order.total_amount
            else if (method === 'mixte') {
                totalMobileMoney += order.mobile_money_amount ?? 0
                totalCash += order.total_amount - (order.mobile_money_amount ?? 0)
            }
        } else {
            // Not yet completed: count remaining deposit to receive
            totalPending += remaining
        }
    }

    const totalRevenue = totalCash + totalMobileMoney
    const currency = org?.currency_symbol ?? 'FCFA'

    // 2. Low stock items
    const { data: lowStockItems } = await supabaseAdmin
        .from('ingredients')
        .select('name, current_stock, alert_threshold, unit')
        .eq('organization_id', orgId)
        .filter('current_stock', 'lte', 'alert_threshold')

    const alertItems = lowStockItems ?? []

    // --- CLOSE THE SESSION ---
    await supabaseAdmin
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

    // --- FIND MANAGER'S EMAIL ---
    const { data: manager } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .eq('organization_id', orgId)
        .eq('role_slug', 'gerant')
        .eq('is_active', true)
        .limit(1)
        .single()

    // Get the email from auth.users
    let managerEmail: string | null = null
    if (manager) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(manager.id)
        managerEmail = authUser?.user?.email ?? null
    }

    if (!managerEmail) {
        return { sessionId, success: true, emailSent: false, reason: 'No manager email found' }
    }

    // --- DETERMINE RECIPIENT BASED ON ENVIRONMENT ---
    // In development: all reports go to the admin address regardless of which patisserie it is.
    // In production: reports go to the actual registered manager email.
    // The manager's email in the database is NEVER modified — this only controls where the report is sent.
    const isProduction = process.env.ENVIRONMENT === 'production'
    const reportRecipient = isProduction ? managerEmail : (process.env.REPORT_DEV_EMAIL ?? 'adouwilfried@gmail.com')

    // --- SEND THE REPORT EMAIL ---
    const dateStr = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

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
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#C4836A,#C78A4A);padding:32px 40px;">
        <h1 style="margin:0;color:white;font-size:24px;font-weight:800;">🎂 Rapport de Journée</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">${org?.name ?? 'Votre Pâtisserie'} — ${dateStr}</p>
    </div>

    <!-- Content -->
    <div style="padding:40px;">

        <!-- Revenue Grid -->
        <h2 style="margin:0 0 20px;font-size:18px;color:#2D1B0E;">💰 Résumé Financier</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div style="background:#e6f4ea;border-radius:12px;padding:20px;text-align:center;">
                <p style="margin:0;font-size:13px;color:#137333;font-weight:600;">ESPÈCES</p>
                <p style="margin:4px 0 0;font-size:28px;font-weight:800;color:#137333;">${totalCash.toLocaleString('fr-FR')} ${currency}</p>
            </div>
            <div style="background:#e8f0fe;border-radius:12px;padding:20px;text-align:center;">
                <p style="margin:0;font-size:13px;color:#1967d2;font-weight:600;">MOBILE MONEY</p>
                <p style="margin:4px 0 0;font-size:28px;font-weight:800;color:#1967d2;">${totalMobileMoney.toLocaleString('fr-FR')} ${currency}</p>
            </div>
        </div>

        <div style="background:#FDF8F3;border:2px solid #C4836A;border-radius:12px;padding:20px;margin-top:16px;text-align:center;">
            <p style="margin:0;font-size:14px;color:#9C8070;font-weight:600;">TOTAL JOURNÉE</p>
            <p style="margin:4px 0 0;font-size:36px;font-weight:800;color:#C4836A;">${totalRevenue.toLocaleString('fr-FR')} ${currency}</p>
        </div>

        ${totalPending > 0 ? `
        <div style="background:#fff3cd;border-radius:12px;padding:16px;margin-top:16px;text-align:center;">
            <p style="margin:0;font-size:13px;color:#856404;font-weight:600;">💳 MONTANT RESTANT À RECEVOIR</p>
            <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#856404;">${totalPending.toLocaleString('fr-FR')} ${currency}</p>
        </div>` : ''}

        <!-- Orders -->
        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #f0e8e0;">
            <h2 style="margin:0 0 16px;font-size:18px;color:#2D1B0E;">📦 Commandes</h2>
            <div style="display:flex;gap:16px;flex-wrap:wrap;">
                <div style="flex:1;min-width:120px;background:#f8f9fa;border-radius:12px;padding:16px;text-align:center;">
                    <p style="margin:0;font-size:13px;color:#666;font-weight:600;">TOTAL</p>
                    <p style="margin:4px 0 0;font-size:32px;font-weight:800;color:#2D1B0E;">${totalOrders}</p>
                </div>
                <div style="flex:1;min-width:120px;background:#e6f4ea;border-radius:12px;padding:16px;text-align:center;">
                    <p style="margin:0;font-size:13px;color:#137333;font-weight:600;">LIVRÉES</p>
                    <p style="margin:4px 0 0;font-size:32px;font-weight:800;color:#137333;">${completedOrders}</p>
                </div>
                <div style="flex:1;min-width:120px;background:#fff3cd;border-radius:12px;padding:16px;text-align:center;">
                    <p style="margin:0;font-size:13px;color:#856404;font-weight:600;">EN ATTENTE</p>
                    <p style="margin:4px 0 0;font-size:32px;font-weight:800;color:#856404;">${totalOrders - completedOrders}</p>
                </div>
            </div>
        </div>

        <!-- Stock Alerts -->
        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #f0e8e0;">
            <h2 style="margin:0 0 16px;font-size:18px;color:#2D1B0E;">🏪 État des Stocks</h2>
            ${alertHtml}
        </div>

    </div>

    <!-- Footer -->
    <div style="background:#f8f5f2;padding:24px 40px;text-align:center;border-top:1px solid #f0e8e0;">
        <p style="margin:0;font-size:13px;color:#9C8070;">Ce rapport a été généré automatiquement par <strong>Pâtiss'App</strong></p>
        <p style="margin:4px 0 0;font-size:12px;color:#C4A090;">Rapport du ${dateStr}</p>
    </div>
</div>
</body>
</html>`

    const { error: emailError } = await resend.emails.send({
        from: "Pat\u00efss'App <onboarding@resend.dev>",
        to: [reportRecipient],
        subject: `\uD83D\uDCCA [Rapport de Caisse] - ${org?.name ?? 'Votre P\u00e2tisserie'} - ${dateStr}`,
        html
    })

    if (emailError) {
        console.error('Email send error:', emailError)
        return { sessionId, success: true, emailSent: false, error: emailError.message }
    }

    return { sessionId, success: true, emailSent: true, to: reportRecipient, managerEmail }
}
