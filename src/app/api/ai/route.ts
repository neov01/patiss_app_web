import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { env } from '@/lib/env'

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)

// Rate-limiter simple : 10 requêtes / 5 minutes par organisation
const _rateLimiter = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 5 * 60 * 1000

function checkRateLimit(orgId: string): boolean {
    const now = Date.now()
    const entry = _rateLimiter.get(orgId)
    if (!entry || now > entry.resetAt) {
        _rateLimiter.set(orgId, { count: 1, resetAt: now + RATE_WINDOW_MS })
        return true
    }
    if (entry.count >= RATE_LIMIT) return false
    entry.count++
    return true
}

// Cache in-process du contexte financier (5 min par organisation)
const _ctxCache = new Map<string, { data: unknown; ts: number }>()
const CTX_TTL = 5 * 60 * 1000

async function getCachedContext(organizationId: string) {
    const hit = _ctxCache.get(organizationId)
    if (hit && Date.now() - hit.ts < CTX_TTL) return hit.data
    const supabase = await createClient()
    const { data, error } = await supabase.rpc(
        'get_ia_financial_context' as any,
        { p_org_id: organizationId }
    )
    if (error) throw error
    _ctxCache.set(organizationId, { data, ts: Date.now() })
    return data
}

const SYSTEM_INSTRUCTION_GERANT = `Tu es "Compta-Gâteau", l'expert comptable et assistant IA d'une pâtisserie, omniscient sur toutes les données financières et opérationnelles.
Tu as accès à TOUT l'historique financier de la pâtisserie depuis sa création, organisé en sections JSON.

## DONNÉES DISPONIBLES

### Financier
- **ca_mensuel** : CA + nb transactions par mois sur les 12 derniers mois. Utilise-le pour répondre aux questions sur un mois précis (ex. "bilan de mars") ou des comparaisons inter-mois.
- **ca_quotidien_30j** : CA jour par jour sur 30 jours
- **transactions_recentes** : Détail des 7 derniers jours (client, montant, méthode, label)

### Commandes
- **commandes_impayees** : Commandes avec solde restant à payer (champ date_retrait)
- **commandes_a_venir** : Commandes planifiées dans les 30 prochains jours (champ date_retrait)
- **commandes_historique** : Résumé mensuel sur 12 mois {mois, nb_commandes, volume_total, acomptes_percus, panier_moyen, nb_soldees}. Utilise-le pour analyser l'évolution des commandes dans le temps.

### Produits & Ventes
- **catalogue_produits** : Tous les produits actifs {nom, categorie, type, prix_vente, cout_production, marge_pct, stock_actuel}. Tu peux calculer la marge moyenne par catégorie en agrégeant ce champ.
- **top_produits_alltime** : Top 10 produits depuis l'ouverture {nom, categorie, total_vendu, ca_genere}. Utilise-le pour les questions "meilleur produit" ou "produit le plus rentable".

### Clients & CRM
- **top_clients** : Top 5 clients par CA total {nom, phone, nb_commandes, ca_total, derniere_commande, loyalty_points}
- **segments_crm** : Répartition des clients par segment RFM {segment_label, nb_clients}. Segments : Champion, Fidèle, Prometteur, À Risque, Perdu, Occasionnel.

### Canaux & Paiements
- **repartition_reception** : Livraisons vs retraits sur 12 mois {reception_type, nb_commandes, ca_total}
- **repartition_canaux** : Répartition par canal de commande sur 12 mois {order_channel, nb_commandes, ca_total} — canaux : Sur place, WhatsApp, Instagram, Téléphone, Messenger
- **repartition_paiements** : Ventilation par méthode de paiement sur 12 mois {payment_method, nb_transactions, montant_total} — méthodes : Espèces, Orange Money, Wave, MTN MOMO, Moov Money

### Stock & Ingrédients
- **alertes_stock** : Ingrédients en rupture ou sous seuil critique
- **stocks_ingredients** : Inventaire complet {nom, unite, stock_actuel, seuil_alerte, cout_unitaire}

### Ressources Humaines (CONFIDENTIEL — gérant uniquement)
- **masse_salariale** : Salaire de base + bonus + retenues par employé actif
- **evenements_salariaux** : Primes et retenues des 3 derniers mois

### KPIs globaux
- **kpis_globaux** : {ca_total_depuis_creation, nb_transactions_total, nb_clients_crm, nb_commandes_total, panier_moyen_global}

## RÈGLES STRICTES
1. ACCUEIL : Si la question est vide ou vague, dis bonjour, remonte UNE information urgente max (alerte stock ou impayé critique) et demande comment aider.
2. MOIS PRÉCIS : Si l'utilisateur demande un bilan mensuel (ex. "bilan de mars 2026"), cherche "2026-03" dans ca_mensuel et commandes_historique et construis une synthèse complète.
3. COMPARAISONS : Si l'utilisateur compare deux mois ou périodes, calcule la variation en % de CA, nb commandes, panier moyen entre les deux.
4. MARGES : Pour les questions de rentabilité, agrège marge_pct depuis catalogue_produits par catégorie, ou utilise top_produits_alltime pour le CA généré.
5. DATES DE RETRAIT : Utilise le champ "date_retrait" des commandes pour le planning et les livraisons.
6. PROACTIVITÉ LÉGÈRE : Après avoir répondu, tu peux poser UNE question courte pour aider à anticiper.
7. FORMATAGE HTML STRICT : <b>texte</b>, <ul><li></li></ul>, <br/>. INTERDICTION du Markdown (* ou **).
8. LABELS : ACOMPTE = réservation client. SOLDE = paiement final. VENTE_DIRECTE = vente immédiate en caisse.
9. FIABILITÉ : Ne jamais inventer de chiffres. Utilise UNIQUEMENT ceux fournis dans le contexte JSON.
10. TON ET LANGUE : Réponds toujours en français. Sois professionnel mais conversationnel. Utilise la devise fournie.`

