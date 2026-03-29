import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/supabase'

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Rafraîchit la session (IMPORTANT : ne pas supprimer)
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl
    const isKioskSession = request.cookies.has('kiosk_user_id')

    // Redirige vers login si tentative d'accès au dashboard sans session (sauf si session Kiosque active)
    if (!user && !isKioskSession && (pathname.startsWith('/dashboard') || pathname.startsWith('/admin'))) {
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = '/login'
        redirectUrl.searchParams.set('redirectedFrom', pathname)
        return NextResponse.redirect(redirectUrl)
    }

    // Redirige vers dashboard ou admin si déjà connecté et qu'on accède à /login
    if (user && pathname === '/login') {
        const { data: profile } = await supabase.from('profiles').select('role_slug').eq('id', user.id).single()
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = profile?.role_slug === 'super_admin' ? '/admin' : '/dashboard'
        return NextResponse.redirect(redirectUrl)
    }

    // Optional: Prevent non-admins from hitting /admin
    if (user && pathname.startsWith('/admin')) {
        const { data: profile } = await supabase.from('profiles').select('role_slug').eq('id', user.id).single()
        if (profile?.role_slug !== 'super_admin') {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/dashboard'
            return NextResponse.redirect(redirectUrl)
        }
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
