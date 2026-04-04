'use server'

import { createClient } from '@/lib/supabase/server'
import { startOfDay } from 'date-fns'

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
        return { ca_encaisse: 0, volume_affaires: 0 }
    }

    return {
        ca_encaisse: (data as any)?.ca_encaisse || 0,
        volume_affaires: (data as any)?.volume_affaires || 0
    }
}
