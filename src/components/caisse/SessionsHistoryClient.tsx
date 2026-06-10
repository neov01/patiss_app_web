'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { 
    Clock, Search, ArrowLeft, User, DollarSign, Calendar, X, Info, TrendingUp, ShoppingBag, AlertTriangle, CheckCircle2 
} from 'lucide-react'

interface ProfileSummary {
    full_name: string
    role_slug: string
}

interface Session {
    id: string
    organization_id: string
    status: string
    opened_at: string
    closed_at: string | null
    opened_by: string | null
    closed_by: string | null
    total_cash: number | null
    total_mobile_money: number | null
    total_orders: number | null
    metrics_snapshot: any
    opened_by_profile: ProfileSummary | null
    closed_by_profile: ProfileSummary | null
}

export default function SessionsHistoryClient({
    sessions,
    currency,
    roleSlug,
    embedded = false
}: {
    sessions: Session[]
    currency: string
    roleSlug: string
    embedded?: boolean
}) {
    const router = useRouter()
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
    const [selectedSession, setSelectedSession] = useState<Session | null>(null)

    // Filtrage des sessions
    const filteredSessions = useMemo(() => {
        return sessions.filter(session => {
            const openerName = session.opened_by_profile?.full_name?.toLowerCase() || ''
            const closerName = session.closed_by_profile?.full_name?.toLowerCase() || ''
            const q = searchQuery.toLowerCase()

            const matchesSearch = openerName.includes(q) || closerName.includes(q)
            const matchesStatus = statusFilter === 'all' || session.status === statusFilter

            return matchesSearch && matchesStatus
        })
    }, [sessions, searchQuery, statusFilter])

    const getRoleLabel = (role: string) => {
        switch (role) {
            case 'gerant': return 'Gérant'
            case 'vendeur': return 'Vendeur'
            case 'patissier': return 'Pâtissier'
            case 'super_admin': return 'Super Admin'
            default: return role
        }
    }

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            {/* Header */}
            {!embedded && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                    <button 
                        onClick={() => router.push('/caisse')}
                        className="btn-secondary"
                        style={{ minHeight: '40px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <ArrowLeft size={16} /> Retour caisse
                    </button>
                    <div>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>Historique des caisses</h1>
                        <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                            Suivi des ouvertures, clôtures et métriques de vente par session.
                        </p>
                    </div>
                </div>
            )}

            {/* Filtres et recherche */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, paddingLeft: '14px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                        <Search size={18} color="#9C8070" />
                    </div>
                    <input
                        type="text"
                        placeholder="Rechercher par nom d'employé..."
                        style={{
                            width: '100%',
                            padding: '10px 10px 10px 42px',
                            borderRadius: '9999px',
                            border: '1.5px solid var(--color-border)',
                            background: 'var(--color-cream)',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: 'var(--color-text)',
                            outline: 'none',
                        }}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {(['all', 'open', 'closed'] as const).map(status => (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className={statusFilter === status ? 'btn-primary' : 'btn-secondary'}
                            style={{ 
                                padding: '0 16px', 
                                fontSize: '0.8rem', 
                                minHeight: '38px',
                                border: statusFilter === status ? 'none' : '1.5px solid var(--color-border)',
                                textTransform: 'capitalize'
                            }}
                        >
                            {status === 'all' ? 'Toutes' : status === 'open' ? '🟢 Ouvertes' : '🔏 Clôturées'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Liste des sessions */}
            {filteredSessions.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                    <Clock size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Aucune session trouvée</p>
                    <p style={{ fontSize: '0.85rem' }}>Essayez de modifier vos critères de recherche ou de filtres.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                    {filteredSessions.map(session => {
                        const openedDate = new Date(session.opened_at)
                        const closedDate = session.closed_at ? new Date(session.closed_at) : null
                        const revenue = (session.total_cash || 0) + (session.total_mobile_money || 0)

                        return (
                            <div key={session.id} className="card" style={{
                                border: session.status === 'open' ? '2.5px solid #34a853' : '1.5px solid var(--color-border)',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                gap: '16px',
                                padding: '20px'
                            }}>
                                {/* Haut */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '99px',
                                                fontSize: '0.75rem',
                                                fontWeight: 800,
                                                background: session.status === 'open' ? '#D1FAE5' : '#F3F4F6',
                                                color: session.status === 'open' ? '#065F46' : '#4B5563',
                                            }}>
                                                {session.status === 'open' ? '🟢 OUVERTE' : '🔏 CLÔTURÉE'}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--color-muted)', fontWeight: 600 }}>
                                            📅 {format(openedDate, 'dd MMM yyyy', { locale: fr })}
                                        </span>
                                    </div>

                                    {/* Infos Ouverture */}
                                    <div style={{ marginBottom: '10px' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ouverture</div>
                                        <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                                👤 {session.opened_by_profile?.full_name || 'Inconnu'}
                                                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-muted)', marginLeft: '6px' }}>
                                                    ({getRoleLabel(session.opened_by_profile?.role_slug || '')})
                                                </span>
                                            </span>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                                                🕐 {format(openedDate, 'HH:mm')}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Infos Fermeture */}
                                    {session.status === 'closed' && closedDate ? (
                                        <div style={{ marginBottom: '14px', borderTop: '1px dashed var(--color-border)', paddingTop: '10px' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Clôture</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                                    👤 {session.closed_by_profile?.full_name || 'Automatique'}
                                                    {session.closed_by_profile && (
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-muted)', marginLeft: '6px' }}>
                                                            ({getRoleLabel(session.closed_by_profile?.role_slug || '')})
                                                        </span>
                                                    )}
                                                </span>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                                                    🕐 {format(closedDate, 'HH:mm')}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ marginBottom: '14px', borderTop: '1px dashed var(--color-border)', paddingTop: '10px', color: '#059669', fontSize: '0.82rem', fontWeight: 600, fontStyle: 'italic' }}>
                                            Session en cours d'activité...
                                        </div>
                                    )}
                                </div>

                                {/* Bas / Financier */}
                                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
                                        <span>Commandes</span>
                                        <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{session.total_orders || 0}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '0.95rem', fontWeight: 800 }}>
                                        <span>Total Encaissé</span>
                                        <span style={{ color: 'var(--color-primary)' }}>
                                            {revenue.toLocaleString('fr-FR')} {currency}
                                        </span>
                                    </div>

                                    {session.status === 'closed' && (
                                        <button
                                            onClick={() => setSelectedSession(session)}
                                            className="btn-secondary"
                                            style={{ width: '100%', minHeight: '36px', fontSize: '0.8rem', fontWeight: 700 }}
                                        >
                                            👁️ Voir les détails du rapport
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Drawer Détail Rapport de Session */}
            {selectedSession && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
                    {/* Overlay */}
                    <div 
                        onClick={() => setSelectedSession(null)}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(45,27,14,0.4)', backdropFilter: 'blur(4px)' }} 
                    />
                    
                    {/* Content */}
                    <div className="animate-slide-in" style={{
                        position: 'relative', width: '100%', maxWidth: '420px', height: '100dvh',
                        background: 'white', display: 'flex', flexDirection: 'column',
                        boxShadow: '-8px 0 30px rgba(45,27,14,0.15)', overflow: 'hidden'
                    }}>
                        {/* Header */}
                        <div style={{ padding: '20px 24px', borderBottom: '1.5px solid var(--color-border)', background: 'var(--color-cream)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                                    Détails de Session
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#2D1B0E' }}>
                                    Session du {format(new Date(selectedSession.opened_at), 'dd MMMM yyyy', { locale: fr })}
                                </h2>
                            </div>
                            <button onClick={() => setSelectedSession(null)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 8px' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content Scrollable */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                            {/* Suivi opérateurs */}
                            <div style={{ background: '#FFFDFB', border: '1px solid #F3E5DC', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
                                <h3 style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 700, color: '#2D1B0E' }}>🔑 Opérateurs de Caisse</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem', color: '#5C3D2E' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Ouvert par :</span>
                                        <strong>{selectedSession.opened_by_profile?.full_name} ({getRoleLabel(selectedSession.opened_by_profile?.role_slug || '')})</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>À :</span>
                                        <strong>{format(new Date(selectedSession.opened_at), 'HH:mm', { locale: fr })}</strong>
                                    </div>
                                    <div style={{ height: '1px', background: '#F5ECE5', margin: '4px 0' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Fermé par :</span>
                                        <strong>{selectedSession.closed_by_profile?.full_name || 'Automatique'} {selectedSession.closed_by_profile && `(${getRoleLabel(selectedSession.closed_by_profile?.role_slug || '')})`}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>À :</span>
                                        <strong>{selectedSession.closed_at ? format(new Date(selectedSession.closed_at), 'HH:mm', { locale: fr }) : '--:--'}</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Revenue Total */}
                            <div style={{ background: '#FFFDFB', border: '2px solid #C4836A', borderRadius: '12px', padding: '20px', textAlign: 'center', marginBottom: '24px' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9C8070', letterSpacing: '0.05em' }}>TOTAL RECETTE ENCAISSÉE</div>
                                <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#C4836A', marginTop: '6px' }}>
                                    {((selectedSession.total_cash || 0) + (selectedSession.total_mobile_money || 0)).toLocaleString('fr-FR')} {currency}
                                </div>
                            </div>

                            {/* Ventilation modes de paiement */}
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2D1B0E', marginBottom: '12px' }}>💳 Ventilation par mode de paiement</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--color-cream)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem' }}>
                                    <span>💸 Espèces</span>
                                    <strong style={{ color: '#137333' }}>{(selectedSession.total_cash || 0).toLocaleString('fr-FR')} {currency}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--color-cream)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem' }}>
                                    <span>📱 Mobile Money</span>
                                    <strong style={{ color: '#4a0072' }}>{(selectedSession.total_mobile_money || 0).toLocaleString('fr-FR')} {currency}</strong>
                                </div>
                            </div>

                            {/* Détails du Snapshot (si disponible) */}
                            {selectedSession.metrics_snapshot ? (
                                <>
                                    {/* Ventilation Mobile Money précise */}
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2D1B0E', marginBottom: '12px' }}>📱 Détail Mobile Money</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px', paddingLeft: '12px', borderLeft: '2px solid var(--color-border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                            <span>Orange Money</span>
                                            <span>{(selectedSession.metrics_snapshot.totalOrangeMoney || 0).toLocaleString('fr-FR')} {currency}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                            <span>Wave</span>
                                            <span>{(selectedSession.metrics_snapshot.totalWave || 0).toLocaleString('fr-FR')} {currency}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                            <span>MTN Momo</span>
                                            <span>{(selectedSession.metrics_snapshot.totalMtnMomo || 0).toLocaleString('fr-FR')} {currency}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                            <span>Moov Money</span>
                                            <span>{(selectedSession.metrics_snapshot.totalMoovMoney || 0).toLocaleString('fr-FR')} {currency}</span>
                                        </div>
                                    </div>

                                    {/* Ventilation type de transactions */}
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2D1B0E', marginBottom: '12px' }}>📋 Nature des encaissements</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                            <span>Acomptes (Prises de commande)</span>
                                            <span>{(selectedSession.metrics_snapshot.totalAcomptes || 0).toLocaleString('fr-FR')} {currency}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                            <span>Soldes (Remises de commande)</span>
                                            <span>{(selectedSession.metrics_snapshot.totalSoldes || 0).toLocaleString('fr-FR')} {currency}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                            <span>Ventes Directes (Vitrine)</span>
                                            <span>{(selectedSession.metrics_snapshot.totalVentesDirectes || 0).toLocaleString('fr-FR')} {currency}</span>
                                        </div>
                                    </div>

                                    {/* Métriques sur les commandes de la session */}
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2D1B0E', marginBottom: '12px' }}>📦 Commandes</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                            <span>Commandes de la session</span>
                                            <span>{selectedSession.metrics_snapshot.totalOrders || 0}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#137333' }}>
                                            <span>Livrées / Retirées</span>
                                            <span>{selectedSession.metrics_snapshot.completedOrders || 0}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#b31412' }}>
                                            <span>Restées en attente</span>
                                            <span>{(selectedSession.metrics_snapshot.totalOrders || 0) - (selectedSession.metrics_snapshot.completedOrders || 0)}</span>
                                        </div>
                                    </div>

                                    {/* Alertes stocks au moment de la clôture */}
                                    {selectedSession.metrics_snapshot.alertItems && selectedSession.metrics_snapshot.alertItems.length > 0 && (
                                        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '10px', padding: '14px', marginBottom: '24px' }}>
                                            <h4 style={{ margin: '0 0 8px', fontSize: '0.82rem', color: '#D94F38', fontWeight: 700 }}>⚠️ Alertes Stock lors de la clôture</h4>
                                            <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.78rem', color: '#991B1B', lineHeight: 1.4 }}>
                                                {selectedSession.metrics_snapshot.alertItems.map((item: any, index: number) => (
                                                    <li key={index} style={{ marginBottom: '4px' }}>
                                                        {item.name} : <strong>{item.current_stock} {item.unit}</strong> (seuil alertes : {item.alert_threshold})
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F3F4F6', padding: '12px 16px', borderRadius: '8px', fontSize: '0.8rem', color: '#4B5563' }}>
                                    <Info size={16} />
                                    Aucun snapshot de métrique disponible pour cette session.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
