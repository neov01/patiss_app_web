import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { closeSingleSession } from '@/lib/actions/session-utils'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest): Promise<NextResponse> {
    const cronSecret = process.env.CRON_SECRET;
    
    // Safety guard: if the secret is not defined in the environment, reject all requests.
    if (!cronSecret) {
        console.error('CRON_SECRET is not configured in environment variables.');
        return NextResponse.json({ error: 'Config missing' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization');
    const isCron = authHeader === `Bearer ${cronSecret}`;
    
    if (!isCron) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Appel Automatique (CRON)
    const { data: openSessions, error } = await supabaseAdmin
        .from('sales_sessions')
        .select('*, organizations(name, currency_symbol)')
        .eq('status', 'open')

    if (error) {
        console.error('Cron: error fetching open sessions', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!openSessions || openSessions.length === 0) {
        return NextResponse.json({ message: 'No open sessions to close.' })
    }

    const results = await Promise.all(
        openSessions.map(s => closeSingleSession(s.id, null, s))
    )

    return NextResponse.json({
        message: `Closed ${results.length} session(s)`,
        details: results
    })
}
