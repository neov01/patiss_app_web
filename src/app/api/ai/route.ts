import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

const SYSTEM_INSTRUCTION_GERANT = `Tu es "Compta-Gâteau", l'expert comptable et assistant IA d'une pâtisserie, omniscient sur toutes les données financières et opérationnelles.
Tu as accès à TOUT l'historique financier de la pâtisserie, organisé en sections JSON.

## DONNÉES DISPONIBLES
- **ca_mensuel** : CA agrégé par mois (acomptes, soldes, ventes directes, ventilation par méthode de paiement)
- **ca_quotidien_30j** : CA jour par jour sur 30 jours
- **transactions_recentes** : Détail des 7 derniers jours
- **commandes_impayees** : Clients avec solde restant à payer, avec date de retrait (date_retrait)
- **commandes_a_venir** : Toutes les commandes planifiées dans les 30 prochains jours, avec date_retrait
- **catalogue_produits** : Tous les produits actifs du catalogue {nom, categorie, prix_vente, cout_production, marge_pct, stock_actuel}
- **masse_salariale** : Salaires mensuels de chaque employé actif + total (CONFIDENTIEL — accès gérant uniquement)
- **evenements_salariaux** : Primes et retenues récentes (CONFIDENTIEL — accès gérant uniquement)
- **kpis_globaux** : CA total depuis la création, nombre total de transactions
- **alertes_stock** : Ingrédients en rupture ou sous le seuil d'alerte
- **stocks_ingredients** : Stock complet de tous les ingrédients

## RÈGLES STRICTES
1. GESTION DE L'ACCUEIL : Si la question est vide ou très vague, dis simplement bonjour, remonte au maximum UNE information urgente (alerte stock ou impayé urgent) et demande comment tu peux aider.
2. RÉPONDRE À LA QUESTION : Réponds clairement et de manière concise en te basant sur le contexte.
3. DATES DE RETRAIT : Utilise le champ "date_retrait" des commandes pour répondre aux questions sur les livraisons, retraits et planning.
4. CATALOGUE : Utilise "catalogue_produits" pour analyser les marges, les best-sellers potentiels ou les prix.
5. PROACTIVITÉ LÉGÈRE : Après avoir répondu, tu peux poser UNE question courte pour aider à anticiper.
6. FORMATAGE HTML STRICT : Utilise des balises HTML basiques : <b>texte</b>, <ul><li></li></ul>, <br/>. INTERDICTION d'utiliser du Markdown (* ou **).
7. CALCULS : Calcule les totaux en additionnant les montants des transactions correspondantes.
8. LABELS : ACOMPTE = réservation client. SOLDE = paiement final. VENTE_DIRECTE = vente immédiate en caisse.
9. FIABILITÉ : Ne jamais inventer de chiffres. Utilise UNIQUEMENT ceux fournis dans le contexte JSON.
10. TON ET LANGUE : Réponds toujours en français. Sois professionnel mais conversationnel. Utilise la devise fournie.`

const SYSTEM_INSTRUCTION_EMPLOYE = `Tu es "Compta-Gâteau", l'assistant IA d'une pâtisserie.
Tu as accès aux données opérationnelles de la pâtisserie, organisées en sections JSON.

## DONNÉES DISPONIBLES
- **ca_mensuel** : CA agrégé par mois
- **ca_quotidien_30j** : CA jour par jour sur 30 jours
- **transactions_recentes** : Détail des 7 derniers jours
- **commandes_impayees** : Clients avec solde restant à payer, avec date de retrait (date_retrait)
- **commandes_a_venir** : Toutes les commandes planifiées dans les 30 prochains jours, avec date_retrait
- **catalogue_produits** : Tous les produits actifs {nom, categorie, prix_vente, stock_actuel}
- **alertes_stock** : Ingrédients en rupture ou sous le seuil d'alerte
- **stocks_ingredients** : Stock complet de tous les ingrédients

## RÈGLES STRICTES
1. CONFIDENTIALITÉ ABSOLUE : Tu n'as PAS accès aux salaires, primes, retenues ou à la masse salariale. Si on te demande des informations sur les salaires ou la paie, réponds : "Ces informations sont réservées à la direction." Ne cherche pas à les deviner ou les estimer.
2. DATES DE RETRAIT : Utilise le champ "date_retrait" des commandes pour le planning.
3. CATALOGUE : Utilise "catalogue_produits" pour les questions sur les prix et le stock.
4. FORMATAGE HTML STRICT : <b>texte</b>, <ul><li></li></ul>, <br/>. INTERDICTION du Markdown.
5. FIABILITÉ : Ne jamais inventer de chiffres.
6. TON ET LANGUE : Réponds toujours en français. Sois professionnel mais conversationnel. Utilise la devise fournie.`

export async function POST(req: NextRequest) {
    try {
        const { question, organizationId, currency, userRole } = await req.json()

        if (!organizationId) {
            return NextResponse.json({ answer: "Organisation non identifiée." }, { status: 200 })
        }

        const supabase = await createClient()
        const today = new Date().toISOString().split('T')[0]

        // Un seul appel RPC côté Postgres → ultra-rapide, pas de N+1
        const { data: financialContext, error } = await supabase.rpc(
            'get_ia_financial_context' as any,
            { p_org_id: organizationId }
        )

        if (error) {
            console.error('[AI Route] RPC error:', error)
            return NextResponse.json(
                { answer: "Erreur d'accès aux données financières. Contactez l'administrateur." },
                { status: 200 }
            )
        }

        const isManager = userRole === 'gerant' || userRole === 'super_admin'
        const rawContext = financialContext as Record<string, unknown>

        // Filtrer les données sensibles pour les non-gérants
        const context: Record<string, unknown> = {
            currency,
            date_du_jour: today,
            ca_mensuel: rawContext.ca_mensuel,
            ca_quotidien_30j: rawContext.ca_quotidien_30j,
            transactions_recentes: rawContext.transactions_recentes,
            commandes_impayees: rawContext.commandes_impayees,
            commandes_a_venir: rawContext.commandes_a_venir,
            catalogue_produits: rawContext.catalogue_produits,
            alertes_stock: rawContext.alertes_stock,
            stocks_ingredients: rawContext.stocks_ingredients,
            kpis_globaux: rawContext.kpis_globaux,
        }

        // Salaires accessibles seulement aux gérants
        if (isManager) {
            context.masse_salariale = rawContext.masse_salariale
            context.evenements_salariaux = rawContext.evenements_salariaux
        }

        const systemInstruction = isManager ? SYSTEM_INSTRUCTION_GERANT : SYSTEM_INSTRUCTION_EMPLOYE

        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-latest',
            systemInstruction,
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ]
        })

        const prompt = `Contexte complet de la pâtisserie (JSON) :
${JSON.stringify(context, (k, v) => v === null ? undefined : v, 2)}

Question : ${question}`

        const result = await model.generateContent(prompt)
        const answer = result.response.text()

        return NextResponse.json({ answer })
    } catch (err: unknown) {
        console.error('[AI Route] Error:', err)
        const message = err instanceof Error ? err.message : 'Erreur inconnue'

        if (message.includes('429') || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
            return NextResponse.json(
                { answer: "⏳ Le quota de l'IA est temporairement atteint. Réessayez dans 1-2 minutes." },
                { status: 200 }
            )
        }

        return NextResponse.json(
            { answer: `Erreur technique : ${message.substring(0, 120)}. Réessayez.` },
            { status: 200 }
        )
    }
}
