// Pâtiss'App Service Worker — Couche 1 : App Shell Cache
const CACHE_NAME = 'patissapp-v1'

// Pages et assets critiques à pré-cacher
const APP_SHELL = [
  '/',
  '/dashboard',
  '/caisse',
  '/offline'
]

// Installation : pré-cache l'App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // On ne bloque pas l'install si certaines pages échouent
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(() => {}))
      )
    })
  )
  self.skipWaiting()
})

// Activation : nettoie les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// Fetch : Network-first pour les pages, Cache-first pour les assets statiques
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignorer les requêtes non-GET et les requêtes vers Supabase/API
  if (request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return
  if (url.hostname.includes('supabase')) return

  // Assets statiques (JS, CSS, images, polices) → Cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.match(/\.(js|css|png|jpg|webp|woff2?|ttf|svg|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // Pages HTML → Network-first avec timeout (3s) et fallback cache
  if (request.headers.get('accept')?.includes('text/html')) {
    const fetchPromise = fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
      }
      return response
    })

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Network timeout')), 3000)
    )

    event.respondWith(
      Promise.race([fetchPromise, timeoutPromise])
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match('/offline')
          })
        })
    )
    return
  }
})

// --- BACKGROUND SYNC ---
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    console.log('[SW] Background sync triggered: sync-orders')
    event.waitUntil(processOfflineQueue())
  }
})

async function processOfflineQueue() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('patissapp-offline', 2)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  // 1. Sync Transactions
  const txStore = db.transaction('pendingTransactions', 'readonly').objectStore('pendingTransactions')
  const transactions = await new Promise((resolve) => {
    const req = txStore.getAll()
    req.onsuccess = () => resolve(req.result)
  })

  if (transactions && transactions.length > 0) {
    console.log(`[SW] Found ${transactions.length} pending transactions to sync`)
    // TODO: The actual POST request to an API route should go here.
    // Example: await fetch('/api/sync/transactions', { method: 'POST', body: JSON.stringify(transactions) })
  }

  // 2. Sync Orders
  const orderStore = db.transaction('pendingOrders', 'readonly').objectStore('pendingOrders')
  const orders = await new Promise((resolve) => {
    const req = orderStore.getAll()
    req.onsuccess = () => resolve(req.result)
  })

  if (orders && orders.length > 0) {
    console.log(`[SW] Found ${orders.length} pending orders to sync`)
    // Example: await fetch('/api/sync/orders', { method: 'POST', body: JSON.stringify(orders) })
  }
}
