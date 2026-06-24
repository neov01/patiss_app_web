/**
 * Pâtiss'App — Synchronisation Offline → Online
 * 
 * Rejoue les transactions et commandes stockées en IndexedDB
 * lorsque la connexion revient.
 */

import {
  getPendingTransactions,
  removePendingTransaction,
  updatePendingTransactionRetry,
  getPendingOrders,
  removePendingOrder,
  updatePendingOrderRetry,
  MAX_OFFLINE_RETRIES,
  type PendingTransaction,
  type PendingOrder
} from './db'
import { encaisserTransaction } from '@/lib/actions/caisse'
import { createOrder } from '@/lib/actions/orders'
import { createClient } from '@/lib/supabase/client'
import type { OrderFormValues } from '@/lib/schemas/order.schema'

export type SyncResult = {
  syncedTransactions: number
  failedTransactions: number
  deadTransactions: number  // transactions > MAX_RETRIES, nécessitent attention manuelle
  syncedOrders: number
  failedOrders: number
  deadOrders: number  // commandes > MAX_RETRIES, nécessitent attention manuelle
}

/**
 * Synchronise toutes les données en attente.
 * Appelée automatiquement quand la connexion revient.
 */
export async function syncPendingData(): Promise<SyncResult> {
  const result: SyncResult = {
    syncedTransactions: 0,
    failedTransactions: 0,
    deadTransactions: 0,
    syncedOrders: 0,
    failedOrders: 0,
    deadOrders: 0
  }

  // 0. Only refresh session when network is available — calling refreshSession()
  //    offline throws "Failed to fetch" with no caller to catch it.
  if (!navigator.onLine) {
    return result
  }

  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      await supabase.auth.refreshSession()
    }
  } catch (err) {
    console.warn('[Offline Sync] Session check failed', err)
  }

  // 1. Synchroniser les transactions avec dead-letter queue
  const pendingTx = await getPendingTransactions()

  await Promise.allSettled(pendingTx.map(async (tx) => {
    if ((tx.retryCount ?? 0) >= MAX_OFFLINE_RETRIES) {
      result.deadTransactions++
      return
    }

    const res = await syncSingleTransaction(tx)
    if (res.success) {
      result.syncedTransactions++
    } else {
      result.failedTransactions++
    }
  }))

  // 2. Synchroniser les commandes
  const pendingOrders = await getPendingOrders()

  await Promise.allSettled(pendingOrders.map(async (order) => {
    if ((order.retryCount ?? 0) >= MAX_OFFLINE_RETRIES) {
      result.deadOrders++
      return
    }

    const res = await syncSingleOrder(order)
    if (res.success) {
      result.syncedOrders++
    } else {
      result.failedOrders++
    }
  }))

  return result
}

export async function syncSingleTransaction(
  tx: PendingTransaction
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await encaisserTransaction({
      id: tx.id,
      order_id: tx.order_id,
      client_name: tx.client_name,
      amount: tx.amount,
      payment_method: tx.payment_method,
      payment_details: tx.payment_details,
      items: tx.items
    })

    if (!res.error) {
      await removePendingTransaction(tx.offlineId!)
      return { success: true }
    } else {
      console.warn('[Sync] Transaction rejetée par le serveur:', res.error)
      await updatePendingTransactionRetry(tx.offlineId!, res.error)
      return { success: false, error: res.error }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[Sync] Erreur réseau sur transaction:', errMsg)
    await updatePendingTransactionRetry(tx.offlineId!, errMsg)
    return { success: false, error: errMsg }
  }
}

export async function syncSingleOrder(
  order: PendingOrder
): Promise<{ success: boolean; error?: string }> {
  try {
    const year = new Date().getFullYear()
    const rand = Math.floor(1000 + Math.random() * 9000)

    const subtotal = order.items.reduce((sum: number, i: { quantity: number; unit_price: number }) => sum + i.quantity * i.unit_price, 0)
    const discountAmount = order.discount_amount ?? 0
    const totalAmount = Math.max(0, subtotal - discountAmount)
    const depositAmount = order.deposit_amount ?? 0
    const totalPaid = order.payments && order.payments.length > 0
      ? order.payments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0)
      : depositAmount
    const balance = Math.max(0, totalAmount - totalPaid)

    const res = await createOrder({
      id: order.id,    // UUID client-side → idempotence
      order_number: `CMD-${year}-${rand}`,
      status: 'confirmed',
      priority: order.priority,
      customer_name: order.customer_name,
      customer_contact: order.customer_contact,
      reception_type: order.reception_type as OrderFormValues['reception_type'],
      pickup_date: order.pickup_date,
      subtotal: subtotal,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      deposit_amount: depositAmount,
      balance: balance,
      customization_notes: order.customization_notes,
      deposit_payment_method: order.deposit_payment_method,
      payments: order.payments,
      items: order.items.map((i: { id: string; product_id: string | null; name: string; quantity: number; unit_price: number }) => ({
        id: i.id,         // UUID item client-side → idempotence
        product_id: i.product_id || undefined,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.quantity * i.unit_price,
        from_inventory: !!i.product_id
      }))
    })

    if (!res.error) {
      await removePendingOrder(order.offlineId!)
      return { success: true }
    } else {
      console.warn('[Sync] Commande rejetée par le serveur:', res.error)
      await updatePendingOrderRetry(order.offlineId!, res.error)
      return { success: false, error: res.error }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[Sync] Erreur réseau sur commande:', errMsg)
    await updatePendingOrderRetry(order.offlineId!, errMsg)
    return { success: false, error: errMsg }
  }
}
