async function check() {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: sessions, error } = await supabase
        .from('sales_sessions')
        .select('*, organizations(name)')
        .order('opened_at', { ascending: false })
        .limit(10)

    if (error) {
        console.error("Error:", error)
        return
    }

    console.log("Sessions:")
    sessions.forEach(s => {
        console.log(`ID: ${s.id} | Org: ${s.organizations?.name} | Status: ${s.status} | Opened At: ${s.opened_at} | Closed At: ${s.closed_at} | Closed By: ${s.closed_by}`)
    })
}

check()
