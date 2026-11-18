import { createClient } from '@/lib/supabase/server'
import StatCard from '@/components/ui/StatCard'
import AIAssistant from '@/components/dashboard/AIAssistant'
import DashboardNewOrderButton from '@/components/dashboard/DashboardNewOrderButton'
import DashboardPeriodFilter from '@/components/dashboard/DashboardPeriodFilter'
import TodoStrip from '@/components/dashboard/TodoStrip'
import ChartCard, { ChartEmpty } from '@/components/dashboard/charts/ChartCard'
import CumulativeRevenueChart from '@/components/dashboard/charts/CumulativeRevenueChart'
import PaymentDonut from '@/components/dashboard/charts/PaymentDonut'
import HourlySalesBars from '@/components/dashboard/charts/HourlySalesBars'
import TopProductsList from '@/components/dashboard/charts/TopProductsList'
import { ShoppingBag, Banknote, Receipt, TrendingDown, AlertTriangle, Clock, ChefHat, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import ProductionPlan from './ProductionPlan'
import VitrineSales from './VitrineSales'
import { loadManagerCharts } from './load-manager-charts'
import { Suspense } from 'react'
import SessionPill from '@/components/layout/SessionPill'

import { cookies } from 'next/headers'
import { getDailyStats } from '@/lib/actions/stats'
import { verifyKioskToken } from '@/lib/kiosk-token'

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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
    const resolvedSearchParams = await searchParams
    const supabase = await createClient()
    // 1. Get auth user and kiosk info
    const { data: { user } } = await supabase.auth.getUser()
    const cookieStore = await cookies()
    
    const kioskToken = cookieStore.get('kiosk_token')?.value
    const claims = kioskToken ? verifyKioskToken(kioskToken) : null
    const kioskUserId = claims?.userId

    if (!user && !kioskUserId) return null

    // 2. Resolve target profile (same logic as Layout)
    let adminProfile = null
    if (user) {
        const { data: p } = await supabase.from('profiles').select('*, organizations(*)').eq('id', user.id).single()
        adminProfile = p
    }

    let profile = adminProfile
    
    if (kioskUserId) {
        // En mode Kiosque, on utilise le client admin pour récupérer le profil de manière fiable
        // (surtout si le gérant s'est déconnecté et qu'il n'y a plus de session auth active)
        const { createClient: createAdminClient } = await import('@supabase/supabase-js')
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: kp } = await supabaseAdmin.from('profiles').select('*, organizations(*)').eq('id', kioskUserId).single()
        if (kp) profile = kp
    }

    if (!profile) return null

    const org = profile.organizations as { name: string; currency_symbol: string } | null
    const currency = org?.currency_symbol ?? ''

    const roleSlug = profile.role_slug?.toLowerCase() || ''
    const isManager = roleSlug === 'gerant' || roleSlug === 'super_admin'

    const period = resolvedSearchParams.period === 'week' || resolvedSearchParams.period === 'month' ? resolvedSearchParams.period : 'day'
    const startDate = computeStartDate(period)
    const clientFilter = (resolvedSearchParams.client ?? '').trim()
    const now = new Date()

    // Données parallèles
    const ordersQuery = supabase
        .from('orders')
        .select('id, order_number, total_amount, status, pickup_date, customer_name, deposit_amount, payment_status, reception_type')
        .eq('organization_id', profile.organization_id!)
        .is('deleted_at', null)
        .or(`pickup_date.gte.${startDate},status.in.(pending,production,ready,confirmed,in_preparation,awaiting_pickup)`)

    const filteredOrdersQuery = clientFilter
        ? ordersQuery.ilike('customer_name', `%${clientFilter}%`)
        : ordersQuery

    const [ordersRes, alertsRes, dailyStats, charts] = await Promise.all([
        filteredOrdersQuery,
        supabase.from('ingredients').select('name, current_stock, alert_threshold').eq('organization_id', profile.organization_id!),
        period === 'day' && !clientFilter ? getDailyStats(profile.organization_id!) : Promise.resolve({ ca_encaisse: null }),
        isManager ? loadManagerCharts(supabase, profile.organization_id!, startDate, now) : Promise.resolve(null),
    ])

    const orders = ordersRes.data ?? []
    const ingredients = alertsRes.data ?? []

    // Si on regarde la journée sans filtre client, la Source of Truth est le RPC (qui inclut commandes payées + caisse rapide).
    // Sinon, on fait la somme classique des commandes filtrées/période large.
    const totalSales = dailyStats.ca_encaisse !== null 
        ? dailyStats.ca_encaisse 
        : orders.filter(o => o.status === 'completed').reduce((s, o) => s + o.total_amount, 0)

    const pendingCount = orders.filter(o => ['pending', 'production', 'confirmed', 'in_preparation'].includes(o.status)).length
    const readyCount = orders.filter(o => ['ready', 'awaiting_pickup'].includes(o.status)).length
    
    const pendingDeposits = orders
        .filter(o => ['pending', 'production', 'ready', 'confirmed', 'in_preparation', 'awaiting_pickup'].includes(o.status))
        .reduce((sum, o) => sum + (o.deposit_amount || 0), 0)

    const alertCount = ingredients.filter(i => i.current_stock < i.alert_threshold).length

    // Nouvelles métriques sémantiques pour le POS
    const todayStr = now.toISOString().split('T')[0]
    const todayOrders = orders.filter(o => o.pickup_date?.substring(0, 10) === todayStr)
    const plannedPickupsCount = todayOrders.filter(o => o.status !== 'cancelled').length
    const completedPickupsCount = todayOrders.filter(o => o.status === 'completed').length

    const overdueCount = orders.filter(o => {
        const pickupDateStr = o.pickup_date?.substring(0, 10)
        return pickupDateStr && pickupDateStr < todayStr && ['pending', 'production', 'ready', 'confirmed', 'in_preparation', 'awaiting_pickup'].includes(o.status)
    }).length

    const periodLabel =
        period === 'week' ? '7 derniers jours' :
            period === 'month' ? '30 derniers jours' :
                'Aujourd\'hui'

    const updatedAt = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
    const chartsNote = clientFilter ? 'Graphes non filtrés par client' : undefined
    const deltaPct = charts && period === 'day' && !clientFilter ? charts.comparison.deltaPct : null
    const caTrend = deltaPct === null ? {} : {
        trend: (deltaPct >= 0 ? 'up' : 'down') as 'up' | 'down',
        trendLabel: `${deltaPct >= 0 ? '+' : ''}${deltaPct} % vs hier à la même heure`,
    }

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
                        Bonjour, {profile.full_name.split(' ')[0]}
                    </h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.9rem' }}>
                        {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        {org ? ` · ${org.name}` : ''}
                    </p>
                    {isManager && (
                        <p style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: '6px 0 0', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-success)' }}>
                            <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)' }} />
                            En direct · mis à jour à {updatedAt}
                        </p>
                    )}
                </div>
                {/* Pill session + Bouton Nouvelle Commande — visibles pour les rôles autorisés */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <SessionPill />
                    {(roleSlug === 'gerant' || roleSlug === 'vendeur' || roleSlug === 'super_admin') && (
                        <DashboardNewOrderButton organizationId={profile.organization_id!} currency={currency} />
                    )}
                </div>
            </div>

            {/* ── Gérant ── */}
            {isManager && charts && (
                <>
                    <div style={{ marginBottom: '16px' }}>
                        <DashboardPeriodFilter period={period} client={clientFilter} />
                    </div>

                    <TodoStrip
                        readyCount={readyCount}
                        overdueCount={overdueCount}
                        alertCount={alertCount}
                        pendingDeposits={pendingDeposits}
                        currency={currency}
                    />

                    <div className="dashboard-kpis">
                        <StatCard
                            title={`CA (${periodLabel})`}
                            value={`${totalSales.toLocaleString('fr-FR')} ${currency}`}
                            icon={Banknote} iconColor="var(--color-primary)" accent="var(--color-primary)"
                            {...caTrend}
                        />
                        <StatCard
                            title={`Encaissements (${periodLabel})`}
                            value={charts.sales.count}
                            subtitle={charts.sales.count > 0
                                ? `Panier moyen : ${Math.round(charts.sales.revenue / charts.sales.count).toLocaleString('fr-FR')} ${currency}`
                                : 'Aucun encaissement'}
                            icon={Receipt} iconColor="var(--color-primary)" accent="var(--color-primary)"
                        />
                        <StatCard
                            title="Retraits du jour"
                            value={plannedPickupsCount > 0 ? `${completedPickupsCount} sur ${plannedPickupsCount}` : '0'}
                            subtitle={plannedPickupsCount > 0 ? 'commandes retirées' : 'Aucun retrait prévu'}
                            icon={ShoppingBag} iconColor="var(--color-badge-success-accent)" accent="var(--color-badge-success-bg)"
                        />
                        <StatCard
                            title={`Pertes (${periodLabel})`}
                            value={charts.errors.waste ? '—' : `${Math.round(charts.waste.value).toLocaleString('fr-FR')} ${currency}`}
                            subtitle={charts.errors.waste
                                ? 'Données indisponibles'
                                : `${charts.waste.count} déclaration${charts.waste.count > 1 ? 's' : ''}${charts.waste.missingCost > 0 ? `, dont ${charts.waste.missingCost} sans coût renseigné` : ''}`}
                            icon={TrendingDown} iconColor="var(--color-error)" accent="var(--color-badge-danger-bg)"
                        />
                    </div>

                    <div className="dashboard-row dashboard-row-wide">
                        <ChartCard title="CA cumulé aujourd'hui" subtitle="Comparé à hier, heure par heure" note={chartsNote}>
                            {charts.errors.transactions
                                ? <ChartEmpty>Données indisponibles.</ChartEmpty>
                                : <CumulativeRevenueChart points={charts.cumulative} currency={currency} />}
                        </ChartCard>
                        <ChartCard title="Modes de règlement" subtitle={periodLabel} note={chartsNote}>
                            {charts.errors.transactions
                                ? <ChartEmpty>Données indisponibles.</ChartEmpty>
                                : <PaymentDonut slices={charts.paymentSlices} currency={currency} />}
                        </ChartCard>
                    </div>

                    <div className="dashboard-row dashboard-row-half">
                        <ChartCard title="Ventes par heure" subtitle="Aujourd'hui" note={chartsNote}>
                            {charts.errors.transactions
                                ? <ChartEmpty>Données indisponibles.</ChartEmpty>
                                : <HourlySalesBars buckets={charts.hourly} currentHour={now.getUTCHours()} currency={currency} />}
                        </ChartCard>
                        <ChartCard title="Top 5 produits" subtitle={periodLabel} note={chartsNote}>
                            {charts.errors.items
                                ? <ChartEmpty>Données indisponibles.</ChartEmpty>
                                : <TopProductsList products={charts.topProducts} currency={currency} />}
                        </ChartCard>
                    </div>

                    {/* Retraits & Livraisons du jour */}
                    <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                                    Retraits & Livraisons
                                </h3>
                                <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '4px 0 0' }}>
                                    Commandes prévues aujourd&apos;hui ({now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })})
                                </p>
                            </div>
                            <Link href="/commandes" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '2px', padding: '4px 8px', borderRadius: '6px', background: 'var(--color-well)' }}>
                                Tout voir <ArrowUpRight size={12} />
                            </Link>
                        </div>

                        {todayOrders.length === 0 ? (
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: 0 }}>
                                Aucun retrait ou livraison prévu aujourd&apos;hui.
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '280px', paddingRight: '4px' }}>
                                {todayOrders.map((o) => {
                                    // Calculer le style et label de statut
                                    let statusColor = 'var(--color-badge-warning-text)'
                                    let statusBg = 'var(--color-badge-warning-bg)'
                                    let statusText = 'En attente'
                                    if (o.status === 'production' || o.status === 'in_preparation') {
                                        statusColor = 'var(--color-badge-production-text)'
                                        statusBg = 'var(--color-badge-production-bg)'
                                        statusText = 'En cours'
                                    } else if (o.status === 'ready' || o.status === 'awaiting_pickup') {
                                        statusColor = 'var(--color-badge-success-text)'
                                        statusBg = 'var(--color-badge-success-bg)'
                                        statusText = 'Prête'
                                    } else if (o.status === 'completed' || o.status === 'delivered') {
                                        statusColor = 'var(--color-text)'
                                        statusBg = 'var(--color-well)'
                                        statusText = 'Retirée'
                                    } else if (o.status === 'cancelled') {
                                        statusColor = 'var(--color-badge-danger-text)'
                                        statusBg = 'var(--color-badge-danger-bg)'
                                        statusText = 'Annulée'
                                    }

                                    // Formatter l'heure de retrait (pickup_date)
                                    let timeStr = 'Non définie'
                                    if (o.pickup_date) {
                                        const d = new Date(o.pickup_date)
                                        if (!Number.isNaN(d.getTime())) {
                                            timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                                        }
                                    }

                                    return (
                                        <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--color-well)', borderRadius: 'var(--radius-sm)', gap: '12px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', fontWeight: 600 }}>
                                                        {o.order_number || `#${o.id.substring(0, 6)}`}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: o.reception_type === 'livraison' ? '#E0F2FE' : '#F3E8FF', color: o.reception_type === 'livraison' ? '#0369A1' : '#6B21A8', textTransform: 'capitalize' }}>
                                                        {o.reception_type || 'Retrait'}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {o.customer_name}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                                                        {o.total_amount.toLocaleString('fr-FR')} {currency}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 500 }}>
                                                        à {timeStr}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: statusColor, background: statusBg, padding: '4px 8px', borderRadius: '9999px', minWidth: '70px', textAlign: 'center' }}>
                                                    {statusText}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <AIAssistant currency={currency} organizationId={profile.organization_id!} />
                </>
            )}

            {/* ── Vendeur ── */}
            {roleSlug === 'vendeur' && (
                <>
                    <div className="metrics-carousel" style={{ display: 'flex', gap: '16px', marginBottom: '28px', overflowX: 'auto', paddingBottom: '12px', scrollSnapType: 'x mandatory' }}>
                        <StatCard title={`Commandes (${periodLabel})`} value={orders.length} icon={ShoppingBag} iconColor="var(--color-rose-dark)" accent="#E8B4A0" style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
                        <StatCard title="En attente" value={pendingCount} icon={Clock} iconColor="#E6A817" accent="var(--color-badge-warning-bg)" style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <Link href="/commandes" prefetch={true} className="btn-secondary">
                            Voir toutes les commandes
                        </Link>
                    </div>

                    <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center' }}>Chargement de la vitrine...</div>}>
                        <VitrineSales organizationId={profile.organization_id!} currency={currency} />
                    </Suspense>
                </>
            )}

            {/* ── Pâtissier ── */}
            {roleSlug === 'patissier' && (
                <>
                    <div className="metrics-carousel" style={{ display: 'flex', gap: '16px', marginBottom: '28px', overflowX: 'auto', paddingBottom: '12px', scrollSnapType: 'x mandatory' }}>
                        <StatCard title="À produire" value={pendingCount} icon={ChefHat} iconColor="#9CB8A0" accent="var(--color-badge-success-bg)" subtitle="commandes à traiter" style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
                        <StatCard title="Alertes stock" value={alertCount} icon={AlertTriangle} iconColor={alertCount > 0 ? 'var(--color-error)' : 'var(--color-success)'} accent={alertCount > 0 ? 'var(--color-badge-danger-bg)' : 'var(--color-badge-success-bg)'} style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <Link href="/inventaire" prefetch={true} className="btn-primary">
                            <ChefHat size={18} />
                            Déclarer une perte
                        </Link>
                    </div>

                    <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center' }}>Chargement du plan de production...</div>}>
                        <ProductionPlan organizationId={profile.organization_id!} startDate={startDate} />
                    </Suspense>
                </>
            )}

            <style>{`
                .metrics-carousel::-webkit-scrollbar {
                    display: none;
                }
                .metrics-carousel {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .dashboard-kpis {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 16px;
                    margin-bottom: 24px;
                }
                .dashboard-row {
                    display: grid;
                    gap: 24px;
                    margin-bottom: 24px;
                }
                .dashboard-row-wide {
                    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
                }
                .dashboard-row-half {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                @media (max-width: 1100px) {
                    .dashboard-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                }
                @media (max-width: 900px) {
                    .dashboard-row-wide,
                    .dashboard-row-half { grid-template-columns: minmax(0, 1fr); }
                }
                @media (max-width: 480px) {
                    .dashboard-kpis { gap: 10px; }
                    .dashboard-kpis .card { padding: 16px !important; }
                    .dashboard-kpis h3 { font-size: 1.25rem !important; overflow-wrap: anywhere; }
                }
            `}</style>
        </div>
    )
}
