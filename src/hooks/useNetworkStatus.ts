'use client'

import { useState, useEffect, useCallback } from 'react'

type NetworkState = 'online' | 'unstable' | 'offline'

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkState>('online')
  const [pendingCount, setPendingCount] = useState(0)

  const checkConnection = useCallback(async () => {
    if (!navigator.onLine) {
      setStatus('offline')
      return
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      
      const start = Date.now()
      await fetch('/api/ping', { 
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal 
      })
      clearTimeout(timeout)
      
      const latency = Date.now() - start
      setStatus(latency > 2000 ? 'unstable' : 'online')
    } catch {
      setStatus(navigator.onLine ? 'unstable' : 'offline')
    }
  }, [])

  useEffect(() => {
    // Initial check
    checkConnection()

    // Browser events
    const handleOnline = () => {
      setStatus('online')
      checkConnection() // Confirm with a real ping
    }
    const handleOffline = () => setStatus('offline')

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Periodic ping every 30s
    const interval = setInterval(checkConnection, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [checkConnection])

  return { status, pendingCount, setPendingCount }
}
