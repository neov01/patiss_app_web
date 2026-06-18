import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(request: Request) {
    try {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
            return NextResponse.json({ error: 'Config missing' }, { status: 500 });
        }

        const authHeader = request.headers.get('Authorization');
        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Header optionnel pour forcer l'envoi vers une adresse de test
        const testEmail = request.headers.get('X-Test-Email') ?? null

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !supabaseKey) throw new Error('Supabase variables are missing')

        const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

        const { data: orgs, error: orgsErr } = await supabaseAdmin.from('organizations').select('*')
        if (orgsErr) throw orgsErr

        const { data: { users }, error: usersErr } = await supabaseAdmin.auth.admin.listUsers()
        if (usersErr) throw usersErr
        const userEmailMap = new Map(users.map(u => [u.id, u.email]))

        const { data: gerants, error: gerantsErr } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, organization_id')
            .eq('role_slug', 'gerant')
        if (gerantsErr) throw gerantsErr

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const dateStr = format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })

        for (const org of orgs || []) {
            const orgId = org.id
            const currency = org.currency_symbol || 'FCFA'

            const orgGerants = gerants?.filter(g => g.organization_id === orgId)
            if (!orgGerants || orgGerants.length === 0) continue

            // Transactions du jour
            const { data: periodTransactions } = await supabaseAdmin
                .from('transactions')
                .select('amount, payment_method, payment_details, label_type')
                .eq('organization_id', orgId)
                .gte('created_at', today.toISOString())
                .lt('created_at', tomorrow.toISOString())

            // Commandes du jour
            const { data: periodOrders } = await supabaseAdmin
                .from('orders')
                .select('id, total_amount, deposit_amount, status')
                .eq('organization_id', orgId)
                .gte('created_at', today.toISOString())
                .lt('created_at', tomorrow.toISOString())

            const transactions = periodTransactions ?? []
            const orders = periodOrders ?? []

            let totalEspeces = 0
            let totalOrangeMoney = 0
            let totalWave = 0
            let totalMtnMomo = 0
            let totalMoovMoney = 0
            let totalAcomptes = 0
            let totalSoldes = 0
            let totalVentesDirectes = 0
            let totalPending = 0

            for (const tx of transactions) {
                const amount = Number(tx.amount) || 0
                if (tx.label_type === 'ACOMPTE') totalAcomptes += amount
                else if (tx.label_type === 'SOLDE') totalSoldes += amount
                else if (tx.label_type === 'VENTE_DIRECTE') totalVentesDirectes += amount

                if (tx.payment_details && Object.keys(tx.payment_details).length > 0) {
                    totalEspeces += tx.payment_details['Espèces'] || tx.payment_details['especes'] || 0
                    totalOrangeMoney += tx.payment_details['Orange Money'] || tx.payment_details['mobile_money'] || 0
                    totalWave += tx.payment_details['Wave'] || 0
                    totalMtnMomo += tx.payment_details['MTN MOMO'] || 0
                    totalMoovMoney += tx.payment_details['Moov Money'] || 0
                } else {
                    const method = tx.payment_method
                    if (method === 'Espèces') totalEspeces += amount
                    else if (method === 'Orange Money') totalOrangeMoney += amount
                    else if (method === 'Wave') totalWave += amount
                    else if (method === 'MTN MOMO') totalMtnMomo += amount
                    else if (method === 'Moov Money') totalMoovMoney += amount
                }
            }

            for (const order of orders) {
                if (order.status !== 'completed' && order.status !== 'delivered' && order.status !== 'cancelled') {
                    totalPending += (order.total_amount ?? 0) - (order.deposit_amount ?? 0)
                }
            }

            const totalMobileMoney = totalOrangeMoney + totalWave + totalMtnMomo + totalMoovMoney
            const totalRevenue = totalEspeces + totalMobileMoney
            const totalOrders = orders.length
            const completedOrders = orders.filter(o => o.status === 'completed' || o.status === 'delivered').length

            // Stocks — filtre côté serveur
            const { data: allIngredients } = await supabaseAdmin
                .from('ingredients')
                .select('name, current_stock, alert_threshold, unit')
                .eq('organization_id', orgId)
            const criticalStock = (allIngredients ?? []).filter(i => i.current_stock <= i.alert_threshold)

            const alertHtml = criticalStock.length > 0
                ? `<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:16px;border-radius:8px;">
                    <h3 style="margin:0 0 10px;color:#856404;font-size:15px;">⚠️ Alertes Stock (${criticalStock.length})</h3>
                    <ul style="margin:0;padding-left:20px;color:#856404;">
                        ${criticalStock.map(i => `<li>${i.name}: <strong>${i.current_stock} ${i.unit}</strong> (seuil: ${i.alert_threshold})</li>`).join('')}
                    </ul>
                   </div>`
                : `<div style="background:#d4edda;border-left:4px solid #28a745;padding:16px;border-radius:8px;">
                    <p style="margin:0;color:#155724;">✅ Tous les stocks sont sains.</p>
                   </div>`

            const html = `
<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:620px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#C4836A 0%,#C78A4A 100%);padding:32px 40px;">
    <h1 style="margin:0;color:white;font-size:26px;font-weight:800;">🎂 Rapport de Journée</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,0.88);font-size:15px;">${org.name} — ${dateStr}</p>
  </div>
  <div style="padding:36px 40px;">

    <div style="background:#FDF8F3;border:2px solid #C4836A;border-radius:14px;padding:24px;text-align:center;margin-bottom:28px;">
      <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:1px;color:#9C8070;">TOTAL ENCAISSÉ AUJOURD'HUI</p>
      <p style="margin:6px 0 0;font-size:42px;font-weight:800;color:#C4836A;">${totalRevenue.toLocaleString('fr-FR')} ${currency}</p>
    </div>

    <h2 style="margin:0 0 16px;font-size:17px;color:#2D1B0E;">💳 Détail par mode de paiement</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px;">
      <tr>
        <td width="50%" style="background:#e6f4ea;border-radius:10px;padding:16px;text-align:center;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1px;color:#137333;">ESPÈCES</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#137333;">${totalEspeces.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td width="50%" style="background:#fff4e5;border-radius:10px;padding:16px;text-align:center;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1px;color:#e65100;">ORANGE MONEY</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#e65100;">${totalOrangeMoney.toLocaleString('fr-FR')} ${currency}</p>
        </td>
      </tr>
      <tr>
        <td width="50%" style="background:#e3f2fd;border-radius:10px;padding:16px;text-align:center;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1px;color:#0d47a1;">WAVE</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#0d47a1;">${totalWave.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td width="50%" style="background:#fce4ec;border-radius:10px;padding:16px;text-align:center;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1px;color:#880e4f;">MTN MOMO</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#880e4f;">${totalMtnMomo.toLocaleString('fr-FR')} ${currency}</p>
        </td>
      </tr>
      <tr>
        <td width="50%" style="background:#e8eaf6;border-radius:10px;padding:16px;text-align:center;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1px;color:#283593;">MOOV MONEY</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#283593;">${totalMoovMoney.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td width="50%"></td>
      </tr>
    </table>
    <div style="background:#f5f0ff;border-radius:10px;padding:14px 20px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:13px;color:#4a0072;font-weight:600;">📱 Sous-total Mobile Money</span>
      <span style="font-size:18px;font-weight:800;color:#4a0072;">${totalMobileMoney.toLocaleString('fr-FR')} ${currency}</span>
    </div>

    <h2 style="margin:28px 0 16px;font-size:17px;color:#2D1B0E;">📋 Nature des encaissements</h2>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="text-align:center;padding:12px;background:#FFF8E1;border-radius:8px;">
          <p style="margin:0;font-size:11px;color:#F57F17;font-weight:700;">ACOMPTES</p>
          <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#F57F17;">${totalAcomptes.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td style="width:8px;"></td>
        <td style="text-align:center;padding:12px;background:#E8F5E9;border-radius:8px;">
          <p style="margin:0;font-size:11px;color:#2E7D32;font-weight:700;">SOLDES</p>
          <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#2E7D32;">${totalSoldes.toLocaleString('fr-FR')} ${currency}</p>
        </td>
        <td style="width:8px;"></td>
        <td style="text-align:center;padding:12px;background:#E3F2FD;border-radius:8px;">
          <p style="margin:0;font-size:11px;color:#1565C0;font-weight:700;">VENTES DIRECTES</p>
          <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#1565C0;">${totalVentesDirectes.toLocaleString('fr-FR')} ${currency}</p>
        </td>
      </tr>
    </table>

    ${totalPending > 0
        ? `<div style="background:#fff3cd;border-left:4px solid #ffc107;border-radius:8px;padding:14px 20px;margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:13px;color:#856404;font-weight:600;">⏳ Reste à encaisser</span>
            <span style="font-size:18px;font-weight:800;color:#856404;">${totalPending.toLocaleString('fr-FR')} ${currency}</span>
           </div>`
        : `<div style="background:#d4edda;border-left:4px solid #28a745;border-radius:8px;padding:14px 20px;margin-top:16px;">
            <p style="margin:0;color:#155724;font-size:13px;font-weight:600;">✅ Toutes les commandes sont soldées.</p>
           </div>`}

    <div style="margin-top:28px;padding-top:24px;border-top:1px solid #f0e8e0;">
      <h2 style="margin:0 0 16px;font-size:17px;color:#2D1B0E;">📦 Commandes du jour</h2>
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

    <div style="margin-top:28px;padding-top:24px;border-top:1px solid #f0e8e0;">
      <h2 style="margin:0 0 16px;font-size:17px;color:#2D1B0E;">🏪 État des Stocks</h2>
      ${alertHtml}
    </div>

  </div>
  <div style="background:#f9f4f0;padding:20px 40px;text-align:center;border-top:1px solid #f0e8e0;">
    <p style="margin:0;color:#9C8070;font-size:13px;">Rapport généré automatiquement par <strong>Pâtiss'App</strong> 🥐</p>
  </div>
</div>
</body>
</html>`

            for (const gerant of orgGerants) {
                const recipientEmail = testEmail ?? userEmailMap.get(gerant.id)
                if (!recipientEmail) continue

                if (resend) {
                    await resend.emails.send({
                        from: "Pâtiss'App <onboarding@resend.dev>",
                        to: [recipientEmail],
                        subject: `📊 Bilan du Jour — ${org.name} — ${dateStr}`,
                        html,
                    })
                    console.log(`Email envoyé à ${recipientEmail}`)
                } else {
                    console.log(`[SIMULATION EMAIL] Destinataire: ${recipientEmail} | CA: ${totalRevenue} ${currency}`)
                }

                // En mode test on n'envoie qu'une seule fois (pas à tous les gérants)
                if (testEmail) break
            }

            if (testEmail) break // En mode test, on ne traite que la première org
        }

        return NextResponse.json({ success: true, message: 'Rapports quotidiens générés et distribués !' })
    } catch (error: unknown) {
        console.error('Erreur CRON Daily Report:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur inconnue' }, { status: 500 })
    }
}
