'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Server Action pour le setup initial du Super Admin.
 * Utilise le Service Role Key pour contourner les RLS
 * (nécessaire car le premier utilisateur n'a pas encore de profil).
 */
export async function setupSuperAdmin(formData: {
    fullName: string
    orgName: string
}) {
    // Pré-requis de configuration
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return { error: 'Configuration Supabase incomplète. Vérifiez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.' }
    }

    // Vérifier que l'utilisateur est authentifié
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Non authentifié. Veuillez vous reconnecter.' }

    // Client admin avec Service Role Key (contourne RLS)
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Vérifier s'il existe déjà un Super Admin
    const { data: existingSuperAdmins, error: superAdminCheckError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role_slug', 'super_admin')
        .limit(1)

    if (superAdminCheckError) {
        return { error: `Erreur vérification Super Admin : ${superAdminCheckError.message}` }
    }

    // Si un super admin existe déjà et que ce n'est pas l'utilisateur courant, on bloque le setup
    if (existingSuperAdmins && existingSuperAdmins.length > 0 && existingSuperAdmins[0].id !== user.id) {
        return { error: 'Un Super Admin existe déjà. Utilisez la page de connexion pour vous authentifier.' }
    }

    // Vérifier si une organisation existe déjà
    const { data: existingOrgs } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .limit(1)

    let orgId: string

    if (existingOrgs && existingOrgs.length > 0) {
        orgId = existingOrgs[0].id
        if (formData.orgName.trim()) {
            await supabaseAdmin
                .from('organizations')
                .update({ name: formData.orgName })
                .eq('id', orgId)
        }
    } else {
        const { data: newOrg, error: orgError } = await supabaseAdmin
            .from('organizations')
            .insert({ name: formData.orgName || 'Ma Pâtisserie', currency_symbol: 'FCFA' })
            .select()
            .single()

        if (orgError) return { error: `Erreur organisation : ${orgError.message}` }
        orgId = newOrg.id
    }

    // Créer ou update le profil super_admin
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
            id: user.id,
            full_name: formData.fullName || 'Super Admin',
            role_slug: 'super_admin',
            organization_id: orgId,
            is_active: true,
        }, { onConflict: 'id' })

    if (profileError) return { error: `Erreur profil : ${profileError.message}` }

    return { success: true }
}
