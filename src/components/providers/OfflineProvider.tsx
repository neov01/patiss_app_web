'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { 
  queueTransaction, 
  queueOrder,
  getPendingCounts,
  cacheProducts,
  cacheReadyOrders,
  getCachedProducts,
  type CachedProduct,
  type PendingTransaction,
  type PendingOrder
} from '@/lib/offline/db'
import { syncPendingData, type SyncResult } from '@/lib/offline/sync'
import { toast } from 'sonner'

type OfflineContextType = {
  isOffline: boolean
  isUnstable: boolean
  networkStatus: 'online' | 'unstable' | 'offline'
  pendingCount: number
  cachedProducts: CachedProduct[]
  /** Queue une transaction pour sync ultérieure */
  saveTransactionOffline: (tx: Omit<PendingTransaction, 'offlineId' | 'createdAt'>) => Promise<void>
  /** Queue une commande pour sync ultérieure */
  saveOrderOffline: (order: Omit<PendingOrder, 'offlineId' | 'createdAt'>) => Promise<void>
  /** Met à jour le cache produits (appeler quand on a les données fraîches) */
  refreshProductCache: (products: CachedProduct[]) => Promise<void>
  /** Met à jour le cache des commandes prêtes (pipeline) */
  refreshReadyOrdersCache: (orders: any[]) => Promise<void>
  /** Force une synchronisation manuelle */
  forceSync: () => Promise<void>
}

const OfflineContext = createContext<OfflineContextType | null>(null)

export function useOffline() {
  const ctx = useContext(OfflineContext)
  if (!ctx) throw new Error('useOffline must be used within OfflineProvider')
  return ctx
}

export default function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { status: networkStatus } = useNetworkStatus()
  const [pendingCount, setPendingCount] = useState(0)
  const [cachedProducts, setCachedProducts] = useState<CachedProduct[]>([])
  const isSyncing = useRef(false)
  const prevStatus = useRef(networkStatus)

  const isOffline = networkStatus === 'offline'
  const isUnstable = networkStatus === 'unstable'

  // Demander la persistance du stockage (critique pour iOS/Safari)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(persistent => {
        if (persistent) console.log("[Offline] Stockage persistant accordé.")
        else console.warn("[Offline] Stockage persistant refusé (risque de purge iOS).")
      }).catch(console.error)
    }
  }, [])

  // Charger le cache produits au montage
  useEffect(() => {
    getCachedProducts().then(setCachedProducts).catch(() => {})
    updatePendingCount()
  }, [])

  const updatePendingCount = async () => {
    try {
      const counts = await getPendingCounts()
      setPendingCount(counts.transactions + counts.orders)
    } catch {
      // IndexedDB non dispo
    }
  }

  // Auto-sync quand on revient en ligne
  useEffect(() => {
    const wasOffline = prevStatus.current === 'offline' || prevStatus.current === 'unstable'
    const isNowOnline = networkStatus === 'online'
    prevStatus.current = networkStatus

    if (wasOffline && isNowOnline && pendingCount > 0) {
      handleSync()
    }
  }, [networkStatus, pendingCount])

  const handleSync = useCallback(async () => {
    if (isSyncing.current) return
    isSyncing.current = true

    const toastId = toast.loading(`Synchronisation de ${pendingCount} opération(s)...`)

    try {
      const result = await syncPendingData()
      const totalSynced = result.syncedTransactions + result.syncedOrders
      const totalFailed = result.failedTransactions + result.failedOrders

      if (totalSynced > 0 && totalFailed === 0) {
        toast.success(
          `✅ ${totalSynced} opération(s) synchronisée(s) avec succès !`,
          { id: toastId, duration: 5000 }
        )
      } else if (totalSynced > 0 && totalFailed > 0) {
        toast.warning(
          `${totalSynced} synchronisée(s), ${totalFailed} en échec — sera retenté`,
          { id: toastId, duration: 5000 }
        )
      } else if (totalFailed > 0) {
        toast.error(
          `Échec de synchronisation — ${totalFailed} opération(s) en attente`,
          { id: toastId, duration: 5000 }
        )
      } else {
        toast.dismiss(toastId)
      }

      await updatePendingCount()
    } catch (err) {
      toast.error('Erreur lors de la synchronisation', { id: toastId })
    } finally {
      isSyncing.current = false
    }
  }, [pendingCount])

  const saveTransactionOffline = useCallback(async (tx: Omit<PendingTransaction, 'offlineId' | 'createdAt'>) => {
    await queueTransaction(tx)
    await updatePendingCount()
    toast.info('⏳ Transaction enregistrée hors-ligne — sera synchronisée au retour du réseau', {
      duration: 4000
    })
  }, [])

  const saveOrderOffline = useCallback(async (order: Omit<PendingOrder, 'offlineId' | 'createdAt'>) => {
    await queueOrder(order)
    await updatePendingCount()
    toast.info('⏳ Commande enregistrée hors-ligne — sera synchronisée au retour du réseau', {
      duration: 4000
    })
  }, [])

  const refreshProductCache = useCallback(async (products: CachedProduct[]) => {
    await cacheProducts(products)
    setCachedProducts(products)
  }, [])

  const refreshReadyOrdersCache = useCallback(async (orders: any[]) => {
    await cacheReadyOrders(orders)
  }, [])

  const forceSync = useCallback(async () => {
    if (isOffline) {
      toast.error('Synchronisation impossible — pas de connexion')
      return
    }
    await handleSync()
  }, [isOffline, handleSync])

  return (
    <OfflineContext.Provider value={{
      isOffline,
      isUnstable,
      networkStatus,
      pendingCount,
      cachedProducts,
      saveTransactionOffline,
      saveOrderOffline,
      refreshProductCache,
      refreshReadyOrdersCache,
      forceSync
    }}>
      {children}
      
      {/* Badge flottant de sync si des opérations sont en attente */}
      {pendingCount > 0 && (
        <div 
          onClick={isOffline ? undefined : forceSync}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: isOffline ? '#FEF3C7' : '#DBEAFE',
            border: isOffline ? '2px solid #F59E0B' : '2px solid #3B82F6',
            borderRadius: '16px',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: isOffline ? 'default' : 'pointer',
            zIndex: 60,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            animation: 'pulse 2s infinite',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: isOffline ? '#92400E' : '#1E40AF'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>{isOffline ? '⏳' : '🔄'}</span>
          {pendingCount} en attente{!isOffline && ' — Synchroniser'}

          <style>{`
            @keyframes pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.02); }
            }
          `}</style>
        </div>
      )}
    </OfflineContext.Provider>
  )
}