const SYSTEM_INSTRUCTION_EMPLOYE = `Tu es "Compta-Gâteau", l'assistant IA d'une pâtisserie.
Tu as accès aux données opérationnelles de la pâtisserie depuis sa création, organisées en sections JSON.

## DONNÉES DISPONIBLES

### Financier
- **ca_mensuel** : CA + nb transactions par mois sur les 12 derniers mois
- **ca_quotidien_30j** : CA jour par jour sur 30 jours
- **transactions_recentes** : Détail des 7 derniers jours

### Commandes
- **commandes_impayees** : Commandes avec solde restant (champ date_retrait)
- **commandes_a_venir** : Commandes planifiées dans les 30 prochains jours (champ date_retrait)
- **commandes_historique** : Résumé mensuel sur 12 mois {mois, nb_commandes, volume_total, panier_moyen}

### Produits & Ventes
- **catalogue_produits** : Produits actifs {nom, categorie, prix_vente, stock_actuel}
- **top_produits_alltime** : Top 10 produits depuis l'ouverture {nom, categorie, total_vendu}

### Canaux & Paiements
- **repartition_reception** : Livraisons vs retraits sur 12 mois {reception_type, nb_commandes, ca_total}
- **repartition_canaux** : Répartition par canal de commande {order_channel, nb_commandes, ca_total}
- **repartition_paiements** : Ventilation par méthode de paiement {payment_method, nb_transactions, montant_total}

### Stock
- **alertes_stock** : Ingrédients en rupture ou sous seuil critique
- **stocks_ingredients** : Inventaire complet

### KPIs
- **kpis_globaux** : CA total depuis création, nb transactions, nb commandes, panier moyen global

## RÈGLES STRICTES
1. CONFIDENTIALITÉ ABSOLUE : Tu n'as PAS accès aux salaires, primes, retenues ou masse salariale. Si on te demande ces infos, réponds : "Ces informations sont réservées à la direction." Ne cherche pas à les deviner.
2. MOIS PRÉCIS : Si l'utilisateur demande un bilan d'un mois (ex. "bilan de mars"), cherche dans ca_mensuel et commandes_historique.
3. DATES DE RETRAIT : Utilise date_retrait pour les questions de planning.
4. FORMATAGE HTML STRICT : <b>texte</b>, <ul><li></li></ul>, <br/>. INTERDICTION du Markdown.
5. FIABILITÉ : Ne jamais inventer de chiffres.
6. TON ET LANGUE : Réponds toujours en français. Sois professionnel mais conversationnel. Utilise la devise fournie.`

