async function check() {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // 1. Get the open session details
    const { data: session, error: sErr } = await supabase
        .from('sales_sessions')
        .select('*, organizations(name)')
        .eq('id', 'a6966be0-bc88-4d93-87a2-f5be5261abfd')
        .single()

    if (sErr || !session) {
        console.error("Session fetch error:", sErr)
        return
    }

    const orgId = session.organization_id
    console.log(`Org ID: ${orgId} | Name: ${session.organizations?.name}`)

    // 2. Check for active managers in this organization
    const { data: managers, error: mErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', orgId)
        .eq('role_slug', 'gerant')

    console.log("\nManagers found:")
    if (mErr) {
        console.error("Manager fetch error:", mErr)
    } else {
        managers.forEach(m => {
            console.log(`ID: ${m.id} | Name: ${m.full_name} | Role: ${m.role_slug} | Active: ${m.is_active}`)
        })
    }

    // 3. Let's see if there is any auth user for those managers
    if (managers && managers.length > 0) {
        for (const m of managers) {
            const { data: authUser, error: aErr } = await supabase.auth.admin.getUserById(m.id)
            if (aErr) {
                console.error(`Auth user fetch error for ${m.full_name}:`, aErr)
            } else {
                console.log(`Auth Email for ${m.full_name}: ${authUser?.user?.email}`)
            }
        }
    }
}

check()
