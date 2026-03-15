import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

Deno.serve(async (_req: Request) => {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        const today = new Date().toISOString().split('T')[0]

        // Fetch des données du jour
        const [ordersRes, wasteRes, orgsRes] = await Promise.all([
            fetch(`${supabaseUrl}/rest/v1/orders?select=*,order_items(*,recipes(name))&created_at=gte.${today}T00:00:00`, {
                headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
            }),
            fetch(`${supabaseUrl}/rest/v1/inventory_logs?select=*,ingredients(name,unit)&reason=eq.waste&log_date=gte.${today}T00:00:00`, {
                headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
            }),
            fetch(`${supabaseUrl}/rest/v1/organizations?select=id,name,currency_symbol`, {
                headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
            }),
        ])

        const orders = await ordersRes.json()
        const waste = await wasteRes.json()
        const orgs = await orgsRes.json()

        for (const org of orgs) {
            const orgOrders = orders.filter((o: { organization_id: string }) => o.organization_id === org.id)
            const orgWaste = waste.filter((w: { organization_id: string }) => w.organization_id === org.id)

            const totalCA = orgOrders.reduce((s: number, o: { total_amount: number }) => s + o.total_amount, 0)
            const totalOrders = orgOrders.length
            const symbol = org.currency_symbol

            const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>Rapport de Clôture — ${org.name}</title>
<style>
  body { font-family: Inter, sans-serif; background: #FDF8F3; color: #2D1B0E; max-width: 600px; margin: 0 auto; padding: 24px; }
  .header { background: linear-gradient(135deg, #C4836A, #C78A4A); color: white; border-radius: 16px; padding: 24px; margin-bottom: 20px; }
  .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1.5px solid #F0E8E0; }
  .kpi { font-size: 2rem; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 8px 12px; text-align: left; font-size: 0.875rem; border-bottom: 1px solid #F0E8E0; }
  th { color: #9C8070; font-size: 0.75rem; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="header">
    <h1 style="margin:0;font-size:1.4rem">🎂 Rapport de Clôture</h1>
    <p style="margin:4px 0 0;opacity:0.85">${org.name} · ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
  </div>

  <div class="card">
    <div style="color:#9C8070;font-size:0.8rem;margin-bottom:4px">CHIFFRE D'AFFAIRES DU JOUR</div>
    <div class="kpi">${totalCA.toLocaleString('fr-FR')} ${symbol}</div>
    <div style="color:#9C8070;margin-top:6px">${totalOrders} commande${totalOrders > 1 ? 's' : ''} traitée${totalOrders > 1 ? 's' : ''}</div>
  </div>

  ${orgWaste.length > 0 ? `
  <div class="card">
    <h3 style="margin:0 0 12px">⚠ Pertes déclarées</h3>
    <table>
      <tr><th>Ingrédient</th><th>Quantité</th></tr>
      ${orgWaste.map((w: { ingredients?: { name: string; unit: string }; quantity_change: number }) => `<tr><td>${w.ingredients?.name ?? '—'}</td><td>${Math.abs(w.quantity_change)} ${w.ingredients?.unit ?? ''}</td></tr>`).join('')}
    </table>
  </div>` : ''}

  <p style="text-align:center;color:#9C8070;font-size:0.8rem">Généré automatiquement par Pâtiss&apos;App</p>
</body>
</html>`

            // Envoi Resend (si configuré)
            if (RESEND_API_KEY) {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: 'rapport@patissapp.fr',
                        to: ['gerant@patisserie.fr'], // À configurer
                        subject: `📊 Rapport du ${new Date().toLocaleDateString('fr-FR')} — ${org.name}`,
                        html,
                    }),
                })
            }
        }

        return new Response(JSON.stringify({ success: true, processed: orgs.length }), {
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
})
