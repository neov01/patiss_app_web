import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

const SYSTEM_INSTRUCTION = `Tu es un Expert Comptable spécialisé en Boulangerie-Pâtisserie.
Ton rôle est d'analyser les données JSON que je te fournis (Ventes, Coûts Matières, Pertes) et de donner des conseils stratégiques au gérant.
Ton ton doit être professionnel, encourageant mais direct sur les problèmes financiers.

Règles strictes :
1. Ne jamais inventer de chiffres. Utilise uniquement ceux fournis dans le contexte.
2. Si la marge baisse, alerte immédiatement sur les ingrédients dont le prix a augmenté ou sur les pertes trop élevées.
3. Exprime-toi toujours dans la devise configurée.
4. Tes réponses doivent être courtes (max 3 phrases) pour s'afficher dans une "Carte Dashboard".
5. Réponds toujours en français.`

export async function POST(req: NextRequest) {
    try {
        const { question, organizationId, currency } = await req.json()

        const supabase = await createClient()
        const today = new Date().toISOString().split('T')[0]

        const [ordersRes, logsRes, alertsRes] = await Promise.all([
            supabase.from('orders').select('total_amount, status, customer_name').eq('organization_id', organizationId).gte('created_at', today + 'T00:00:00'),
            supabase.from('inventory_logs').select('quantity_change, reason, ingredient_id').eq('organization_id', organizationId).gte('log_date', today + 'T00:00:00'),
            supabase.from('ingredients').select('name, current_stock, alert_threshold, cost_per_unit').eq('organization_id', organizationId),
        ])

        const context = {
            currency,
            date: today,
            ventes_du_jour: {
                nombre_commandes: ordersRes.data?.length ?? 0,
                total_ca: ordersRes.data?.reduce((s, o) => s + o.total_amount, 0) ?? 0,
            },
            mouvements_stock: {
                pertes: logsRes.data?.filter(l => l.reason === 'waste') ?? [],
                productions: logsRes.data?.filter(l => l.reason === 'production') ?? [],
                achats: logsRes.data?.filter(l => l.reason === 'purchase') ?? [],
            },
            alertes_stock: alertsRes.data?.filter(i => i.current_stock < i.alert_threshold).map(i => ({
                ingredient: i.name,
                stock_actuel: i.current_stock,
                seuil: i.alert_threshold,
            })) ?? [],
        }

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: SYSTEM_INSTRUCTION,
        })

        const prompt = `Données du jour en JSON :
${JSON.stringify(context, null, 2)}

Question du gérant : ${question}`

        const result = await model.generateContent(prompt)
        const answer = result.response.text()

        return NextResponse.json({ answer })
    } catch (err) {
        console.error('[AI Route] Error:', err)
        return NextResponse.json(
            { answer: "Je n'ai pas pu accéder aux données. Vérifiez la configuration de l'API Gemini." },
            { status: 200 }
        )
    }
}
