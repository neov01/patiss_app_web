import { NextRequest, NextResponse } from 'next/server'
import { AuthContextError, requireOrganizationContext } from '@/lib/auth/organization-context'

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const requestedOrgId = searchParams.get('orgId')
        const { supabase, organizationId } = await requireOrganizationContext()

        if (requestedOrgId && requestedOrgId !== organizationId) {
            return NextResponse.json({ error: 'Forbidden organization' }, { status: 403 })
        }

        const { data, error } = await supabase
            .from('products')
            .select('id, name, selling_price')
            .eq('organization_id', organizationId)
            .order('name')

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        return NextResponse.json({ products: data ?? [] })
    } catch (err) {
        if (err instanceof AuthContextError) {
            return NextResponse.json({ error: err.message }, { status: err.status })
        }

        console.error('[Recipes API] Error:', err)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
