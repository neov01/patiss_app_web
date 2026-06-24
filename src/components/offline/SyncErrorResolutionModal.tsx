'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  getPendingTransactions, 
  removePendingTransaction, 
  updatePendingTransaction, 
  getPendingOrders, 
  removePendingOrder, 
  updatePendingOrder,
  type PendingTransaction,
  type PendingOrder
} from '@/lib/offline/db'
import { syncSingleTransaction, syncSingleOrder } from '@/lib/offline/sync'
import { X, RefreshCw, Trash2, Edit3, Check, AlertCircle, ChevronDown, ChevronUp, ShoppingBag, Store } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  isOpen: boolean
  onClose: () => void
  onResolved?: () => void
}

function getFriendlyError(errorMsg?: string): string {
  if (!errorMsg) return "Erreur de validation serveur."
  const msg = errorMsg.toLowerCase()
  if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return "Cette opération semble déjà avoir été enregistrée. Elle est probablement déjà synchronisée."
  }
  if (msg.includes("foreign key") || msg.includes("product_id")) {
    return "Produit invalide. Un article du panier n'existe plus dans le catalogue ou a été modifié."
  }
  if (msg.includes("not-null") || msg.includes("violates not-null")) {
    return "Données incomplètes. Certaines informations requises sur le serveur manquent."
  }
  if (
    msg.includes("failed to fetch") || 
    msg.includes("load failed") || 
    msg.includes("timeout") || 
    msg.includes("authretryablefetcherror") ||
    msg.includes("network")
  ) {
    return "Problème temporaire de connexion internet ou session expirée."
  }
  return errorMsg
}

