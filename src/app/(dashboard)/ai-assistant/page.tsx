import AIAssistant from '@/components/dashboard/AIAssistant'
import { createClient } from '@/lib/supabase/server'

export default async function AIAssistantPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, organizations(currency_symbol)')
        .eq('id', user.id)
        .single()

    const org = profile?.organizations as { currency_symbol: string } | null
    const currency = org?.currency_symbol ?? 'FCFA'

    return (
        <div className="animate-fade-in">
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Comptable IA</h1>
                <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.875rem' }}>
                    Analyse intelligente de vos données financières par Gemini
                </p>
            </div>

            <div style={{ maxWidth: '680px' }}>
                <AIAssistant currency={currency} organizationId={profile?.organization_id ?? ''} />

                <div className="card" style={{ marginTop: '16px', background: 'var(--color-cream)' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700 }}>💡 Idées de questions</h3>
                    <ul style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                        <li>Quelles recettes génèrent la plus grande marge ?</li>
                        <li>Mon stock de farine est-il suffisant pour les commandes du jour ?</li>
                        <li>Analyse mes pertes de cette semaine.</li>
                        <li>Quel est mon seuil de rentabilité mensuel ?</li>
                    </ul>
                </div>
            </div>
        </div>
    )
}
