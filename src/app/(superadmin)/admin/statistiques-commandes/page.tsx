import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BarChart3, Clock3, MousePointerClick, Store, UserRoundCheck } from 'lucide-react'
import { subDays } from 'date-fns'

type MetricRow = {
    id: string
    organization_id: string
    order_id: string
    created_by: string | null
    started_at: string
    completed_at: string
    duration_seconds: number
    created_at: string
}

type OrgRow = {
    id: string
    name: string
}

type ProfileRow = {
    id: string
    full_name: string
    role_slug: string
    organization_id: string | null
}

function formatDuration(seconds: number) {
    if (!Number.isFinite(seconds)) return '0s'
    const rounded = Math.max(0, Math.round(seconds))
    const minutes = Math.floor(rounded / 60)
    const rest = rounded % 60
    if (minutes === 0) return `${rest}s`
    return `${minutes}min ${String(rest).padStart(2, '0')}s`
}

function average(values: number[]) {
    if (values.length === 0) return 0
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]) {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function percentile(values: number[], p: number) {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.min(sorted.length - 1, Math.max(0, index))]
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
    return items.reduce<Record<string, T[]>>((acc, item) => {
        const key = getKey(item)
        acc[key] = acc[key] ?? []
        acc[key].push(item)
        return acc
    }, {})
}

function buildLeaderboard(
    metrics: MetricRow[],
    labels: Record<string, string>,
    getKey: (metric: MetricRow) => string | null,
) {
    return Object.entries(groupBy(metrics.filter(m => getKey(m)), m => getKey(m)!))
        .map(([id, rows]) => {
            const values = rows.map(r => r.duration_seconds)
            return {
                id,
                label: labels[id] ?? 'Inconnu',
                count: rows.length,
                avg: average(values),
                median: median(values),
            }
        })
        .sort((a, b) => b.count - a.count || a.avg - b.avg)
}

