/**
 * Pâtiss'App — IndexedDB Offline Store
 * 
 * Gère 3 object stores :
 * - products : cache du catalogue produits (pour ventes vitrine offline)
 * - pendingTransactions : queue des encaissements en attente de sync
 * - pendingOrders : queue des commandes prises en mode dégradé
 */

const DB_NAME = 'patissapp-offline'
const DB_VERSION = 2

export const MAX_OFFLINE_RETRIES = 3

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Cache produits
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' })
      }

      // Queue transactions offline
      if (!db.objectStoreNames.contains('pendingTransactions')) {
        const txStore = db.createObjectStore('pendingTransactions', { keyPath: 'offlineId', autoIncrement: true })
        txStore.createIndex('createdAt', 'createdAt')
      }

      // Queue commandes offline
      if (!db.objectStoreNames.contains('pendingOrders')) {
        const orderStore = db.createObjectStore('pendingOrders', { keyPath: 'offlineId', autoIncrement: true })
        orderStore.createIndex('createdAt', 'createdAt')
      }

      // Cache commandes prêtes au retrait
      if (!db.objectStoreNames.contains('readyOrders')) {
        db.createObjectStore('readyOrders', { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ==================== PRODUITS (CACHE) ====================

export type CachedProduct = {
  id: string
  name: string
  selling_price: number
  current_stock: number | null
  category: string
  image_url?: string | null
}

export type CachedReadyOrder = {
  id: string
  customer_name: string
  customer_contact?: string | null
  customer_id?: string | null
  order_number?: string | null
  pickup_date?: string | null
  deposit_amount?: number | null
  paid_amount?: number | null
  total_amount?: number | null
  balance?: number | null
  priority?: string | null
  status?: string | null
  discount_amount?: number | null
  order_items?: Array<{
    id?: string
    product_id: string | null
    quantity: number
    unit_price: number
    products?: { name: string | null } | null
  }>
}

export async function cacheProducts(products: CachedProduct[], clearFirst = false): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('products', 'readwrite')
  const store = tx.objectStore('products')

  if (clearFirst) {
    store.clear()
  }

  for (const p of products) {
    store.put(p)
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  const db = await openDB()
  const tx = db.transaction('products', 'readonly')
  const store = tx.objectStore('products')

  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ==================== COMMANDES PRÊTES (CACHE) ====================

export async function cacheReadyOrders(orders: CachedReadyOrder[]): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('readyOrders', 'readwrite')
  const store = tx.objectStore('readyOrders')

  store.clear() // On efface le cache existant pour mettre à jour
  for (const o of orders) {
    store.put(o)
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getCachedReadyOrders(): Promise<CachedReadyOrder[]> {
  const db = await openDB()
  const tx = db.transaction('readyOrders', 'readonly')
  const store = tx.objectStore('readyOrders')

  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ==================== TRANSACTIONS OFFLINE ====================

export type PendingTransaction = {
  offlineId?: number
  id: string
  order_id: string | null
  client_name: string
  amount: number
  payment_method: string
  payment_details: Record<string, number>
  items: Array<{
    id: string
    product_id: string | null
    name: string
    quantity: number
    unit_price: number
  }>
  createdAt: string // ISO string
  retryCount?: number
  lastError?: string
  failedAt?: string // ISO string — renseigné quand retryCount >= MAX_RETRIES
}

export async function queueTransaction(tx: Omit<PendingTransaction, 'offlineId' | 'createdAt'>): Promise<number> {
  const db = await openDB()
  const dbTx = db.transaction('pendingTransactions', 'readwrite')
  const store = dbTx.objectStore('pendingTransactions')

  return new Promise((resolve, reject) => {
    const request = store.add({
      ...tx,
      createdAt: new Date().toISOString()
    })
    request.onsuccess = () => resolve(request.result as number)
    request.onerror = () => reject(request.error)
  })
}

export async function getPendingTransactions(): Promise<PendingTransaction[]> {
  const db = await openDB()
  const tx = db.transaction('pendingTransactions', 'readonly')
  const store = tx.objectStore('pendingTransactions')

  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function removePendingTransaction(offlineId: number): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('pendingTransactions', 'readwrite')
  const store = tx.objectStore('pendingTransactions')

  return new Promise((resolve, reject) => {
    const request = store.delete(offlineId)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function updatePendingTransactionRetry(
  offlineId: number,
  error: string
): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('pendingTransactions', 'readwrite')
  const store = tx.objectStore('pendingTransactions')

  return new Promise((resolve, reject) => {
    const getReq = store.get(offlineId)
    getReq.onsuccess = () => {
      const record: PendingTransaction = getReq.result
      if (!record) { resolve(); return }
      record.retryCount = (record.retryCount ?? 0) + 1
      record.lastError = error
      if (record.retryCount >= MAX_OFFLINE_RETRIES) {
        record.failedAt = new Date().toISOString()
      }
      store.put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

// ==================== COMMANDES OFFLINE ====================

export type PendingOrder = {
  offlineId?: number
  id: string
  customer_name: string
  customer_contact: string
  pickup_date: string
  reception_type: string
  customization_notes?: string
  items: Array<{
    id: string
    product_id: string | null
    name: string
    quantity: number
    unit_price: number
  }>
  priority: string
  createdAt: string
  deposit_amount?: number
  discount_amount?: number
  deposit_payment_method?: string
  payments?: Array<{
    amount: number
    payment_method: string
    label_type: 'ACOMPTE' | 'SOLDE'
  }>
}

export async function queueOrder(order: Omit<PendingOrder, 'offlineId' | 'createdAt'>): Promise<number> {
  const db = await openDB()
  const tx = db.transaction('pendingOrders', 'readwrite')
  const store = tx.objectStore('pendingOrders')

  return new Promise((resolve, reject) => {
    const request = store.add({
      ...order,
      createdAt: new Date().toISOString()
    })
    request.onsuccess = () => resolve(request.result as number)
    request.onerror = () => reject(request.error)
  })
}

export async function getPendingOrders(): Promise<PendingOrder[]> {
  const db = await openDB()
  const tx = db.transaction('pendingOrders', 'readonly')
  const store = tx.objectStore('pendingOrders')

  return new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function removePendingOrder(offlineId: number): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('pendingOrders', 'readwrite')
  const store = tx.objectStore('pendingOrders')

  return new Promise((resolve, reject) => {
    const request = store.delete(offlineId)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// ==================== COMPTEUR ====================

export async function getPendingCounts(): Promise<{ transactions: number; orders: number }> {
  const db = await openDB()
  
  const getTxCount = (): Promise<number> => {
    const tx = db.transaction('pendingTransactions', 'readonly')
    const store = tx.objectStore('pendingTransactions')
    return new Promise((resolve, reject) => {
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  const getOrderCount = (): Promise<number> => {
    const tx = db.transaction('pendingOrders', 'readonly')
    const store = tx.objectStore('pendingOrders')
    return new Promise((resolve, reject) => {
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  const [transactions, orders] = await Promise.all([getTxCount(), getOrderCount()])
  return { transactions, orders }
}
