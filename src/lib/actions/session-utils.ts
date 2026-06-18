import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { calculateCaisseMetrics } from '@/lib/domain/caisse-metrics'

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

type ProfileSummary = {
    full_name?: string | null
    role_slug?: string | null
}

type SessionOrderSummary = {
    is_historical: boolean | null
    created_by: string | null
    profiles: ProfileSummary | ProfileSummary[] | null
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
        .eq('organization_id', orgId)
        .eq('status', 'open')
        .select('id')
        .single()

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

    // Récupération des informations d'ouverture/fermeture
    let openerName = "Non spécifié"
    let openerRole = ""
    let closerName = "Automatique"
    let closerRole = ""

    if (session.opened_by) {
        const { data: openerProfile } = await supabaseAdmin
            .from('profiles')
            .select('full_name, role_slug')
            .eq('id', session.opened_by)
            .single()
        if (openerProfile) {
            openerName = openerProfile.full_name
            openerRole = openerProfile.role_slug === 'gerant' ? 'Gérant' : openerProfile.role_slug === 'vendeur' ? 'Vendeur' : openerProfile.role_slug === 'patissier' ? 'Pâtissier' : openerProfile.role_slug
        }
    }

    if (closedBy) {
        const { data: closerProfile } = await supabaseAdmin
            .from('profiles')
            .select('full_name, role_slug')
            .eq('id', closedBy)
            .single()
        if (closerProfile) {
            closerName = closerProfile.full_name
            closerRole = closerProfile.role_slug === 'gerant' ? 'Gérant' : closerProfile.role_slug === 'vendeur' ? 'Vendeur' : closerProfile.role_slug === 'patissier' ? 'Pâtissier' : closerProfile.role_slug
        }
    }

    // Récupération des statistiques vendeurs pour la session courante
    const { data: sessionOrders } = await supabaseAdmin
        .from('orders')
        .select('is_historical, created_by, profiles!orders_created_by_fkey(full_name, role_slug)')
        .eq('organization_id', orgId)
        .gte('created_at', sessionStart)

    const vendorStats: Record<string, { name: string; role: string; newOrders: number; historicalOrders: number }> = {}

    if (sessionOrders) {
        for (const order of sessionOrders as SessionOrderSummary[]) {
            const creatorId = order.created_by || 'unknown'
            const profileInfo = getRelation(order.profiles)
            const creatorName = profileInfo?.full_name || 'Utilisateur inconnu'
            const creatorRoleSlug = profileInfo?.role_slug || ''
            const creatorRole = creatorRoleSlug === 'gerant' ? 'Gérant' : creatorRoleSlug === 'vendeur' ? 'Vendeur' : creatorRoleSlug === 'patissier' ? 'Pâtissier' : creatorRoleSlug

            if (!vendorStats[creatorId]) {
                vendorStats[creatorId] = {
                    name: creatorName,
                    role: creatorRole,
                    newOrders: 0,
                    historicalOrders: 0
                }
            }

            if (order.is_historical) {
                vendorStats[creatorId].historicalOrders++
            } else {
                vendorStats[creatorId].newOrders++
            }
        }
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

    const paymentCardStyle = (bg: string) =>
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

    <!-- SUIVI DE LA CAISSE (OUVERTURE / CLÔTURE) -->
    <div style="background:#FFFDFB;border:1px solid #F3E5DC;border-radius:12px;padding:16px;margin-bottom:28px;box-shadow:0 2px 8px rgba(196,131,106,0.05);color:#2D1B0E;">
      <h3 style="margin:0 0 12px;color:#2D1B0E;font-size:14px;font-weight:700;">🔑 Suivi de la caisse</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#5C3D2E;border-collapse:collapse;width:100%;">
        <tr>
          <td style="padding:6px 0;font-weight:600;width:30%;">Ouverte par :</td>
          <td style="padding:6px 0;width:35%;">${openerName} <span style="font-size:11px;color:#9C8070;">(${openerRole || 'Opérateur'})</span></td>
          <td style="padding:6px 0;text-align:right;color:#9C8070;width:35%;">Le ${format(new Date(sessionStart), 'dd/MM/yyyy à HH:mm', { locale: fr })}</td>
        </tr>
        <tr style="border-top:1px solid #F5ECE5;">
          <td style="padding:6px 0;padding-top:10px;font-weight:600;">Fermée par :</td>
          <td style="padding:6px 0;padding-top:10px;">${closerName} <span style="font-size:11px;color:#9C8070;">(${closerRole || 'Opérateur'})</span></td>
          <td style="padding:6px 0;padding-top:10px;text-align:right;color:#9C8070;">Le ${format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })}</td>
        </tr>
      </table>
    </div>

    <!-- TOTAL JOURNÉE -->
    <div style="background:#FDF8F3;border:2px solid #C4836A;border-radius:14px;padding:24px;text-align:center;margin-bottom:28px;">
      <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:1px;color:#9C8070;">TOTAL ENCAISSÉ AUJOURD'HUI</p>
      <p style="margin:6px 0 0;font-size:42px;font-weight:800;color:#C4836A;">${totalRevenue.toLocaleString('fr-FR')} ${currency}</p>
    </div>

    <!-- VENTILATION PAR OPÉRATEUR -->
    <h2 style="margin:0 0 16px;font-size:17px;color:#2D1B0E;">💳 Détail par mode de paiement</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px;">
      <tr>
        <td width="50%" style="${paymentCardStyle('#e6f4ea')}">
          <p style="${labelStyle('#137333')}">ESPÈCES</p>
          <p style="${amountStyle('#137333')}">${totalEspeces.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td width="50%" style="${paymentCardStyle('#fff4e5')}">
          <p style="${labelStyle('#e65100')}">ORANGE MONEY</p>
          <p style="${amountStyle('#e65100')}">${totalOrangeMoney.toLocaleString('fr-FR')} ${currency}</p>
        </td>
      </tr>
      <tr>
        <td width="50%" style="${paymentCardStyle('#e3f2fd')}">
          <p style="${labelStyle('#0d47a1')}">WAVE</p>
          <p style="${amountStyle('#0d47a1')}">${totalWave.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td width="50%" style="${paymentCardStyle('#fce4ec')}">
          <p style="${labelStyle('#880e4f')}">MTN MOMO</p>
          <p style="${amountStyle('#880e4f')}">${totalMtnMomo.toLocaleString('fr-FR')} ${currency}</p>
        </td>
      </tr>
      <tr>
        <td width="50%" style="${paymentCardStyle('#e8eaf6')}">
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

    <!-- ACTIVITÉ DE L'ÉQUIPE (STATISTIQUES PAR PROFIL) -->
    <div style="margin-top:28px;padding-top:24px;border-top:1px solid #f0e8e0;">
      <h2 style="margin:0 0 16px;font-size:17px;color:#2D1B0E;">👥 Activité de l'équipe (durant la session)</h2>
      ${Object.keys(vendorStats).length === 0 ? `
        <p style="margin:0;color:#9C8070;font-size:13px;font-style:italic;">Aucune commande n'a été enregistrée durant cette session.</p>
      ` : `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;color:#2D1B0E;width:100%;">
          <thead>
            <tr style="border-bottom:2px solid #E8B4A0;text-align:left;">
              <th style="padding:8px 4px;font-weight:700;">Collaborateur</th>
              <th style="padding:8px 4px;font-weight:700;text-align:center;">Nouv. Commandes</th>
              <th style="padding:8px 4px;font-weight:700;text-align:center;">Imports Hist.</th>
              <th style="padding:8px 4px;font-weight:700;text-align:right;">Total Saisi</th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(vendorStats).map((vs, idx) => `
              <tr style="border-bottom:1px solid #F0E8E0;background-color:${idx % 2 === 0 ? '#FFFDFB' : '#ffffff'};">
                <td style="padding:10px 4px;"><strong>${vs.name}</strong> <br/><span style="font-size:10px;color:#9C8070;">(${vs.role || 'Rôle non spécifié'})</span></td>
                <td style="padding:10px 4px;text-align:center;font-weight:600;">${vs.newOrders}</td>
                <td style="padding:10px 4px;text-align:center;color:#9C8070;">${vs.historicalOrders}</td>
                <td style="padding:10px 4px;text-align:right;font-weight:800;color:#C4836A;">${vs.newOrders + vs.historicalOrders}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
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
