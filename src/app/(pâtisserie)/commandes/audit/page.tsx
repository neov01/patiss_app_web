import { createClient } from '@/lib/supabase/server'
import { getOrderDeletionAudit } from '@/lib/actions/orders'
import OrderAuditClient from '@/components/orders/OrderAuditClient'

export default async function CommandesAuditPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('role_slug')
        .eq('id', user.id)
        .single()

    if (!profile || !['vendeur', 'gerant', 'super_admin'].includes(profile.role_slug)) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)' }}>
                Accès réservé aux vendeurs et gérants.
            </div>
        )
    }

    const result = await getOrderDeletionAudit({ page: 1, pageSize: 30 })

    if ('error' in result) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-error)' }}>
                {result.error}
            </div>
        )
    }

    return (
        <OrderAuditClient
            initialEntries={result.entries}
            initialCount={result.count}
            initialHasMore={result.hasMore}
        />
    )
}