export default function SyncErrorResolutionModal({ isOpen, onClose, onResolved }: Props) {
  const [activeTab, setActiveTab] = useState<'tx' | 'orders'>('tx')
  const [failedTxs, setFailedTxs] = useState<PendingTransaction[]>([])
  const [failedOrders, setFailedOrders] = useState<PendingOrder[]>([])
  
  // États d'édition et chargements
  const [editingTxId, setEditingTxId] = useState<string | null>(null)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null)
  const [expandedErrors, setExpandedErrors] = useState<Record<string, boolean>>({})

  // Formulaires temporaires
  const [editTxData, setEditTxData] = useState<Partial<PendingTransaction>>({})
  const [editOrderData, setEditOrderData] = useState<Partial<PendingOrder>>({})

  const loadFailedData = useCallback(async () => {
    try {
      const [txs, orders] = await Promise.all([
        getPendingTransactions(),
        getPendingOrders()
      ])
      // Ne filtrer que celles qui ont atteint le max de retries (dead items)
      // Ou celles qui ont une erreur persistante pour pouvoir tout résoudre
      setFailedTxs(txs.filter(t => (t.retryCount ?? 0) >= 3 || t.lastError))
      setFailedOrders(orders.filter(o => (o.retryCount ?? 0) >= 3 || o.lastError))
    } catch (err) {
      console.error("Erreur lors de la lecture des opérations IndexedDB", err)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      void loadFailedData()
    }
  }, [isOpen, loadFailedData])

  const toggleErrorDetails = (id: string) => {
    setExpandedErrors(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // --- ACTIONS TRANSACTIONS ---
  
  const handleStartEditTx = (tx: PendingTransaction) => {
    setEditingTxId(tx.id)
    setEditTxData({ ...tx })
  }

  const handleCancelEditTx = () => {
    setEditingTxId(null)
    setEditTxData({})
  }

  const handleSaveTx = async (tx: PendingTransaction) => {
    try {
      const updated = { ...tx, ...editTxData } as PendingTransaction
      // Réinitialiser le retryCount pour forcer la réévaluation
      updated.retryCount = 0
      delete updated.failedAt
      delete updated.lastError

      await updatePendingTransaction(updated)
      setEditingTxId(null)
      toast.success("Transaction modifiée localement.")
      await loadFailedData()
      onResolved?.()
    } catch {
      toast.error("Impossible de sauvegarder la transaction.")
    }
  }

  const handleDeleteTx = async (offlineId: number) => {
    if (!confirm("Voulez-vous vraiment supprimer cette transaction locale ? Elle sera définitivement perdue.")) return
    try {
      await removePendingTransaction(offlineId)
      toast.success("Transaction supprimée.")
      await loadFailedData()
      onResolved?.()
    } catch {
      toast.error("Erreur lors de la suppression.")
    }
  }

  const handleRetryTx = async (tx: PendingTransaction) => {
    setSyncingItemId(tx.id)
    const toastId = toast.loading("Tentative de synchronisation...")
    try {
      const res = await syncSingleTransaction(tx)
      if (res.success) {
        toast.success("✅ Transaction synchronisée avec succès !", { id: toastId })
        await loadFailedData()
        onResolved?.()
      } else {
        toast.error(`❌ Échec : ${res.error || 'Erreur serveur'}`, { id: toastId })
        await loadFailedData()
      }
    } catch {
      toast.error("Erreur lors de la synchronisation.", { id: toastId })
    } finally {
      setSyncingItemId(null)
    }
  }

  // --- ACTIONS COMMANDES ---

  const handleStartEditOrder = (order: PendingOrder) => {
    setEditingOrderId(order.id)
    setEditOrderData({ ...order })
  }

  const handleCancelEditOrder = () => {
    setEditingOrderId(null)
    setEditOrderData({})
  }

  const handleSaveOrder = async (order: PendingOrder) => {
    try {
      const updated = { ...order, ...editOrderData } as PendingOrder
      updated.retryCount = 0
      delete updated.failedAt
      delete updated.lastError

      await updatePendingOrder(updated)
      setEditingOrderId(null)
      toast.success("Commande modifiée localement.")
      await loadFailedData()
      onResolved?.()
    } catch {
      toast.error("Impossible de sauvegarder la commande.")
    }
  }

  const handleDeleteOrder = async (offlineId: number) => {
    if (!confirm("Voulez-vous vraiment supprimer cette commande locale ? Elle sera définitivement perdue.")) return
    try {
      await removePendingOrder(offlineId)
      toast.success("Commande supprimée.")
      await loadFailedData()
      onResolved?.()
    } catch {
      toast.error("Erreur lors de la suppression.")
    }
  }

  const handleRetryOrder = async (order: PendingOrder) => {
    setSyncingItemId(order.id)
    const toastId = toast.loading("Tentative de synchronisation de la commande...")
    try {
      const res = await syncSingleOrder(order)
      if (res.success) {
        toast.success("✅ Commande synchronisée avec succès !", { id: toastId })
        await loadFailedData()
        onResolved?.()
      } else {
        toast.error(`❌ Échec : ${res.error || 'Erreur serveur'}`, { id: toastId })
        await loadFailedData()
      }
    } catch {
      toast.error("Erreur lors de la synchronisation.", { id: toastId })
    } finally {
      setSyncingItemId(null)
    }
  }

  if (!isOpen) return null

  const hasItems = activeTab === 'tx' ? failedTxs.length > 0 : failedOrders.length > 0

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(45, 27, 14, 0.55)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      fontFamily: 'var(--font-sans)',
      animation: 'fadeIn 0.25s ease'
    }}>
      <div style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90dvh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-well)'
        }}>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 800,
              color: 'var(--color-text)',
              fontFamily: 'var(--font-display)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <AlertCircle size={22} color="var(--color-error)" />
              Gestion des erreurs hors-ligne
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--color-muted)' }}>
              Visualisez et modifiez les commandes ou ventes qui n&apos;ont pas pu être envoyées au serveur.
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(131, 116, 107, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--color-text)',
              transition: 'background 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(131, 116, 107, 0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(131, 116, 107, 0.1)'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-well)',
          padding: '0 16px'
        }}>
          <button
            onClick={() => setActiveTab('tx')}
            style={{
              padding: '16px 20px',
              border: 'none',
              background: 'transparent',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: activeTab === 'tx' ? 'var(--color-primary)' : 'var(--color-muted)',
              borderBottom: activeTab === 'tx' ? '3px solid var(--color-primary)' : '3px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <Store size={16} />
            Ventes Caisse ({failedTxs.length})
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            style={{
              padding: '16px 20px',
              border: 'none',
              background: 'transparent',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: activeTab === 'orders' ? 'var(--color-primary)' : 'var(--color-muted)',
              borderBottom: activeTab === 'orders' ? '3px solid var(--color-primary)' : '3px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <ShoppingBag size={16} />
            Commandes Commandées ({failedOrders.length})
          </button>
        </div>

        {/* Content Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          {!hasItems ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 0',
              color: 'var(--color-muted)'
            }}>
              <Check size={48} color="var(--color-success)" style={{ marginBottom: '16px' }} />
              <p style={{ fontWeight: 700, margin: 0, fontSize: '0.95rem' }}>Aucune erreur en attente</p>
              <p style={{ fontSize: '0.8rem', margin: '4px 0 0', textAlign: 'center' }}>
                Toutes les ventes hors-ligne ont été correctement traitées ou synchronisées.
              </p>
            </div>
          ) : (
            activeTab === 'tx' ? (
              failedTxs.map(tx => (
                <div key={tx.id} style={{
                  background: 'var(--color-lift)',
                  border: '1.5px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}>
                  {/* Item Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-primary)', background: 'rgba(129, 84, 49, 0.08)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                        Vente directe
                      </span>
                      <h4 style={{ margin: '8px 0 2px', fontSize: '1rem', fontWeight: 800 }}>
                        {tx.client_name || 'Client anonyme'}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                        Date : {new Date(tx.createdAt).toLocaleString('fr-FR')} • ID: {tx.id.slice(0, 8)}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--color-primary)' }}>
                        {tx.amount.toLocaleString('fr-FR')} €
                      </span>
                      <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 600 }}>
                        Via {tx.payment_method.toUpperCase()}
                      </p>
                    </div>
                  </div>

                  {/* Panier Articles */}
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', borderTop: '1px dashed var(--color-border)', paddingTop: '10px' }}>
                    <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--color-text)' }}>Articles commandés :</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {tx.items.map((item, idx) => (
                        <span key={item.id || idx} style={{ background: 'var(--color-well)', padding: '4px 8px', borderRadius: '6px' }}>
                          {item.quantity}x {item.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Error Notification */}
                  <div style={{
                    background: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#991B1B', fontWeight: 700, fontSize: '0.82rem' }}>
                      <AlertCircle size={15} />
                      <span>{getFriendlyError(tx.lastError)}</span>
                    </div>
                    {tx.lastError && (
                      <div>
                        <button 
                          onClick={() => toggleErrorDetails(tx.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: '#B91C1C',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {expandedErrors[tx.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {expandedErrors[tx.id] ? "Masquer les détails techniques" : "Voir l'erreur technique brute"}
                        </button>
                        {expandedErrors[tx.id] && (
                          <pre style={{
                            margin: '8px 0 0',
                            padding: '10px',
                            background: '#FFF',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            overflowX: 'auto',
                            color: '#555',
                            border: '1px solid #F3F4F6'
                          }}>{tx.lastError}</pre>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Edit Form */}
                  {editingTxId === tx.id && (
                    <div style={{
                      padding: '16px',
                      background: 'var(--color-well)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1.5px solid var(--color-primary-container)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      <h5 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)' }}>Modifier la transaction</h5>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Nom du client</label>
                          <input 
                            type="text"
                            value={editTxData.client_name ?? ''}
                            onChange={e => setEditTxData(prev => ({ ...prev, client_name: e.target.value }))}
                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', outline: 'none' }}
                          />
                        </div>
                        <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Montant (€)</label>
                          <input 
                            type="number"
                            step="0.01"
                            value={editTxData.amount ?? 0}
                            onChange={e => setEditTxData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', outline: 'none' }}
                          />
                        </div>
                        <div style={{ width: '140px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Paiement</label>
                          <select 
                            value={editTxData.payment_method ?? 'espece'}
                            onChange={e => setEditTxData(prev => ({ ...prev, payment_method: e.target.value }))}
                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', outline: 'none', background: 'white' }}
                          >
                            <option value="espece">Espèces</option>
                            <option value="carte">Carte Bancaire</option>
                            <option value="mobile">Paiement Mobile</option>
                            <option value="cheque">Chèque</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                        <button onClick={handleCancelEditTx} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                          Annuler
                        </button>
                        <button onClick={() => handleSaveTx(tx)} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                          Sauvegarder
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions Buttons */}
                  {editingTxId !== tx.id && (
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                      <button
                        onClick={() => handleDeleteTx(tx.offlineId!)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1.5px solid var(--color-border)',
                          background: 'transparent',
                          color: 'var(--color-error)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700
                        }}
                      >
                        <Trash2 size={14} /> Supprimer
                      </button>
                      <button
                        onClick={() => handleStartEditTx(tx)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1.5px solid var(--color-border)',
                          background: 'transparent',
                          color: 'var(--color-text)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700
                        }}
                      >
                        <Edit3 size={14} /> Modifier
                      </button>
                      <button
                        disabled={syncingItemId !== null}
                        onClick={() => handleRetryTx(tx)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'var(--color-secondary)',
                          color: 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          opacity: syncingItemId ? 0.7 : 1
                        }}
                      >
                        <RefreshCw size={14} className={syncingItemId === tx.id ? 'animate-spin' : ''} /> 
                        {syncingItemId === tx.id ? 'Envoi...' : 'Retenter l\'envoi'}
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              failedOrders.map(order => (
                <div key={order.id} style={{
                  background: 'var(--color-lift)',
                  border: '1.5px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}>
                  {/* Item Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-secondary)', background: 'rgba(75, 100, 80, 0.08)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                        Commande client
                      </span>
                      <h4 style={{ margin: '8px 0 2px', fontSize: '1rem', fontWeight: 800 }}>
                        {order.customer_name || 'Client inconnu'}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                        Retrait : {order.pickup_date ? new Date(order.pickup_date).toLocaleString('fr-FR') : 'Non planifié'} • ID: {order.id.slice(0, 8)}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--color-primary)' }}>
                        {(order.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0) - (order.discount_amount ?? 0)).toLocaleString('fr-FR')} €
                      </span>
                      <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 600 }}>
                        Acompte : {order.deposit_amount ?? 0} €
                      </p>
                    </div>
                  </div>

                  {/* Détails commandes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', color: 'var(--color-muted)', borderTop: '1px dashed var(--color-border)', paddingTop: '10px' }}>
                    <div>
                      <strong style={{ color: 'var(--color-text)' }}>Contact : </strong>{order.customer_contact || 'Non renseigné'}
                      {order.customization_notes && (
                        <div style={{ marginTop: '4px' }}>
                          <strong style={{ color: 'var(--color-text)' }}>Notes de personnalisation : </strong>{order.customization_notes}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                      {order.items.map((item, idx) => (
                        <span key={item.id || idx} style={{ background: 'var(--color-well)', padding: '4px 8px', borderRadius: '6px' }}>
                          {item.quantity}x {item.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Error Notification */}
                  <div style={{
                    background: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#991B1B', fontWeight: 700, fontSize: '0.82rem' }}>
                      <AlertCircle size={15} />
                      <span>{getFriendlyError(order.lastError)}</span>
                    </div>
                    {order.lastError && (
                      <div>
                        <button 
                          onClick={() => toggleErrorDetails(order.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: '#B91C1C',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {expandedErrors[order.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {expandedErrors[order.id] ? "Masquer les détails techniques" : "Voir l'erreur technique brute"}
                        </button>
                        {expandedErrors[order.id] && (
                          <pre style={{
                            margin: '8px 0 0',
                            padding: '10px',
                            background: '#FFF',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            overflowX: 'auto',
                            color: '#555',
                            border: '1px solid #F3F4F6'
                          }}>{order.lastError}</pre>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Edit Form */}
                  {editingOrderId === order.id && (
                    <div style={{
                      padding: '16px',
                      background: 'var(--color-well)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1.5px solid var(--color-primary-container)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      <h5 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)' }}>Modifier la commande</h5>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Nom du client</label>
                          <input 
                            type="text"
                            value={editOrderData.customer_name ?? ''}
                            onChange={e => setEditOrderData(prev => ({ ...prev, customer_name: e.target.value }))}
                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', outline: 'none' }}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Téléphone/Contact</label>
                          <input 
                            type="text"
                            value={editOrderData.customer_contact ?? ''}
                            onChange={e => setEditOrderData(prev => ({ ...prev, customer_contact: e.target.value }))}
                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', outline: 'none' }}
                          />
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Date/Heure de retrait</label>
                          <input 
                            type="datetime-local"
                            value={editOrderData.pickup_date ? editOrderData.pickup_date.substring(0, 16) : ''}
                            onChange={e => setEditOrderData(prev => ({ ...prev, pickup_date: e.target.value }))}
                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', outline: 'none' }}
                          />
                        </div>
                        <div style={{ width: '150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Acompte (€)</label>
                          <input 
                            type="number"
                            step="0.01"
                            value={editOrderData.deposit_amount ?? 0}
                            onChange={e => setEditOrderData(prev => ({ ...prev, deposit_amount: parseFloat(e.target.value) || 0 }))}
                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', outline: 'none' }}
                          />
                        </div>
                        <div style={{ width: '150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Type réception</label>
                          <select 
                            value={editOrderData.reception_type ?? 'a_emporter'}
                            onChange={e => setEditOrderData(prev => ({ ...prev, reception_type: e.target.value }))}
                            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', outline: 'none', background: 'white' }}
                          >
                            <option value="a_emporter">À emporter</option>
                            <option value="sur_place">Sur place</option>
                            <option value="livraison">Livraison</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Notes de personnalisation</label>
                        <textarea 
                          rows={2}
                          value={editOrderData.customization_notes ?? ''}
                          onChange={e => setEditOrderData(prev => ({ ...prev, customization_notes: e.target.value }))}
                          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                        <button onClick={handleCancelEditOrder} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                          Annuler
                        </button>
                        <button onClick={() => handleSaveOrder(order)} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: 'white', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                          Sauvegarder
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions Buttons */}
                  {editingOrderId !== order.id && (
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                      <button
                        onClick={() => handleDeleteOrder(order.offlineId!)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1.5px solid var(--color-border)',
                          background: 'transparent',
                          color: 'var(--color-error)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700
                        }}
                      >
                        <Trash2 size={14} /> Supprimer
                      </button>
                      <button
                        onClick={() => handleStartEditOrder(order)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1.5px solid var(--color-border)',
                          background: 'transparent',
                          color: 'var(--color-text)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700
                        }}
                      >
                        <Edit3 size={14} /> Modifier
                      </button>
                      <button
                        disabled={syncingItemId !== null}
                        onClick={() => handleRetryOrder(order)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'var(--color-secondary)',
                          color: 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          opacity: syncingItemId ? 0.7 : 1
                        }}
                      >
                        <RefreshCw size={14} className={syncingItemId === order.id ? 'animate-spin' : ''} /> 
                        {syncingItemId === order.id ? 'Envoi...' : 'Retenter l\'envoi'}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'var(--color-well)'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              borderRadius: '99px',
              border: '1.5px solid var(--color-border)',
              background: 'white',
              color: 'var(--color-text)',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Fermer
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
