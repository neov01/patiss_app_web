import { createClient } from '@/lib/supabase/server'

/**
 * Vérifie si l'organisation de l'utilisateur actuel a un abonnement actif.
 * Retourne true si l'abonnement est actif, false s'il est expiré.
 */
export async function checkSubscriptionStatus() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) return { active: false, error: 'Non authentifié' }

    // On récupère le profil et la date de fin d'abonnement de l'organisation liée
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('organization_id, organizations(subscription_end_date)')
        .eq('id', user.id)
        .single()

    if (error || !profile) return { active: false, error: 'Profil ou organisation introuvable' }

    const org = profile.organizations as any
    if (!org || !org.subscription_end_date) {
        // Si pas de date, on considère par défaut que c'est expiré ou non configuré
        return { active: false, isExpired: true }
    }

    const endDate = new Date(org.subscription_end_date)
    const now = new Date()

    // L'abonnement est actif si la date de fin est dans le futur
    const isExpired = endDate < now

    return { 
        active: !isExpired, 
        isExpired, 
        endDate: org.subscription_end_date,
        organizationId: profile.organization_id 
    }
}

/**
 * Helper à utiliser au début des Server Actions pour bloquer les écritures si expiré.
 */
export async function ensureActiveSubscription() {
    const status = await checkSubscriptionStatus()
    if (status.isExpired) {
        throw new Error('Votre abonnement a expiré. Cette action est bloquée en mode lecture seule.')
    }
    return status
}
