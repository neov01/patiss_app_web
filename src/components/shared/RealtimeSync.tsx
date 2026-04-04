'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RealtimeSync({ organizationId }: { organizationId: string }) {
    const router = useRouter()

    useEffect(() => {
        if (!organizationId) return

        const supabase = createClient()

        // Abonnement aux changements sur transactions et orders
        const channel = supabase.channel('realtime-financial-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders', filter: `organization_id=eq.${organizationId}` },
                () => router.refresh()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transactions', filter: `organization_id=eq.${organizationId}` },
                () => router.refresh()
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [organizationId, router])

    return null
}
