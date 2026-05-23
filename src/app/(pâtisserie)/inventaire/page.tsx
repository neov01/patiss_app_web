import { createClient } from '@/lib/supabase/server'
import InventaireClient from '@/components/inventory/InventaireClient'

export default async function InventairePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    const orgId = profile?.organization_id!

    const [logsRes, ingredientsRes] = await Promise.all([
        supabase.from('inventory_logs')
            .select('id, log_date, quantity_change, reason, note, ingredients(name, unit), profiles(full_name)')
            .eq('organization_id', orgId)
            .order('log_date', { ascending: false })
            .limit(500),
        supabase.from('ingredients')
            .select('name, current_stock, alert_threshold, unit')
            .eq('organization_id', orgId)
            .eq('is_active', true),
    ])

    const lowStockIngredients = (ingredientsRes.data ?? []).filter(
        (i: any) => i.current_stock < i.alert_threshold
    )

    return (
        <InventaireClient
            logs={(logsRes.data ?? []) as any}
            lowStockIngredients={lowStockIngredients}
        />
    )
}
