/**
 * Pâtiss'App — Synchronisation Offline → Online
 * 
 * Rejoue les transactions et commandes stockées en IndexedDB
 * lorsque la connexion revient.
 */

import {
  getPendingTransactions,
  removePendingTransaction,
  getPendingOrders,
  removePendingOrder,
  type PendingTransaction,
  type PendingOrder
} from './db'
import { encaisserTransaction } from '@/lib/actions/caisse'
import { createOrder } from '@/lib/actions/orders'
import { createClient } from '@/lib/supabase/client'

export type SyncResult = {
  syncedTransactions: number
  failedTransactions: number
  syncedOrders: number
  failedOrders: number
}

/**
 * Synchronise toutes les données en attente.
 * Appelée automatiquement quand la connexion revient.
 */
export async function syncPendingData(): Promise<SyncResult> {
  const result: SyncResult = {
    syncedTransactions: 0,
    failedTransactions: 0,
    syncedOrders: 0,
    failedOrders: 0
  }

  // 0. Vérifier et forcer le rafraîchissement de la session JWT pour éviter les 401
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      await supabase.auth.refreshSession()
    }
  } catch (err) {
    console.warn('[Offline Sync] Erreur lors du contrôle de la session', err)
  }

  // 1. Synchroniser les transactions avec isolation des échecs
  const pendingTx = await getPendingTransactions()
  
  await Promise.allSettled(pendingTx.map(async (tx) => {
    try {
      const res = await encaisserTransaction({
        order_id: tx.order_id,
        client_name: tx.client_name,
        amount: tx.amount,
        payment_method: tx.payment_method,
        payment_details: tx.payment_details,
        items: tx.items
      })

      if (!res.error) {
        await removePendingTransaction(tx.offlineId!)
        result.syncedTransactions++
      } else {
        result.failedTransactions++
      }
    } catch {
      result.failedTransactions++
    }
  }))

  // 2. Synchroniser les commandes
  const pendingOrders = await getPendingOrders()

  await Promise.allSettled(pendingOrders.map(async (order) => {
    try {
      const year = new Date().getFullYear()
      const rand = Math.floor(1000 + Math.random() * 9000)

      const res = await createOrder({
        order_number: `CMD-${year}-${rand}`,
        status: 'pending',
        priority: order.priority as any,
        customer_name: order.customer_name,
        customer_contact: order.customer_contact,
        reception_type: order.reception_type as any,
        pickup_date: order.pickup_date,
        subtotal: order.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0),
        total_amount: order.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0),
        deposit_amount: 0,
        balance: order.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0),
        customization_notes: order.customization_notes,
        items: order.items.map(i => ({
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
        result.syncedOrders++
      } else {
        result.failedOrders++
      }
    } catch {
      result.failedOrders++
    }
  }))

  return result
}
