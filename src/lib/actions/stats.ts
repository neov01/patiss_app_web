'use server'

import { createClient } from '@/lib/supabase/server'
import { startOfDay, subDays } from 'date-fns'

export async function getDailyStats(orgId: string) {
    const supabase = await createClient()

    // Date courante au format timestamp (début de journée)
    const targetDate = startOfDay(new Date()).toISOString().split('T')[0]

    // Appel à la fonction RPC pour mutualiser le calcul côté Base de données
    const { data, error } = await supabase.rpc('get_daily_metrics' as any, {
        p_org_id: orgId,
        p_target_date: targetDate
    })

    if (error) {
        console.error('Erreur get_daily_metrics:', error)
        // Fallback sécurisé en cas d'échec
        return {
            ca_encaisse: 0,
            volume_affaires: 0,
            total_acomptes: 0,
            total_soldes: 0,
            total_ventes_directes: 0,
            commandes_en_attente_paiement: 0,
        }
    }

    const d = data as Record<string, number> | null
    return {
        ca_encaisse: d?.ca_encaisse ?? 0,
        volume_affaires: d?.volume_affaires ?? 0,
        total_acomptes: d?.total_acomptes ?? 0,
        total_soldes: d?.total_soldes ?? 0,
        total_ventes_directes: d?.total_ventes_directes ?? 0,
        commandes_en_attente_paiement: d?.commandes_en_attente_paiement ?? 0,
    }
}

/**
 * Récupère les transactions récentes (par défaut 7 jours) pour le Comptable IA.
 * Retourne un tableau JSON strict exploitable par Gemini.
 */
export async function getTransactionsForIA(orgId: string, daysBack: number = 7) {
    const supabase = await createClient()
    const startDate = startOfDay(subDays(new Date(), daysBack)).toISOString()

    // Transactions récentes avec détail
    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('order_id, amount, label_type, payment_method, created_at, client_name')
        .eq('organization_id', orgId)
        .gte('created_at', startDate)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('Erreur getTransactionsForIA:', error)
        return []
    }

    return (transactions ?? []).map(t => ({
        commande_id: t.order_id,
        montant: t.amount,
        label_type: t.label_type,
        methode: t.payment_method,
        date: t.created_at,
        client: t.client_name,
    }))
}

/**
 * Récupère les commandes avec solde impayé pour le Comptable IA.
 */
export async function getCommandesImpayeesForIA(orgId: string) {
    const supabase = await createClient()

    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, total_amount, deposit_amount, balance, payment_status, status, created_at')
        .eq('organization_id', orgId)
        .in('payment_status', ['EN_ATTENTE', 'PARTIEL'])
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erreur getCommandesImpayeesForIA:', error)
        return []
    }

    return (orders ?? []).map(o => ({
        commande_id: o.id,
        numero: o.order_number,
        client: o.customer_name,
        montant_total: o.total_amount,
        acompte_verse: o.deposit_amount,
        reste_a_payer: o.balance,
        statut_paiement: o.payment_status,
        statut_commande: o.status,
        date_creation: o.created_at,
    }))
}
