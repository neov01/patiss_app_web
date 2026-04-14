import { createClient } from '@/lib/supabase/server'
import { ClipboardList } from 'lucide-react'
import StockMovementModal from '@/components/inventory/StockMovementModal'
import Pagination from '@/components/ui/Pagination'

const PAGE_SIZE = 20

export default async function InventairePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
    const { page: pageParam } = await searchParams
    const currentPage = Number(pageParam) || 1
    const from = (currentPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()

    const [logsRes, ingredientsRes] = await Promise.all([
        supabase.from('inventory_logs')
            .select('*, ingredients(name, unit), profiles(full_name)', { count: 'exact' })
            .eq('organization_id', profile?.organization_id!)
            .order('log_date', { ascending: false })
            .range(from, to),
        supabase.from('ingredients').select('id, name').eq('organization_id', profile?.organization_id!).order('name'),
    ])

    const totalCount = logsRes.count || 0
    const REASON_LABELS: Record<string, string> = {
        production: '👨‍🍳 Production', waste: '🗑 Perte', purchase: '🛒 Achat', adjustment: '⚖ Ajustement',
    }
    const REASON_COLORS: Record<string, string> = {
        production: '#DBEAFE', waste: '#FEE2E2', purchase: '#D1FAE5', adjustment: '#FEF3C7',
    }

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Inventaire</h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                        {totalCount} mouvement{totalCount > 1 ? 's' : ''} au total
                    </p>
                </div>
                {/* Shortcut pour déclarer depuis cette page */}
                {ingredientsRes.data && ingredientsRes.data.length > 0 && (
                    <StockMovementModal ingredientId={ingredientsRes.data[0].id} ingredientName="un ingrédient" />
                )}
            </div>

            {!logsRes.data || logsRes.data.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                    <ClipboardList size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Aucun mouvement de stock</p>
                    <p style={{ fontSize: '0.875rem', margin: 0 }}>Les entrées/sorties apparaîtront ici dès qu&apos;un mouvement est déclaré.</p>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-cream)', borderBottom: '1.5px solid var(--color-border)' }}>
                                    {['Date', 'Ingrédient', 'Type', 'Quantité', 'Par'].map(h => (
                                        <th key={h} style={{ padding: '12px 16px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(logsRes.data as unknown as Array<{
                                    id: string
                                    log_date: string | null
                                    quantity_change: number
                                    reason: string
                                    ingredients: { name: string; unit: string } | null
                                    profiles: { full_name: string } | null
                                }>).map((log, i) => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)', background: i % 2 === 0 ? 'white' : 'var(--color-cream)' }}>
                                        <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                                            {log.log_date ? new Date(log.log_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                        <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: '0.875rem' }}>
                                            {log.ingredients?.name ?? '—'}
                                        </td>
                                        <td style={{ padding: '10px 16px' }}>
                                            <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 600, background: REASON_COLORS[log.reason] ?? '#F3F4F6' }}>
                                                {REASON_LABELS[log.reason] ?? log.reason}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 16px', fontWeight: 700, color: log.quantity_change >= 0 ? '#4C9E6A' : '#D94F38', fontSize: '0.9rem' }}>
                                            {log.quantity_change >= 0 ? '+' : ''}{log.quantity_change} {log.ingredients?.unit ?? ''}
                                        </td>
                                        <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                                            {log.profiles?.full_name ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            <Pagination totalCount={totalCount} pageSize={PAGE_SIZE} />
        </div>
    )
}