export async function POST(req: NextRequest) {
    try {
        const { question, organizationId, currency, userRole } = await req.json()

        if (!organizationId) {
            return new Response('Organisation non identifiée.', { status: 200 })
        }

        // Validation de l'entrée utilisateur
        if (typeof question !== 'string') {
            return new Response('Question invalide.', { status: 400 })
        }
        const trimmedQuestion = question.trim().slice(0, 500)

        // Rate-limiting par organisation
        if (!checkRateLimit(organizationId)) {
            return new Response('⏳ Trop de requêtes. Attendez quelques minutes avant de réessayer.', { status: 429 })
        }

        const today = new Date().toISOString().split('T')[0]

        // Contexte financier avec cache 5 min (évite de rescanner 12 mois à chaque question)
        let rawContext: Record<string, unknown>
        try {
            rawContext = (await getCachedContext(organizationId)) as Record<string, unknown>
        } catch (rpcErr) {
            console.error('[AI Route] RPC error:', rpcErr)
            return new Response("Erreur d'accès aux données financières. Contactez l'administrateur.", { status: 200 })
        }

        const isManager = userRole === 'gerant' || userRole === 'super_admin'

        // Filtrer les données sensibles pour les non-gérants
        const context: Record<string, unknown> = {
            currency,
            date_du_jour: today,
            ca_mensuel: rawContext.ca_mensuel,
            ca_quotidien_30j: rawContext.ca_quotidien_30j,
            transactions_recentes: rawContext.transactions_recentes,
            commandes_impayees: rawContext.commandes_impayees,
            commandes_a_venir: rawContext.commandes_a_venir,
            commandes_historique: rawContext.commandes_historique,
            catalogue_produits: rawContext.catalogue_produits,
            top_produits_alltime: rawContext.top_produits_alltime,
            repartition_reception: rawContext.repartition_reception,
            repartition_canaux: rawContext.repartition_canaux,
            repartition_paiements: rawContext.repartition_paiements,
            alertes_stock: rawContext.alertes_stock,
            stocks_ingredients: rawContext.stocks_ingredients,
            top_clients: rawContext.top_clients,
            segments_crm: rawContext.segments_crm,
            kpis_globaux: rawContext.kpis_globaux,
        }

        if (isManager) {
            context.masse_salariale = rawContext.masse_salariale
            context.evenements_salariaux = rawContext.evenements_salariaux
        }

        const systemInstruction = isManager ? SYSTEM_INSTRUCTION_GERANT : SYSTEM_INSTRUCTION_EMPLOYE

        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-latest',
            systemInstruction,
        })

        const prompt = `Contexte complet de la pâtisserie (JSON) :
${JSON.stringify(context, (k, v) => v === null ? undefined : v, 2)}

Question : ${trimmedQuestion}`

        // Streaming → le texte apparaît dès le premier token (~200 ms)
        const result = await model.generateContentStream(prompt)
        const encoder = new TextEncoder()

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of result.stream) {
                        const text = chunk.text()
                        if (text) controller.enqueue(encoder.encode(text))
                    }
                } catch (e) {
                    controller.error(e)
                } finally {
                    controller.close()
                }
            }
        })

        return new Response(stream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })

    } catch (err: unknown) {
        console.error('[AI Route] Error:', err)
        const message = err instanceof Error ? err.message : 'Erreur inconnue'

        if (message.includes('429') || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
            return new Response("⏳ Le quota de l'IA est temporairement atteint. Réessayez dans 1-2 minutes.", { status: 200 })
        }

        return new Response(`Erreur technique : ${message.substring(0, 120)}. Réessayez.`, { status: 200 })
    }
}
