'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { 
  queueTransaction, 
  queueOrder,
  getPendingCounts,
  resetPendingRetries,
  cacheProducts,
  cacheReadyOrders,
  getCachedProducts,
  type CachedProduct,
  type CachedReadyOrder,
  type PendingTransaction,
  type PendingOrder
} from '@/lib/offline/db'
import { syncPendingData } from '@/lib/offline/sync'
import { toast } from 'sonner'
import SyncErrorResolutionModal from '@/components/offline/SyncErrorResolutionModal'


type OfflineContextType = {
  isOffline: boolean
  isUnstable: boolean
  networkStatus: 'online' | 'unstable' | 'offline'
  pendingCount: number
  deadCount: number
  cachedProducts: CachedProduct[]
  isStoragePersistent: boolean
  requestPersistence: () => Promise<boolean>
  /** Queue une transaction pour sync ultérieure */
  saveTransactionOffline: (tx: Omit<PendingTransaction, 'offlineId' | 'createdAt'>) => Promise<void>
  /** Queue une commande pour sync ultérieure */
  saveOrderOffline: (order: Omit<PendingOrder, 'offlineId' | 'createdAt'>) => Promise<void>
  /** Met à jour le cache produits (appeler quand on a les données fraîches) */
  refreshProductCache: (products: CachedProduct[]) => Promise<void>
  /** Met à jour le cache des commandes prêtes (pipeline) */
  refreshReadyOrdersCache: (orders: CachedReadyOrder[]) => Promise<void>
  /** Force une synchronisation manuelle */
  forceSync: () => Promise<void>
  /** Réinitialise les opérations en erreur persistante */
  resetFailedOperations: () => Promise<void>
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
  const [deadCount, setDeadCount] = useState(0)
  const [cachedProducts, setCachedProducts] = useState<CachedProduct[]>([])
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false)
  const [isStoragePersistent, setIsStoragePersistent] = useState(false)
  const isSyncing = useRef(false)

  const prevStatus = useRef(networkStatus)

  const isOffline = networkStatus === 'offline'
  const isUnstable = networkStatus === 'unstable'

  // Demander la persistance du stockage (critique pour iOS/Safari)
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.storage) {
      // 1. Vérifier si c'est déjà persistant
      if (navigator.storage.persisted) {
        navigator.storage.persisted().then(persistent => {
          setIsStoragePersistent(persistent)
          if (persistent) {
            console.log("[Offline] Le stockage est déjà persistant.")
          } else {
            // 2. Si non persistant, tenter de le demander silencieusement.
            // Certains navigateurs (comme Chrome) l'accordent silencieusement sous conditions (ex: PWA, signets, engagement).
            // Les navigateurs plus restrictifs (comme Firefox) attendront un clic utilisateur via `requestPersistence` pour éviter les popups intrusifs au chargement.
            if (navigator.storage.persist) {
              navigator.storage.persist().then(granted => {
                setIsStoragePersistent(granted)
                if (granted) console.log("[Offline] Stockage persistant accordé silencieusement.")
              }).catch(console.error)
            }
          }
        }).catch(console.error)
      }
    }
  }, [])

  const requestPersistence = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const granted = await navigator.storage.persist()
        setIsStoragePersistent(granted)
        if (granted) {
          console.log("[Offline] Stockage persistant accordé via geste utilisateur.")
          toast.success("Stockage persistant activé avec succès.")
        } else {
          console.warn("[Offline] Stockage persistant refusé par l'utilisateur.")
          toast.warning("Stockage persistant refusé. Attention, vos données locales pourraient être purgées en cas d'espace disque saturé.")
        }
        return granted
      } catch (err) {
        console.error("[Offline] Erreur lors de la demande de persistance:", err)
        return false
      }
    }
    return false
  }, [])

  const updatePendingCount = useCallback(async () => {
    try {
      const counts = await getPendingCounts()
      const activeTx = counts.transactions - counts.deadTransactions
      const activeOrders = counts.orders - counts.deadOrders
      setPendingCount(activeTx + activeOrders)
      setDeadCount(counts.deadTransactions + counts.deadOrders)
    } catch {
      // IndexedDB non dispo
    }
  }, [])

  // Charger le cache produits au montage
  useEffect(() => {
    getCachedProducts().then(setCachedProducts).catch(() => {})
    void updatePendingCount()
  }, [updatePendingCount])

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
    } catch {
      toast.error('Erreur lors de la synchronisation', { id: toastId })
    } finally {
      isSyncing.current = false
    }
  }, [pendingCount, updatePendingCount])

  // Auto-sync quand on revient en ligne
  useEffect(() => {
    const wasOffline = prevStatus.current === 'offline' || prevStatus.current === 'unstable'
    const isNowOnline = networkStatus === 'online'
    prevStatus.current = networkStatus

    if (wasOffline && isNowOnline && pendingCount > 0) {
      void handleSync()
    }
  }, [networkStatus, pendingCount, handleSync])

  const saveTransactionOffline = useCallback(async (tx: Omit<PendingTransaction, 'offlineId' | 'createdAt'>) => {
    await queueTransaction(tx)
    await updatePendingCount()
    toast.info('⏳ Transaction enregistrée hors-ligne — sera synchronisée au retour du réseau', {
      duration: 4000
    })
  }, [updatePendingCount])

  const saveOrderOffline = useCallback(async (order: Omit<PendingOrder, 'offlineId' | 'createdAt'>) => {
    await queueOrder(order)
    await updatePendingCount()
    toast.info('⏳ Commande enregistrée hors-ligne — sera synchronisée au retour du réseau', {
      duration: 4000
    })
  }, [updatePendingCount])

  const refreshProductCache = useCallback(async (products: CachedProduct[]) => {
    await cacheProducts(products)
    setCachedProducts(products)
  }, [])

  const refreshReadyOrdersCache = useCallback(async (orders: CachedReadyOrder[]) => {
    await cacheReadyOrders(orders)
  }, [])

  // Last-resort: suppress "Failed to fetch" unhandled rejections from Supabase
  // auto-refresh that slip through before the custom fetch wrapper intercepts.
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message ?? String(event.reason ?? '')
      if (
        msg.includes('Failed to fetch') ||
        msg.includes('Load failed') ||
        msg.includes('AuthRetryableFetchError')
      ) {
        event.preventDefault()
      }
    }
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection)
  }, [])

  const forceSync = useCallback(async () => {
    if (isOffline) {
      toast.error('Synchronisation impossible — pas de connexion')
      return
    }
    await handleSync()
  }, [isOffline, handleSync])

  const resetFailedOperations = useCallback(async () => {
    try {
      await resetPendingRetries()
      await updatePendingCount()
      toast.success('Les compteurs d\'essais hors-ligne ont été réinitialisés. Relancement de la synchronisation...')
      if (!isOffline) {
        void handleSync()
      }
    } catch {
      toast.error('Erreur lors de la réinitialisation des essais')
    }
  }, [updatePendingCount, isOffline, handleSync])

  return (
    <OfflineContext.Provider value={{
      isOffline,
      isUnstable,
      networkStatus,
      pendingCount,
      deadCount,
      cachedProducts,
      isStoragePersistent,
      requestPersistence,
      saveTransactionOffline,
      saveOrderOffline,
      refreshProductCache,
      refreshReadyOrdersCache,
      forceSync,
      resetFailedOperations
    }}>
      {children}
      
      {/* Badge flottant de sync si des opérations actives ou en échec sont présentes */}
      {(pendingCount > 0 || deadCount > 0) && (
        <div 
          onClick={
            deadCount > 0 
              ? () => setIsSyncModalOpen(true)
              : (isOffline ? undefined : forceSync)
          }
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: deadCount > 0 ? '#FEE2E2' : (isOffline ? '#FEF3C7' : '#DBEAFE'),
            border: deadCount > 0 ? '2px solid #EF4444' : (isOffline ? '2px solid #F59E0B' : '2px solid #3B82F6'),
            borderRadius: '16px',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: (isOffline && deadCount === 0) ? 'default' : 'pointer',
            zIndex: 60,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            animation: 'pulse 2s infinite',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: deadCount > 0 ? '#991B1B' : (isOffline ? '#92400E' : '#1E40AF')
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>
            {deadCount > 0 ? '⚠️' : (isOffline ? '⏳' : '🔄')}
          </span>
          {deadCount > 0 ? (
            <span>{deadCount} échec(s) critique(s) — Résoudre</span>
          ) : (
            <span>{pendingCount} en attente{!isOffline && ' — Synchroniser'}</span>
          )}

          <style>{`
            @keyframes pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.02); }
            }
          `}</style>
        </div>
      )}

      <SyncErrorResolutionModal 
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onResolved={updatePendingCount}
      />
    </OfflineContext.Provider>
  )
}
