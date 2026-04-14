import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const { organizationId } = await req.json()
        if (!organizationId) return NextResponse.json({ suggestions: [] })

        const supabase = await createClient()

        const { data: ctx, error } = await supabase.rpc(
            'get_ia_financial_context' as any,
            { p_org_id: organizationId }
        )

        if (error || !ctx) return NextResponse.json({ suggestions: [] })

        const context = ctx as Record<string, any>
        const suggestions: string[] = []

        // ── Alertes stock ──────────────────────────────────────
        const alertesStock = context.alertes_stock ?? []
        if (alertesStock.length > 0) {
            suggestions.push(`Quels ingrédients sont en rupture ou stock critique ?`)
        }

        // ── Commandes impayées ─────────────────────────────────
        const impayees = context.commandes_impayees ?? []
        if (impayees.length > 0) {
            suggestions.push(`Qui me doit de l'argent en ce moment ?`)
        }

        // ── CA du jour vs hier ─────────────────────────────────
        const caQuotidien: Array<{ date: string; total: number }> = context.ca_quotidien_30j ?? []
        if (caQuotidien.length >= 2) {
            const today = caQuotidien[caQuotidien.length - 1]
            const yesterday = caQuotidien[caQuotidien.length - 2]
            if (today && yesterday) {
                if (today.total < yesterday.total * 0.8) {
                    suggestions.push(`Pourquoi mes ventes d'aujourd'hui sont-elles inférieures à hier ?`)
                } else {
                    suggestions.push(`Compare mes ventes d'aujourd'hui et d'hier.`)
                }
            }
        }

        // ── Masse salariale ────────────────────────────────────
        const masseSalariale = context.masse_salariale
        if (masseSalariale?.total_mensuel > 0) {
            suggestions.push(`Quel est mon ratio masse salariale / chiffre d'affaires ce mois-ci ?`)
        }

        // ── KPIs globaux ───────────────────────────────────────
        const kpis = context.kpis_globaux
        if (kpis?.ca_total_global > 0 && suggestions.length < 4) {
            suggestions.push(`Donne-moi un résumé financier rapide du mois en cours.`)
        }

        // Limiter à 4 suggestions pertinentes
        return NextResponse.json({ suggestions: suggestions.slice(0, 4) })
    } catch (err) {
        console.error('[AI Suggestions] Error:', err)
        return NextResponse.json({ suggestions: [] })
    }
}
