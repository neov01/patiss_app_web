import { NextRequest, NextResponse } from 'next/server'
import { AuthContextError, requireOrganizationContext } from '@/lib/auth/organization-context'

interface DailyRevenue {
    date?: string
    jour?: string
    total?: number
    ca?: number
}

export async function POST(req: NextRequest) {
    try {
        await req.json().catch(() => ({}))
        const { supabase, organizationId, role } = await requireOrganizationContext()

        const { data: ctx, error } = await supabase.rpc(
            'get_ia_financial_context',
            { p_org_id: organizationId }
        )

        if (error || !ctx) return NextResponse.json({ suggestions: [] })

        const context = ctx as Record<string, unknown>
        const suggestions: string[] = []

        // ── Alertes stock ──────────────────────────────────────
        const alertesStock = Array.isArray(context.alertes_stock) ? context.alertes_stock : []
        if (alertesStock.length > 0) {
            suggestions.push(`Quels ingrédients sont en rupture ou stock critique ?`)
        }

        // ── Commandes impayées ─────────────────────────────────
        const impayees = Array.isArray(context.commandes_impayees) ? context.commandes_impayees : []
        if (impayees.length > 0) {
            suggestions.push(`Qui me doit de l'argent en ce moment ?`)
        }

        // ── CA du jour vs hier ─────────────────────────────────
        const caQuotidien = Array.isArray(context.ca_quotidien_30j)
            ? context.ca_quotidien_30j as DailyRevenue[]
            : []
        if (caQuotidien.length >= 2) {
            const today = caQuotidien[caQuotidien.length - 1]
            const yesterday = caQuotidien[caQuotidien.length - 2]
            const todayTotal = today?.total ?? today?.ca
            const yesterdayTotal = yesterday?.total ?? yesterday?.ca
            if (typeof todayTotal === 'number' && typeof yesterdayTotal === 'number') {
                if (todayTotal < yesterdayTotal * 0.8) {
                    suggestions.push(`Pourquoi mes ventes d'aujourd'hui sont-elles inférieures à hier ?`)
                } else {
                    suggestions.push(`Compare mes ventes d'aujourd'hui et d'hier.`)
                }
            }
        }

        // ── Masse salariale ────────────────────────────────────
        const isManager = role === 'gerant' || role === 'super_admin'
        const masseSalariale = Array.isArray(context.masse_salariale) ? context.masse_salariale : []
        if (isManager && masseSalariale.length > 0) {
            suggestions.push(`Quel est mon ratio masse salariale / chiffre d'affaires ce mois-ci ?`)
        }

        // ── KPIs globaux ───────────────────────────────────────
        const kpis = context.kpis_globaux as { ca_total_global?: number; ca_total_depuis_creation?: number } | null
        const totalRevenue = kpis?.ca_total_global ?? kpis?.ca_total_depuis_creation ?? 0
        if (totalRevenue > 0 && suggestions.length < 4) {
            suggestions.push(`Donne-moi un résumé financier rapide du mois en cours.`)
        }

        // Limiter à 4 suggestions pertinentes
        return NextResponse.json({ suggestions: suggestions.slice(0, 4) })
    } catch (err) {
        console.error('[AI Suggestions] Error:', err)
        if (err instanceof AuthContextError) {
            return NextResponse.json({ suggestions: [] }, { status: err.status })
        }

        return NextResponse.json({ suggestions: [] })
    }
}
