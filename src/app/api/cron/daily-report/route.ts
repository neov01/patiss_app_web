import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

// Initialiser Resend
const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
    try {
        const cronSecret = process.env.CRON_SECRET;

        // Safety guard: if the secret is not defined in the environment, reject all requests.
        // This prevents 'Bearer undefined' matching when the variable is missing.
        if (!cronSecret) {
            console.error('CRON_SECRET is not configured in environment variables.');
            return NextResponse.json({ error: 'Config missing' }, { status: 500 });
        }

        const authHeader = request.headers.get('Authorization');
        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase variables are missing')
        }

        // On utilise l'accès Service Role pour tout lire sans RLS et lister les utilisateurs Auth
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

        // 1. Récupérer toutes les organisations
        const { data: orgs, error: orgsErr } = await supabaseAdmin.from('organizations').select('*')
        if (orgsErr) throw orgsErr

        // 2. Mapper les emails des utilisateurs via l'API auth
        const { data: { users }, error: usersErr } = await supabaseAdmin.auth.admin.listUsers()
        if (usersErr) throw usersErr
        const userEmailMap = new Map(users.map(u => [u.id, u.email]))

        // 3. Récupérer tous les profils de Gérants
        const { data: gerants, error: gerantsErr } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, organization_id')
            .eq('role_slug', 'gerant')
        if (gerantsErr) throw gerantsErr

        // Date de référence : de minuit ce matin à maintenant
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        // Itérer sur chaque organisation
        for (const org of orgs || []) {
            const orgId = org.id
            const currency = org.currency_symbol || '€'

            // Trouver les gérants de cette organisation
            const orgGerants = gerants?.filter(g => g.organization_id === orgId)
            if (!orgGerants || orgGerants.length === 0) continue

            // Récupérer les commandes terminées aujourd'hui
            const { data: orders } = await supabaseAdmin
                .from('orders')
                .select('total_amount, updated_at')
                .eq('organization_id', orgId)
                .eq('status', 'completed')
                .gte('updated_at', today.toISOString())
                .lt('updated_at', tomorrow.toISOString())
                
            const totalRevenue = orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0
            const ordersCount = orders?.length || 0

            // Alerte de stock
            const { data: allIngredients } = await supabaseAdmin
                .from('ingredients')
                .select('name, current_stock, alert_threshold, unit')
                .eq('organization_id', orgId)
                
            let criticalStockHTML = ''
            if (allIngredients) {
                // Filtrer côté serveur (Node) pour comparer deux colonnes
                const critical = allIngredients.filter(i => i.current_stock <= i.alert_threshold)
                if (critical.length > 0) {
                    criticalStockHTML = `
                        <h3 style="color: #ef4444;">⚠️ Alertes Stock (${critical.length} ruptures imminentes)</h3>
                        <ul>
                            ${critical.map(i => `<li><strong>${i.name}</strong> : <span style="color: #ef4444;">${i.current_stock}</span> ${i.unit} (Seuil: ${i.alert_threshold})</li>`).join('')}
                        </ul>
                    `
                } else {
                    criticalStockHTML = `<p style="color: #10b981;">✅ Tous les stocks sont sains.</p>`
                }
            }

            // Générer le template HTML
            const htmlContent = `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                    <h2 style="color: #111827;">Rapport Quotidien Pâtiss'App 📋</h2>
                    <p>Bonjour, voici le récapitulatif du jour pour votre établissement <strong>${org.name}</strong> :</p>
                    
                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 16px;">CA du jour (Commandes Terminées) : <br/>
                        <strong style="font-size: 28px; color: #2563eb;">${totalRevenue} ${currency}</strong></p>
                        <p style="margin: 10px 0 0 0; color: #4b5563;">Nombre de commandes : ${ordersCount}</p>
                    </div>
                    
                    ${criticalStockHTML}
                    
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
                    <p style="color: #6b7280; font-size: 14px; text-align: center;">À demain pour un nouveau résumé ! 🥐<br/>Pâtiss'App</p>
                </div>
            `

            // Envoyer l'email à tous les gérants concernés
            for (const gerant of orgGerants) {
                const email = userEmailMap.get(gerant.id)
                if (!email) continue

                if (process.env.RESEND_API_KEY) {
                    await resend.emails.send({
                        from: 'PatissApp <onboarding@resend.dev>', // Email autorisé par défaut sur domaine de test Resend
                        to: [email],
                        subject: `📊 Bilan du Jour — ${org.name}`,
                        html: htmlContent,
                    })
                    console.log(`Email envoyé à ${email}`)
                } else {
                    console.log(`[SIMULATION EMAIL] - Destinataire: ${email}`, `CA: ${totalRevenue}${currency}`)
                }
            }
        }

        return NextResponse.json({ success: true, message: 'Rapports quotidiens générés et distribués !' })
    } catch (error: any) {
        console.error('Erreur CRON Daily Report:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
