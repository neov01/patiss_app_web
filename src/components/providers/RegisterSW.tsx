'use client'

import { useEffect } from 'react'

export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Auto-update: si un nouveau SW est trouvé, l'activer immédiatement
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing
            if (newSW) {
              newSW.addEventListener('statechange', () => {
                if (newSW.state === 'activated') {
                  console.log('[PWA] Nouvelle version activée')
                }
              })
            }
          })
        })
        .catch((err) => console.warn('[PWA] SW registration failed:', err))
    }
  }, [])

  return null
}
