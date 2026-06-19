import { createClient } from '@/lib/supabase/server'
import StatCard from '@/components/ui/StatCard'
import AIAssistant from '@/components/dashboard/AIAssistant'
import DashboardNewOrderButton from '@/components/dashboard/DashboardNewOrderButton'
import { ShoppingBag, Euro, TrendingUp, AlertTriangle, Clock, ChefHat, ArrowUpRight, Calendar } from 'lucide-react'
import Link from 'next/link'
import ProductionPlan from './ProductionPlan'
import VitrineSales from './VitrineSales'
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

    const period = resolvedSearchParams.period === 'week' || resolvedSearchParams.period === 'month' ? resolvedSearchParams.period : 'day'
    const startDate = computeStartDate(period)
    const clientFilter = (resolvedSearchParams.client ?? '').trim()

    // Données parallèles
    const ordersQuery = supabase
        .from('orders')
        .select('id, order_number, total_amount, status, pickup_date, customer_name, deposit_amount, payment_status, reception_type')
        .eq('organization_id', profile.organization_id!)
        .or(`pickup_date.gte.${startDate},status.in.(pending,production,ready,confirmed,in_preparation,awaiting_pickup)`)

    const filteredOrdersQuery = clientFilter
        ? ordersQuery.ilike('customer_name', `%${clientFilter}%`)
        : ordersQuery

    const [ordersRes, alertsRes, logsRes, dailyStats, transactionsRes] = await Promise.all([
        filteredOrdersQuery,
        supabase.from('ingredients').select('name, current_stock, alert_threshold').eq('organization_id', profile.organization_id!),
        supabase.from('inventory_logs').select('quantity_change, reason').eq('organization_id', profile.organization_id!).gte('log_date', startDate + 'T00:00:00'),
        period === 'day' && !clientFilter ? getDailyStats(profile.organization_id!) : Promise.resolve({ ca_encaisse: null }),
        supabase.from('transactions').select('amount, payment_method, created_at').eq('organization_id', profile.organization_id!).gte('created_at', startDate + 'T00:00:00')
    ])

    const orders = ordersRes.data ?? []
    const ingredients = alertsRes.data ?? []
    const logs = logsRes.data ?? []
    const transactions = transactionsRes?.data ?? []

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
    const wasteTotal = logs.filter(l => l.reason === 'waste').reduce((s, l) => s + Math.abs(l.quantity_change), 0)

    // Nouvelles métriques sémantiques pour le POS
    const todayStr = new Date().toISOString().split('T')[0]
    const todayOrders = orders.filter(o => o.pickup_date?.substring(0, 10) === todayStr)
    const plannedPickupsCount = todayOrders.filter(o => o.status !== 'cancelled').length
    const completedPickupsCount = todayOrders.filter(o => o.status === 'completed').length

    const overdueCount = orders.filter(o => {
        const pickupDateStr = o.pickup_date?.substring(0, 10)
        return pickupDateStr && pickupDateStr < todayStr && ['pending', 'production', 'ready', 'confirmed', 'in_preparation', 'awaiting_pickup'].includes(o.status)
    }).length

    // Répartition des modes de paiement
    const paymentMethodStats = transactions.reduce((acc, t) => {
        const method = t.payment_method || 'Autre'
        acc[method] = (acc[method] || 0) + t.amount
        return acc
    }, {} as Record<string, number>)

    const totalTransactionAmount = Object.values(paymentMethodStats).reduce((sum, val) => sum + val, 0)
    const sortedMethods = Object.entries(paymentMethodStats).sort((a, b) => b[1] - a[1])

    const roleSlug = profile.role_slug?.toLowerCase() || ''

    const periodLabel =
        period === 'week' ? '7 derniers jours' :
            period === 'month' ? '30 derniers jours' :
                'Aujourd\'hui'

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
                        Bonjour, {profile.full_name.split(' ')[0]} 👋
                    </h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.9rem' }}>
                        {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        {org ? ` · ${org.name}` : ''}
                    </p>
                </div>
                {/* Pill session + Bouton Nouvelle Commande — visibles pour les rôles autorisés */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <SessionPill />
                    {(roleSlug === 'gerant' || roleSlug === 'vendeur' || roleSlug === 'super_admin') && (
                        <DashboardNewOrderButton organizationId={profile.organization_id!} currency={currency} />
                    )}
                </div>
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
                    {/* Grille responsive des indicateurs clés */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <StatCard
                            title={`CA (${periodLabel})`}
                            value={`${totalSales.toLocaleString('fr-FR')} ${currency}`}
                            icon={Euro} iconColor="#C78A4A" accent="#F5DDB0"
                            trend="up" trendLabel={periodLabel}
                        />
                        <StatCard
                            title="Retraits du jour"
                            value={`${completedPickupsCount} / ${plannedPickupsCount}`}
                            subtitle="commandes récupérées"
                            icon={ShoppingBag} iconColor="#10B981" accent="#D1FAE5"
                            trend={completedPickupsCount === plannedPickupsCount && plannedPickupsCount > 0 ? 'up' : 'neutral'}
                        />
                        <StatCard
                            title="Retards de retrait"
                            value={overdueCount}
                            subtitle={overdueCount > 0 ? "commandes non récupérées" : "Aucun retard"}
                            icon={Clock} 
                            iconColor={overdueCount > 0 ? '#D94F38' : '#4C9E6A'} 
                            accent={overdueCount > 0 ? '#FEE2E2' : '#D1FAE5'}
                            trend={overdueCount > 0 ? 'down' : 'neutral'}
                        />
                        <StatCard
                            title="Alertes stock"
                            value={alertCount}
                            subtitle={alertCount > 0 ? `${alertCount} ingrédient(s) sous le seuil` : 'Tout est OK'}
                            icon={AlertTriangle}
                            iconColor={alertCount > 0 ? '#D94F38' : '#4C9E6A'}
                            accent={alertCount > 0 ? '#FEE2E2' : '#D1FAE5'}
                            trend={alertCount > 0 ? 'down' : 'neutral'}
                        />
                        <StatCard
                            title="Pertes"
                            value={`${wasteTotal.toFixed(1)}`}
                            subtitle={`kg enregistrés (${periodLabel})`}
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
                                <Link href="/ingredients" prefetch={true} style={{ fontWeight: 700, textDecoration: 'underline' }}>Voir l&apos;inventaire →</Link>
                            </span>
                        </div>
                    )}

                    {/* Section de widgets en grille 2 colonnes */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '24px' }}>
                        {/* Widget de gauche : Répartition des modes de paiement */}
                        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                                    Modes de règlement
                                </h3>
                                <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '4px 0 0' }}>
                                    Répartition des encaissements sur la période ({periodLabel})
                                </p>
                            </div>

                            {sortedMethods.length === 0 ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center' }}>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                                        Aucune transaction enregistrée sur cette période
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', flex: 1 }}>
                                    {sortedMethods.map(([method, amount]) => {
                                        const pct = totalTransactionAmount > 0 ? (amount / totalTransactionAmount) * 100 : 0
                                        
                                        // Déterminer la couleur de la barre sémantiquement
                                        let barColor = 'var(--color-primary)'
                                        if (method.includes('Orange')) barColor = '#EA580C' // Orange sémantique
                                        if (method.includes('Wave')) barColor = '#1D93D2' // Wave sémantique
                                        if (method.includes('MTN') || method.includes('MOMO')) barColor = '#F2C822' // MTN sémantique
                                        if (method.includes('Moov')) barColor = '#009F4D' // Moov sémantique

                                        return (
                                            <div key={method} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{method}</span>
                                                    <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                                                        {amount.toLocaleString('fr-FR')} {currency} <span style={{ fontWeight: 500, color: 'var(--color-muted)', fontSize: '0.75rem', marginLeft: '4px' }}>({pct.toFixed(0)}%)</span>
                                                    </span>
                                                </div>
                                                <div style={{ width: '100%', height: '8px', background: 'var(--color-surface-variant)', borderRadius: '9999px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '9999px', transition: 'width 0.4s ease' }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                    <div style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>Volume total encaissé</span>
                                        <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)' }}>
                                            {totalTransactionAmount.toLocaleString('fr-FR')} {currency}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Widget de droite : Retraits de la journée */}
                        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                                        Retraits & Livraisons
                                    </h3>
                                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '4px 0 0' }}>
                                        Commandes prévues aujourd&apos;hui ({new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })})
                                    </p>
                                </div>
                                <Link href="/commandes" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '2px', padding: '4px 8px', borderRadius: '6px', background: 'var(--color-well)' }}>
                                    Tout voir <ArrowUpRight size={12} />
                                </Link>
                            </div>

                            {todayOrders.length === 0 ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center' }}>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                                        Aucun retrait ou livraison prévu pour aujourd&apos;hui
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '280px', paddingRight: '4px' }}>
                                    {todayOrders.map((o) => {
                                        // Calculer le style et label de statut
                                        let statusColor = '#92400E'
                                        let statusBg = '#FEF3C7'
                                        let statusText = 'En attente'
                                        if (o.status === 'production' || o.status === 'in_preparation') {
                                            statusColor = '#1E40AF'
                                            statusBg = '#DBEAFE'
                                            statusText = 'En cours'
                                        } else if (o.status === 'ready' || o.status === 'awaiting_pickup') {
                                            statusColor = '#065F46'
                                            statusBg = '#D1FAE5'
                                            statusText = 'Prête'
                                        } else if (o.status === 'completed' || o.status === 'delivered') {
                                            statusColor = '#374151'
                                            statusBg = '#F3F4F6'
                                            statusText = 'Retirée'
                                        } else if (o.status === 'cancelled') {
                                            statusColor = '#991B1B'
                                            statusBg = '#FEE2E2'
                                            statusText = 'Annulée'
                                        } else if (o.status === 'confirmed' || o.status === 'pending') {
                                            statusColor = '#92400E'
                                            statusBg = '#FEF3C7'
                                            statusText = 'En attente'
                                        }

                                        // Formatter l'heure de retrait (pickup_date)
                                        let timeStr = 'Non définie'
                                        if (o.pickup_date) {
                                            try {
                                                const d = new Date(o.pickup_date)
                                                timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                                            } catch (e) {}
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
                                                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
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
                    </div>

                    <AIAssistant currency={currency} organizationId={profile.organization_id!} />
                </>
            )}

            {/* ── Vendeur ── */}
            {roleSlug === 'vendeur' && (
                <>
                    <div className="metrics-carousel" style={{ display: 'flex', gap: '16px', marginBottom: '28px', overflowX: 'auto', paddingBottom: '12px', scrollSnapType: 'x mandatory' }}>
                        <StatCard title={`Commandes (${periodLabel})`} value={orders.length} icon={ShoppingBag} iconColor="var(--color-rose-dark)" accent="#E8B4A0" style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
                        <StatCard title="En attente" value={pendingCount} icon={Clock} iconColor="#E6A817" accent="#FEF3C7" style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
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
                        <StatCard title="À produire" value={pendingCount} icon={ChefHat} iconColor="#9CB8A0" accent="#D1FAE5" subtitle="commandes à traiter" style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
                        <StatCard title="Alertes stock" value={alertCount} icon={AlertTriangle} iconColor={alertCount > 0 ? '#D94F38' : '#4C9E6A'} accent={alertCount > 0 ? '#FEE2E2' : '#D1FAE5'} style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
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
            `}</style>
        </div>
    )
}
