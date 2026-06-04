import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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

    let totalEspeces = 0
    let totalOrangeMoney = 0
    let totalWave = 0
    let totalMtnMomo = 0
    let totalMoovMoney = 0
    let totalAcomptes = 0
    let totalSoldes = 0
    let totalVentesDirectes = 0
    let totalPending = 0

    // Les finances sont calculées à partir des transactions (Acomptes, Soldes, Ventes Directes)
    for (const tx of transactions) {
        const amount = Number(tx.amount) || 0

        // Ventilation par type de transaction
        if (tx.label_type === 'ACOMPTE') totalAcomptes += amount
        else if (tx.label_type === 'SOLDE') totalSoldes += amount
        else if (tx.label_type === 'VENTE_DIRECTE') totalVentesDirectes += amount

        // Ventilation par méthode de paiement
        if (tx.payment_details && Object.keys(tx.payment_details).length > 0) {
            // Paiement mixte : les parts sont dans payment_details (clés = valeurs enum)
            totalEspeces += tx.payment_details['Espèces'] || tx.payment_details['especes'] || 0
            totalOrangeMoney += tx.payment_details['Orange Money'] || tx.payment_details['mobile_money'] || 0
            totalWave += tx.payment_details['Wave'] || 0
            totalMtnMomo += tx.payment_details['MTN MOMO'] || 0
            totalMoovMoney += tx.payment_details['Moov Money'] || 0
        } else {
            // Paiement simple : utiliser payment_method directement
            const method = tx.payment_method
            if (method === 'Espèces') totalEspeces += amount
            else if (method === 'Orange Money') totalOrangeMoney += amount
            else if (method === 'Wave') totalWave += amount
            else if (method === 'MTN MOMO') totalMtnMomo += amount
            else if (method === 'Moov Money') totalMoovMoney += amount
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

    const totalMobileMoney = totalOrangeMoney + totalWave + totalMtnMomo + totalMoovMoney
    const totalCash = totalEspeces
    const totalRevenue = totalCash + totalMobileMoney
    const currency = org?.currency_symbol ?? ''

    // 3. VÉRIFICATION DES STOCKS BAS — filtre côté serveur pour comparer deux colonnes
    const { data: allIngredients } = await supabaseAdmin
        .from('ingredients')
        .select('name, current_stock, alert_threshold, unit')
        .eq('organization_id', orgId)

    const alertItems = (allIngredients ?? []).filter(i => i.current_stock <= i.alert_threshold)

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
    const today = new Date()
    const dateStr = format(today, 'EEEE d MMMM yyyy', { locale: fr })

    const alertHtml = alertItems.length > 0
        ? `<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:16px;border-radius:8px;">
            <h3 style="margin:0 0 12px;color:#856404;font-size:15px;">⚠️ Alertes Stock (${alertItems.length})</h3>
            <ul style="margin:0;padding-left:20px;color:#856404;">
                ${alertItems.map(i => `<li>${i.name}: <strong>${i.current_stock} ${i.unit}</strong> (seuil: ${i.alert_threshold})</li>`).join('')}
            </ul>
           </div>`
        : `<div style="background:#d4edda;border-left:4px solid #28a745;padding:16px;border-radius:8px;">
            <p style="margin:0;color:#155724;">✅ Tous les stocks sont au-dessus des seuils d'alerte.</p>
           </div>`

    const paymentCardStyle = (bg: string, color: string) =>
        `background:${bg};border-radius:10px;padding:16px;text-align:center;`
    const labelStyle = (color: string) =>
        `margin:0;font-size:11px;font-weight:700;letter-spacing:1px;color:${color};`
    const amountStyle = (color: string) =>
        `margin:4px 0 0;font-size:22px;font-weight:800;color:${color};`

    const html = `
<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:620px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- EN-TÊTE -->
  <div style="background:linear-gradient(135deg,#C4836A 0%,#C78A4A 100%);padding:32px 40px;">
    <h1 style="margin:0;color:white;font-size:26px;font-weight:800;">🎂 Rapport de Journée</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.88);font-size:15px;">${org?.name ?? 'Votre Pâtisserie'} — ${dateStr}</p>
  </div>

  <div style="padding:36px 40px;">

    <!-- TOTAL JOURNÉE -->
    <div style="background:#FDF8F3;border:2px solid #C4836A;border-radius:14px;padding:24px;text-align:center;margin-bottom:28px;">
      <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:1px;color:#9C8070;">TOTAL ENCAISSÉ AUJOURD'HUI</p>
      <p style="margin:6px 0 0;font-size:42px;font-weight:800;color:#C4836A;">${totalRevenue.toLocaleString('fr-FR')} ${currency}</p>
    </div>

    <!-- VENTILATION PAR OPÉRATEUR -->
    <h2 style="margin:0 0 16px;font-size:17px;color:#2D1B0E;">💳 Détail par mode de paiement</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px;">
      <tr>
        <td width="50%" style="${paymentCardStyle('#e6f4ea', '#137333')}">
          <p style="${labelStyle('#137333')}">ESPÈCES</p>
          <p style="${amountStyle('#137333')}">${totalEspeces.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td width="50%" style="${paymentCardStyle('#fff4e5', '#e65100')}">
          <p style="${labelStyle('#e65100')}">ORANGE MONEY</p>
          <p style="${amountStyle('#e65100')}">${totalOrangeMoney.toLocaleString('fr-FR')} ${currency}</p>
        </td>
      </tr>
      <tr>
        <td width="50%" style="${paymentCardStyle('#e3f2fd', '#0d47a1')}">
          <p style="${labelStyle('#0d47a1')}">WAVE</p>
          <p style="${amountStyle('#0d47a1')}">${totalWave.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td width="50%" style="${paymentCardStyle('#fce4ec', '#880e4f')}">
          <p style="${labelStyle('#880e4f')}">MTN MOMO</p>
          <p style="${amountStyle('#880e4f')}">${totalMtnMomo.toLocaleString('fr-FR')} ${currency}</p>
        </td>
      </tr>
      <tr>
        <td width="50%" style="${paymentCardStyle('#e8eaf6', '#283593')}">
          <p style="${labelStyle('#283593')}">MOOV MONEY</p>
          <p style="${amountStyle('#283593')}">${totalMoovMoney.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td width="50%"></td>
      </tr>
    </table>

    <!-- SOUS-TOTAL MOBILE -->
    <div style="background:#f5f0ff;border-radius:10px;padding:14px 20px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:13px;color:#4a0072;font-weight:600;">📱 Sous-total Mobile Money</span>
      <span style="font-size:18px;font-weight:800;color:#4a0072;">${totalMobileMoney.toLocaleString('fr-FR')} ${currency}</span>
    </div>

    <!-- VENTILATION PAR TYPE DE TRANSACTION -->
    <h2 style="margin:28px 0 16px;font-size:17px;color:#2D1B0E;">📋 Nature des encaissements</h2>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:10px 14px;background:#FFF8E1;border-radius:8px;text-align:center;margin:4px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#F57F17;">ACOMPTES</p>
          <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#F57F17;">${totalAcomptes.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:10px 14px;background:#E8F5E9;border-radius:8px;text-align:center;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#2E7D32;">SOLDES</p>
          <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#2E7D32;">${totalSoldes.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:10px 14px;background:#E3F2FD;border-radius:8px;text-align:center;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#1565C0;">VENTES DIRECTES</p>
          <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#1565C0;">${totalVentesDirectes.toLocaleString('fr-FR')} ${currency}</p>
        </td>
      </tr>
    </table>

    <!-- RESTE À ENCAISSER -->
    ${totalPending > 0 ? `
    <div style="background:#fff3cd;border-left:4px solid #ffc107;border-radius:8px;padding:14px 20px;margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:13px;color:#856404;font-weight:600;">⏳ Reste à encaisser (soldes dus)</span>
      <span style="font-size:18px;font-weight:800;color:#856404;">${totalPending.toLocaleString('fr-FR')} ${currency}</span>
    </div>` : `
    <div style="background:#d4edda;border-left:4px solid #28a745;border-radius:8px;padding:14px 20px;margin-top:16px;">
      <p style="margin:0;color:#155724;font-size:13px;font-weight:600;">✅ Aucun solde en attente — toutes les commandes sont soldées.</p>
    </div>`}

    <!-- COMMANDES -->
    <div style="margin-top:28px;padding-top:24px;border-top:1px solid #f0e8e0;">
      <h2 style="margin:0 0 16px;font-size:17px;color:#2D1B0E;">📦 Commandes de la session</h2>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;padding:12px;background:#f9f9f9;border-radius:8px;">
            <p style="margin:0;font-size:11px;color:#666;font-weight:700;">TOTAL</p>
            <p style="margin:4px 0 0;font-size:24px;font-weight:800;color:#333;">${totalOrders}</p>
          </td>
          <td style="width:8px;"></td>
          <td style="text-align:center;padding:12px;background:#e8f5e9;border-radius:8px;">
            <p style="margin:0;font-size:11px;color:#2E7D32;font-weight:700;">LIVRÉES</p>
            <p style="margin:4px 0 0;font-size:24px;font-weight:800;color:#2E7D32;">${completedOrders}</p>
          </td>
          <td style="width:8px;"></td>
          <td style="text-align:center;padding:12px;background:#fff3e0;border-radius:8px;">
            <p style="margin:0;font-size:11px;color:#E65100;font-weight:700;">EN ATTENTE</p>
            <p style="margin:4px 0 0;font-size:24px;font-weight:800;color:#E65100;">${totalOrders - completedOrders}</p>
          </td>
        </tr>
      </table>
    </div>

    <!-- STOCKS -->
    <div style="margin-top:28px;padding-top:24px;border-top:1px solid #f0e8e0;">
      <h2 style="margin:0 0 16px;font-size:17px;color:#2D1B0E;">🏪 État des Stocks</h2>
      ${alertHtml}
    </div>

  </div>

  <!-- PIED DE PAGE -->
  <div style="background:#f9f4f0;padding:20px 40px;text-align:center;border-top:1px solid #f0e8e0;">
    <p style="margin:0;color:#9C8070;font-size:13px;">Rapport généré automatiquement par <strong>Pâtiss'App</strong> 🥐</p>
  </div>

</div>
</body>
</html>`

    const emailRes = resend ? await resend.emails.send({
        from: "Pâtiss'App <onboarding@resend.dev>",
        to: [reportRecipient],
        subject: `📊 [Rapport de Caisse] - ${org?.name ?? 'Votre Pâtisserie'} - ${dateStr}`,
        html
    }) : { error: null }
    const emailError = emailRes.error;

    return { 
        sessionId, 
        success: true, 
        emailSent: !emailError, 
        error: emailError?.message,
        to: reportRecipient 
    }
}
