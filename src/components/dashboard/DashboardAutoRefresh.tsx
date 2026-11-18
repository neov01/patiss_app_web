'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const DEFAULT_INTERVAL_MS = 30_000

/**
 * Recharge les données serveur du tableau de bord à intervalle régulier.
 * Ne fait rien quand l'onglet est masqué ; au retour sur l'onglet, rafraîchit
 * immédiatement si la dernière actualisation date de plus d'un intervalle.
 *
 * Remplace en pratique le temps réel Supabase, non activé en production
 * (publication `supabase_realtime` vide au 2026-11-18).
 */
export default function DashboardAutoRefresh({ intervalMs = DEFAULT_INTERVAL_MS }: { intervalMs?: number }) {
    const router = useRouter()

    useEffect(() => {
        let lastRefresh = Date.now()

        const refresh = () => {
            lastRefresh = Date.now()
            router.refresh()
        }

        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') refresh()
        }, intervalMs)

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastRefresh >= intervalMs) refresh()
        }
        document.addEventListener('visibilitychange', onVisibilityChange)

        return () => {
            window.clearInterval(timer)
            document.removeEventListener('visibilitychange', onVisibilityChange)
        }
    }, [router, intervalMs])

    return null
}
