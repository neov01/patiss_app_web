'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { logoutKiosk } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/client'

interface Props {
    children: React.ReactNode
    autoLockSeconds: number
    themeColor: string | null
    userId: string
    role: string
    organizationId: string
    isKiosk: boolean
}

export default function AutoLockProvider({ children, autoLockSeconds, themeColor, userId, role, organizationId, isKiosk }: Props) {
    const router = useRouter()
    const timeoutRef = useRef<NodeJS.Timeout | null>(null)

    const handleLock = useCallback(async () => {
        if (isKiosk) {
            // Correct behavior: End kiosk session and return to kiosk screen with the correct orgId
            await logoutKiosk();
            toast.info('Session verrouillée par inactivité.');
            router.push(`/kiosk?orgId=${organizationId}`);
        } else {
            // Fallback for admin sessions (though auto-lock is disabled for them)
            const supabase = createClient();
            await supabase.auth.signOut();
            toast.warning('Session administrateur expirée.');
            router.push('/login');
        }
    }, [router, organizationId, isKiosk]);

    const resetTimer = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)

        // No auto-lock for super_admin and gerant roles
        if (role === 'super_admin' || role === 'gerant') return

        if (autoLockSeconds > 0) {
            timeoutRef.current = setTimeout(handleLock, autoLockSeconds * 1000)
        }
    }, [autoLockSeconds, handleLock, role])

    useEffect(() => {
        resetTimer()
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
        events.forEach(e => document.addEventListener(e, resetTimer))
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            events.forEach(e => document.removeEventListener(e, resetTimer))
        }
    }, [resetTimer])

    return (
        <div style={{
            '--theme-user-color': themeColor || 'var(--color-primary)',
        } as React.CSSProperties}>
            {themeColor && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0,
                    height: '4px',
                    background: themeColor,
                    zIndex: 9999
                }} />
            )}
            {children}
        </div>
    )
}