function StatCard({
    icon: Icon,
    label,
    value,
    note,
}: {
    icon: typeof Clock3
    label: string
    value: string
    note: string
}) {
    return (
        <div style={{
            background: 'linear-gradient(145deg, #FFFFFF 0%, #FFF7F1 100%)',
            border: '1px solid #F0E2D8',
            borderRadius: '24px',
            padding: '20px',
            boxShadow: '0 18px 50px rgba(72, 39, 17, 0.07)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{
                    width: 42,
                    height: 42,
                    borderRadius: '15px',
                    background: 'var(--color-text)',
                    color: '#F8D6C2',
                    display: 'grid',
                    placeItems: 'center',
                }}>
                    <Icon size={20} />
                </div>
                <span style={{ color: '#8E6B55', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {label}
                </span>
            </div>
            <p style={{ margin: 0, color: 'var(--color-text)', fontSize: '2rem', fontWeight: 950, lineHeight: 1 }}>{value}</p>
            <p style={{ margin: '10px 0 0', color: 'var(--color-muted)', fontSize: '0.9rem', fontWeight: 650 }}>{note}</p>
        </div>
    )
}

function LeaderboardTable({
    title,
    rows,
    emptyLabel,
}: {
    title: string
    rows: ReturnType<typeof buildLeaderboard>
    emptyLabel: string
}) {
    return (
        <section style={{
            background: '#FFFFFF',
            border: '1px solid #F0E2D8',
            borderRadius: '24px',
            overflow: 'hidden',
            boxShadow: '0 18px 50px rgba(72, 39, 17, 0.06)',
        }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #F4E8DF' }}>
                <h2 style={{ margin: 0, color: 'var(--color-text)', fontSize: '1rem', fontWeight: 900 }}>{title}</h2>
            </div>
            {rows.length === 0 ? (
                <p style={{ margin: 0, padding: '24px', color: 'var(--color-muted)', fontWeight: 700 }}>{emptyLabel}</p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                        <thead>
                            <tr style={{ background: '#FFF8F3', color: '#8E6B55', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <th style={{ textAlign: 'left', padding: '12px 18px' }}>Nom</th>
                                <th style={{ textAlign: 'right', padding: '12px 18px' }}>Commandes</th>
                                <th style={{ textAlign: 'right', padding: '12px 18px' }}>Moyenne</th>
                                <th style={{ textAlign: 'right', padding: '12px 18px' }}>Médiane</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.slice(0, 12).map(row => (
                                <tr key={row.id} style={{ borderTop: '1px solid #F4E8DF' }}>
                                    <td style={{ padding: '14px 18px', fontWeight: 850, color: 'var(--color-text)' }}>{row.label}</td>
                                    <td style={{ padding: '14px 18px', textAlign: 'right', color: '#6B4A38', fontWeight: 750 }}>{row.count}</td>
                                    <td style={{ padding: '14px 18px', textAlign: 'right', color: '#6B4A38', fontWeight: 750 }}>{formatDuration(row.avg)}</td>
                                    <td style={{ padding: '14px 18px', textAlign: 'right', color: '#6B4A38', fontWeight: 750 }}>{formatDuration(row.median)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}

export default async function OrderCreationStatsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role_slug')
        .eq('id', user.id)
        .single()

    if (!profile || profile.role_slug !== 'super_admin') redirect('/dashboard')

    const startDate = subDays(new Date(), 30).toISOString()

    const [{ data: metricsData }, { data: orgsData }, { data: profilesData }] = await Promise.all([
        supabase
            .from('order_creation_metrics')
            .select('id, organization_id, order_id, created_by, started_at, completed_at, duration_seconds, created_at')
            .gte('created_at', startDate)
            .order('created_at', { ascending: false }),
        supabase
            .from('organizations')
            .select('id, name')
            .order('name'),
        supabase
            .from('profiles')
            .select('id, full_name, role_slug, organization_id'),
    ])

    const metrics = (metricsData ?? []) as MetricRow[]
    const orgs = (orgsData ?? []) as OrgRow[]
    const profiles = (profilesData ?? []) as ProfileRow[]
    const durations = metrics.map(m => m.duration_seconds)
    const orgLabels = Object.fromEntries(orgs.map(org => [org.id, org.name]))
    const profileLabels = Object.fromEntries(profiles.map(profile => [
        profile.id,
        `${profile.full_name} (${profile.role_slug})`,
    ]))
    const byOrg = buildLeaderboard(metrics, orgLabels, metric => metric.organization_id)
    const byUser = buildLeaderboard(metrics, profileLabels, metric => metric.created_by)
    const maxDuration = durations.length ? Math.max(...durations) : 0
    const minDuration = durations.length ? Math.min(...durations) : 0

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <header style={{
                background: 'radial-gradient(circle at top left, #FFE1C8 0%, transparent 34%), linear-gradient(135deg, var(--color-text) 0%, #6B3E20 100%)',
                borderRadius: '30px',
                padding: '28px',
                color: 'white',
                position: 'relative',
                overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute',
                    right: -48,
                    top: -40,
                    width: 180,
                    height: 180,
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.08)',
                }} />
                <div style={{ position: 'relative', zIndex: 1, maxWidth: 820 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '16px', background: 'rgba(255,255,255,0.14)', display: 'grid', placeItems: 'center' }}>
                            <Clock3 size={22} color="#FFD5B8" />
                        </div>
                        <span style={{ color: '#FFD5B8', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.78rem' }}>
                            Statistiques de saisie
                        </span>
                    </div>
                    <h1 style={{ margin: 0, fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 950, letterSpacing: '-0.04em' }}>
                        Temps moyen de création des commandes
                    </h1>
                    <p style={{ margin: '12px 0 0', color: '#F8D6C2', fontSize: '1rem', fontWeight: 650, lineHeight: 1.6 }}>
                        Mesure depuis l&apos;ouverture du formulaire “Nouvelle commande” jusqu&apos;à une validation réussie. Les annulations, fermetures et clics dans l&apos;espace vide ne sont pas comptabilisés.
                    </p>
                </div>
            </header>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
                <StatCard icon={MousePointerClick} label="Commandes mesurées" value={`${metrics.length}`} note="Sur les 30 derniers jours" />
                <StatCard icon={Clock3} label="Temps moyen" value={formatDuration(average(durations))} note="Durée moyenne de saisie" />
                <StatCard icon={BarChart3} label="Temps médian" value={formatDuration(median(durations))} note="Plus robuste que la moyenne" />
                <StatCard icon={UserRoundCheck} label="P90" value={formatDuration(percentile(durations, 90))} note="90% des commandes sous ce temps" />
            </section>

            <section style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
            }}>
                <div style={{ background: '#FFF8F3', border: '1px solid #F0E2D8', borderRadius: '20px', padding: '18px' }}>
                    <p style={{ margin: 0, color: '#8E6B55', fontWeight: 850 }}>Plus rapide</p>
                    <strong style={{ display: 'block', marginTop: 6, color: 'var(--color-text)', fontSize: '1.4rem' }}>{formatDuration(minDuration)}</strong>
                </div>
                <div style={{ background: '#FFF8F3', border: '1px solid #F0E2D8', borderRadius: '20px', padding: '18px' }}>
                    <p style={{ margin: 0, color: '#8E6B55', fontWeight: 850 }}>Plus long</p>
                    <strong style={{ display: 'block', marginTop: 6, color: 'var(--color-text)', fontSize: '1.4rem' }}>{formatDuration(maxDuration)}</strong>
                </div>
                <div style={{ background: '#FFF8F3', border: '1px solid #F0E2D8', borderRadius: '20px', padding: '18px' }}>
                    <p style={{ margin: 0, color: '#8E6B55', fontWeight: 850 }}>Pâtisseries actives</p>
                    <strong style={{ display: 'block', marginTop: 6, color: 'var(--color-text)', fontSize: '1.4rem' }}>{byOrg.length}</strong>
                </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
                <LeaderboardTable
                    title="Par pâtisserie"
                    rows={byOrg}
                    emptyLabel="Aucune commande mesurée pour le moment."
                />
                <LeaderboardTable
                    title="Par vendeur / utilisateur"
                    rows={byUser}
                    emptyLabel="Aucun utilisateur mesuré pour le moment."
                />
            </div>

            <section style={{
                background: 'var(--color-text)',
                color: '#F8D6C2',
                borderRadius: '24px',
                padding: '20px',
                display: 'flex',
                gap: '14px',
                alignItems: 'flex-start',
            }}>
                <Store size={22} style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontWeight: 700, lineHeight: 1.6 }}>
                    Note : cette version mesure uniquement les commandes validées. Si tu veux aussi connaître le taux d&apos;abandon, on pourra ajouter une deuxième table d&apos;événements pour compter les ouvertures qui finissent par Annuler, croix ou clic hors modal.
                </p>
            </section>
        </div>
    )
}
