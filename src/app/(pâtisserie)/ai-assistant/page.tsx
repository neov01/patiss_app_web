import AIAssistant from '@/components/dashboard/AIAssistant'
import { createClient } from '@/lib/supabase/server'

export default async function AIAssistantPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, role_slug, organizations(currency_symbol)')
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
                <AIAssistant 
                    currency={currency} 
                    organizationId={profile?.organization_id ?? ''} 
                    userRole={profile?.role_slug ?? 'vendeur'}
                />
            </div>
        </div>
    )
}
