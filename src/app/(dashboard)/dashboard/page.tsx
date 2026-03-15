import { createClient } from '@/lib/supabase/server'
import StatCard from '@/components/ui/StatCard'
import AIAssistant from '@/components/dashboard/AIAssistant'
import { ShoppingBag, Euro, TrendingUp, AlertTriangle, Clock, ChefHat } from 'lucide-react'
import Link from 'next/link'

interface DashboardSearchParams {
    period?: string
    client?: string
}

function computeStartDate(period: string | undefined): string {
    const now = new Date()
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    if (period === 'week') {
        base.setDate(base.getDate() - 7)
    } else if (period === 'month') {
        base.setDate(base.getDate() - 30)
    }

    return base.toISOString().split('T')[0]
}

export default async function DashboardPage({ searchParams }: { searchParams: DashboardSearchParams }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase.from('profiles').select('*, organizations(*)').eq('id', user.id).single()
    if (!profile) return null

    const org = profile.organizations as { name: string; currency_symbol: string } | null
    const currency = org?.currency_symbol ?? 'FCFA'

    const period = searchParams.period === 'week' || searchParams.period === 'month' ? searchParams.period : 'day'
    const startDate = computeStartDate(period)
    const clientFilter = (searchParams.client ?? '').trim()

    // Données parallèles
    const ordersQuery = supabase
        .from('orders')
        .select('total_amount, status, pickup_date, customer_name')
        .eq('organization_id', profile.organization_id!)
        .gte('pickup_date', startDate)

    const filteredOrdersQuery = clientFilter
        ? ordersQuery.ilike('customer_name', `%${clientFilter}%`)
        : ordersQuery

    const [ordersRes, alertsRes, logsRes] = await Promise.all([
        filteredOrdersQuery,
        supabase.from('ingredients').select('name, current_stock, alert_threshold').eq('organization_id', profile.organization_id!),
        supabase.from('inventory_logs').select('quantity_change, reason').eq('organization_id', profile.organization_id!).gte('log_date', startDate + 'T00:00:00'),
    ])

    const orders = ordersRes.data ?? []
    const ingredients = alertsRes.data ?? []
    const logs = logsRes.data ?? []

    const totalSales = orders.reduce((s, o) => s + o.total_amount, 0)
    const pendingCount = orders.filter(o => o.status === 'pending' || o.status === 'production').length
    const alertCount = ingredients.filter(i => i.current_stock < i.alert_threshold).length
    const wasteTotal = logs.filter(l => l.reason === 'waste').reduce((s, l) => s + Math.abs(l.quantity_change), 0)

    const roleSlug = profile.role_slug

    const periodLabel =
        period === 'week' ? '7 derniers jours' :
            period === 'month' ? '30 derniers jours' :
                'Aujourd\'hui'

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div style={{ marginBottom: '16px' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
                    Bonjour, {profile.full_name.split(' ')[0]} 👋
                </h1>
                <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.9rem' }}>
                    {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {org ? ` · ${org.name}` : ''}
                </p>
            </div>

            {/* Filtres période / client pour gérant & super_admin */}
            {(roleSlug === 'gerant' || roleSlug === 'super_admin') && (
                <form method="GET" style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                        name="period"
                        defaultValue={period}
                        className="input"
                        style={{ maxWidth: '170px' }}
                    >
                        <option value="day">Aujourd&apos;hui</option>
                        <option value="week">7 derniers jours</option>
                        <option value="month">30 derniers jours</option>
                    </select>
                    <input
                        name="client"
                        defaultValue={clientFilter}
                        className="input"
                        placeholder="Filtrer par nom client"
                        style={{ maxWidth: '220px' }}
                    />
                    <button type="submit" className="btn-secondary" style={{ minHeight: '36px' }}>
                        Filtrer
                    </button>
                </form>
            )}

            {/* ── Gérant ── */}
            {(roleSlug === 'gerant' || roleSlug === 'super_admin') && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <StatCard
                            title={`CA (${periodLabel})`}
                            value={`${totalSales.toLocaleString('fr-FR')} ${currency}`}
                            icon={Euro} iconColor="#C78A4A" accent="#F5DDB0"
                            trend="up" trendLabel={periodLabel}
                        />
                        <StatCard
                            title="Commandes actives"
                            value={pendingCount}
                            subtitle="en cours"
                            icon={ShoppingBag} iconColor="#C4836A" accent="#E8B4A0"
                        />
                        <StatCard
                            title="Alertes stock"
                            value={alertCount}
                            subtitle={alertCount > 0 ? 'ingrédients sous le seuil' : 'Tout est OK'}
                            icon={AlertTriangle}
                            iconColor={alertCount > 0 ? '#D94F38' : '#4C9E6A'}
                            accent={alertCount > 0 ? '#FEE2E2' : '#D1FAE5'}
                            trend={alertCount > 0 ? 'down' : 'neutral'}
                        />
                        <StatCard
                            title="Pertes"
                            value={wasteTotal.toFixed(2)}
                            subtitle={periodLabel}
                            icon={TrendingUp} iconColor="#9CB8A0" accent="#D1FAE5"
                        />
                    </div>

                    {alertCount > 0 && (
                        <div className="animate-fade-in" style={{
                            background: '#FEF2F2', border: '1.5px solid #FECACA',
                            borderRadius: 'var(--radius-md)', padding: '12px 16px',
                            display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px',
                        }}>
                            <AlertTriangle size={18} color="#D94F38" />
                            <span style={{ fontSize: '0.875rem', color: '#991B1B', fontWeight: 500 }}>
                                {alertCount} ingrédient{alertCount > 1 ? 's' : ''} sous le seuil d&apos;alerte.{' '}
                                <Link href="/ingredients" style={{ fontWeight: 700, textDecoration: 'underline' }}>Voir l&apos;inventaire →</Link>
                            </span>
                        </div>
                    )}

                    <AIAssistant currency={currency} organizationId={profile.organization_id!} />
                </>
            )}

            {/* ── Vendeur ── */}
            {roleSlug === 'vendeur' && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                        <StatCard title={`Commandes (${periodLabel})`} value={orders.length} icon={ShoppingBag} iconColor="#C4836A" accent="#E8B4A0" />
                        <StatCard title="En attente" value={pendingCount} icon={Clock} iconColor="#E6A817" accent="#FEF3C7" />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <Link href="/commandes" className="btn-primary">
                            <ShoppingBag size={18} />
                            Nouvelle commande
                        </Link>
                        <Link href="/commandes" className="btn-secondary">
                            Voir toutes les commandes
                        </Link>
                    </div>
                </>
            )}

            {/* ── Pâtissier ── */}
            {roleSlug === 'patissier' && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                        <StatCard title="À produire" value={pendingCount} icon={ChefHat} iconColor="#9CB8A0" accent="#D1FAE5" subtitle="commandes à traiter" />
                        <StatCard title="Alertes stock" value={alertCount} icon={AlertTriangle} iconColor={alertCount > 0 ? '#D94F38' : '#4C9E6A'} accent={alertCount > 0 ? '#FEE2E2' : '#D1FAE5'} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <Link href="/inventaire" className="btn-primary">
                            <ChefHat size={18} />
                            Déclarer une perte
                        </Link>
                    </div>
                </>
            )}
        </div>
    )
}
