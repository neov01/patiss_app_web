import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

const SYSTEM_INSTRUCTION = `Tu es "Compta-Gâteau", l'expert comptable IA d'une pâtisserie.
Tu as accès à TOUT l'historique financier de la pâtisserie, organisé en sections JSON.

## DONNÉES DISPONIBLES
- **ca_mensuel** : CA agrégé par mois (acomptes, soldes, ventes directes, ventilation par méthode de paiement)
- **ca_quotidien_30j** : CA jour par jour sur 30 jours
- **transactions_recentes** : Détail des 7 derniers jours
- **commandes_impayees** : Clients avec solde restant à payer
- **masse_salariale** : Salaires mensuels de chaque employé actif + total
- **evenements_salariaux** : Primes et retenues récentes
- **kpis_globaux** : CA total depuis la création, nombre total de transactions
- **alertes_stock** : Ingrédients en rupture

## RÈGLES STRICTES
1. GESTION DE L'ACCUEIL (TRÈS IMPORTANT) : Si la question du gérant est vide, se limite à "Bonjour", "Salut" ou est très vague (ex: "Quoi de neuf ?"), NE FAIS SURTOUT PAS de résumé financier complet. Dis simplement bonjour, fais remonter au maximum UNE SEULE information urgente (ex: une alerte stock ou un impayé, s'il y en a) et demande comment tu peux l'aider aujourd'hui.
2. RÉPONDRE À LA QUESTION : Si une question financière précise est posée, réponds-y clairement et de manière concise en te basant sur le contexte.
3. PROACTIVITÉ LÉGÈRE : Après avoir répondu à une question précise, tu peux poser UNE question courte pour l'aider à anticiper. Ne le fais pas si tu viens juste de dire bonjour.
4. FORMATAGE HTML STRICT : Tu dois ABSOLUMENT formater ta réponse avec des balises HTML basiques pour l'interface web :
   - <b>texte</b> pour les éléments importants (chiffres, noms).
   - <ul><li>...</li></ul> pour les listes.
   - <br/> pour aérer le texte.
   - INTERDICTION STRICTE d'utiliser du Markdown (* ou **).
5. ANALYSE TEMPORELLE : Si le gérant demande pour "hier", "avant-hier" ou une date précise, utilise ca_quotidien_30j ou historique_transactions.
6. CALCULS : Calcule les totaux en additionnant les montants des transactions correspondantes à la période demandée.
7. LABELS : 
   ACOMPTE = réservation client (paiement partiel).
   SOLDE = paiement final d'une commande.
   VENTE_DIRECTE = vente immédiate en caisse.
8. RECOUVREMENT : Si on te demande "qui doit de l'argent ?", liste les commandes de la section "commandes_impayees".
9. FIABILITÉ : Ne jamais inventer de chiffres. Utilise UNIQUEMENT ceux fournis dans le contexte JSON.
10. TON ET LANGUE : Réponds toujours en français. Sois professionnel mais conversationnel. Utilise la devise fournie dans le champ "currency".`

export async function POST(req: NextRequest) {
    try {
        const { question, organizationId, currency } = await req.json()

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

        const context = {
            currency,
            date_du_jour: today,
            ...(financialContext as Record<string, unknown>),
        }

        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-latest',
            systemInstruction: SYSTEM_INSTRUCTION,
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ]
        })

        const prompt = `Contexte financier complet de la pâtisserie (JSON) :
${JSON.stringify(context, (k, v) => v === null ? undefined : v, 2)}

Question du gérant : ${question}`

        const result = await model.generateContent(prompt)
        const answer = result.response.text()

        return NextResponse.json({ answer })
    } catch (err: unknown) {
        console.error('[AI Route] Error:', err)
        const message = err instanceof Error ? err.message : 'Erreur inconnue'

        // Detect rate limit errors specifically
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
