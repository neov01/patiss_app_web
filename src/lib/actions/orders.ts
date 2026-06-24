'use server'

import { revalidatePath } from 'next/cache'
import { ensureActiveSubscription } from '@/lib/utils/subscription'
import { z } from 'zod'
import { AuthContextError, requireOpenSalesSession, requireRoleContext } from '@/lib/auth/organization-context'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { addLoyaltyPoints, calculateLoyaltyPoints, subtractLoyaltyPoints } from '@/lib/domain/loyalty'
import { getPhoneSearchCandidates, normalizeCustomerPhone } from '@/lib/domain/phone'

import { orderSchema } from '@/lib/schemas/order.schema'

type CreateOrderAtomicArgs = {
    p_order: Record<string, unknown>
    p_items: Array<Record<string, unknown>>
    p_payments: Array<Record<string, unknown>>
    p_metrics: Record<string, unknown> | null
}

type CreateOrderRpcClient = {
    rpc(
        fn: 'create_order_atomic',
        args: CreateOrderAtomicArgs
    ): Promise<{ data: { order: unknown } | null; error: { message?: string } | null }>
}

type PaymentInput = {
    amount: number
    payment_method?: string
    label_type: 'ACOMPTE' | 'SOLDE'
}

type HistoricalItemInput = {
    id?: string
    product_id?: string | null
    name: string
    quantity: number
    unit_price: number
    from_inventory?: boolean
}

type HistoricalOrderInput = {
    order_number?: string
    customer_name: string
    customer_contact?: string
    pickup_date: string
    created_at: string
    total_amount: number
    deposit_amount: number
    deposit_payment_method?: string
    balance_payment_method?: string
    customization_notes?: string
    custom_image_url?: string
    priority?: string
    reception_type?: string
    status?: string
    items?: HistoricalItemInput[]
    payments?: PaymentInput[]
}

function getErrorMessage(error: unknown, fallback = 'Erreur inconnue') {
    return error instanceof Error ? error.message : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function normalizePaymentMethod(method: string | undefined): string {
    if (!method) return 'cash'
    const m = method.toLowerCase().trim()
    if (m === 'espèces' || m === 'especes' || m === 'cash') return 'cash'
    if (m === 'orange money' || m === 'orange_money') return 'orange_money'
    if (m === 'wave') return 'wave'
    if (m === 'mtn momo' || m === 'mobile money' || m === 'mobile_money') return 'mobile_money'
    if (m === 'moov money' || m === 'moov_money') return 'moov_money'
    return 'cash'
}

function toPayments(value: unknown): PaymentInput[] {
    if (!Array.isArray(value)) return []
    return value
        .filter(isRecord)
        .map(payment => ({
            amount: Number(payment.amount ?? 0),
            payment_method: normalizePaymentMethod(typeof payment.payment_method === 'string' ? payment.payment_method : undefined),
            label_type: payment.label_type === 'SOLDE' ? 'SOLDE' : 'ACOMPTE',
        }))
}

export async function createOrder(input: unknown) {
    try {
        // Bloquer si l'abonnement est expiré
        await ensureActiveSubscription()

        // 1. Validation Serveur (Zod)
        const result = orderSchema.safeParse(input)
        if (!result.success) {
            const errors = result.error.flatten().fieldErrors
            const firstErr = Object.values(errors).flat()[0]
            return { error: firstErr || 'Données de commande invalides' }
        }
        const formData = result.data
        const payments = isRecord(input) ? toPayments(input.payments) : []

        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])
        await requireOpenSalesSession(context)
        const { supabase } = context

        const metrics = formData.creation_started_at && formData.creation_completed_at && typeof formData.creation_duration_seconds === 'number'
            ? {
                started_at: formData.creation_started_at,
                completed_at: formData.creation_completed_at,
                duration_seconds: formData.creation_duration_seconds,
            }
            : null

        // Traduire le statut vers la nouvelle nomenclature
        let resolvedStatus = formData.status || 'confirmed'
        if (resolvedStatus === 'pending') resolvedStatus = 'confirmed'
        else if (resolvedStatus === 'production') resolvedStatus = 'in_preparation'
        else if (resolvedStatus === 'completed') resolvedStatus = 'delivered'

        const { data, error } = await (supabase as unknown as CreateOrderRpcClient).rpc('create_order_atomic', {
            p_order: {
                id: formData.id ?? null,
                order_number: formData.order_number,
                customer_id: formData.customer_id ?? null,
                customer_name: formData.customer_name,
                customer_contact: formData.customer_contact ?? null,
                pickup_date: formData.pickup_date,
                total_amount: formData.total_amount,
                deposit_amount: formData.deposit_amount,
                custom_image_url: formData.custom_image_url ?? null,
                priority: formData.priority,
                reception_type: formData.reception_type,
                delivery_address: formData.delivery_address ?? null,
                order_channel: formData.order_channel ?? null,
                subtotal: formData.subtotal,
                discount_amount: formData.discount_amount || 0,
                customization_notes: formData.customization_notes ?? null,
                status: resolvedStatus,
                deposit_payment_method: normalizePaymentMethod(formData.deposit_payment_method || undefined),
                created_by: context.userId,
            },
            p_items: formData.items.map(item => ({
                id: item.id ?? null,
                product_id: item.product_id ?? null,
                name: item.name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                from_inventory: item.from_inventory,
            })),
            p_payments: payments.map(payment => ({
                amount: payment.amount,
                payment_method: payment.payment_method,
                label_type: payment.label_type || 'ACOMPTE',
            })),
            p_metrics: metrics,
        })

        if (error) {
            console.error('Erreur création commande atomique:', error)
            const isDuplicate = error.message?.includes('duplicate key') || 
                                (error as { code?: string }).code === '23505'
            if (isDuplicate) {
                // Déjà traité en base, on considère cela comme un succès
                return { data: { id: formData.id } }
            }
            return { error: error.message || 'Erreur lors de la création de la commande' }
        }

        revalidatePath('/commandes')
        revalidatePath('/dashboard')
        return { data: data?.order }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e, 'Erreur lors de la création de la commande') }
    }
}

export async function updateOrderStatus(orderId: string, status: string) {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])
        await requireOpenSalesSession(context)

        const { error } = await context.supabase
            .from('orders')
            .update({ status })
            .eq('id', orderId)
            .eq('organization_id', context.organizationId)

        if (error) return { error: error.message }
        revalidatePath('/commandes')
        return { success: true }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

export async function deleteOrder(orderId: string) {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['gerant', 'super_admin'])
        await requireOpenSalesSession(context)
        const { supabase, organizationId } = context

        // 1. Récupérer les transactions liées pour déduire les points de fidélité correspondants
        const { data: linkedTransactions } = await supabase
            .from('transactions')
            .select('amount, customer_id')
            .eq('order_id', orderId)
            .eq('organization_id', organizationId)

        if (linkedTransactions && linkedTransactions.length > 0) {
            for (const tx of linkedTransactions) {
                if (tx.customer_id && Number(tx.amount) > 0) {
                    const pointsToSubtract = calculateLoyaltyPoints(Number(tx.amount))
                    if (pointsToSubtract > 0) {
                        const { data: cust } = await supabase
                            .from('customers')
                            .select('loyalty_points, lifetime_points')
                            .eq('id', tx.customer_id)
                            .eq('organization_id', organizationId)
                            .single()
                        if (cust) {
                            await supabase.from('customers').update({
                                loyalty_points: subtractLoyaltyPoints(cust.loyalty_points, pointsToSubtract),
                                lifetime_points: subtractLoyaltyPoints(cust.lifetime_points, pointsToSubtract)
                            })
                                .eq('id', tx.customer_id)
                                .eq('organization_id', organizationId)
                        }
                    }
                }
            }
            // 2. Supprimer les transactions associées
            await supabase
                .from('transactions')
                .delete()
                .eq('order_id', orderId)
                .eq('organization_id', organizationId)
        }

        // 3. Supprimer la commande
        const { error } = await supabase
            .from('orders')
            .delete()
            .eq('id', orderId)
            .eq('organization_id', organizationId)
        if (error) return { error: error.message }

        revalidatePath('/commandes')
        revalidatePath('/dashboard')
        revalidatePath('/caisse')

        return { success: true }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

export async function updateOrderDetails(
    orderId: string, 
    details: { customer_name?: string; customer_contact?: string; pickup_date?: string; customization_notes?: string | null }
) {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])
        await requireOpenSalesSession(context)
        const { error } = await context.supabase
            .from('orders')
            .update(details)
            .eq('id', orderId)
            .eq('organization_id', context.organizationId)
        if (error) return { error: error.message }
        revalidatePath('/commandes')
        revalidatePath('/dashboard')
        revalidatePath('/caisse')
        return { success: true }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

const vitrineSaleSchema = z.object({
    id: z.string().uuid().optional(),
    total_amount: z.number().min(0),
    items: z.array(z.object({
        id: z.string().uuid().optional(),
        product_id: z.string().uuid(),
        quantity: z.number().positive(),
        unit_price: z.number().min(0)
    })).min(1)
})

export async function createVitrineSale(input: unknown) {
    try {
        await ensureActiveSubscription()

        const result = vitrineSaleSchema.safeParse(input)
        if (!result.success) return { error: 'Données de vente invalides' }
        const formData = result.data

        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])
        await requireOpenSalesSession(context)
        const { supabase } = context

        const { error } = await (supabase as unknown as CreateOrderRpcClient).rpc('create_order_atomic', {
            p_order: {
                id: formData.id ?? null,
                order_number: `VIT-${Date.now()}`,
                customer_id: null,
                customer_name: 'Client Vitrine',
                customer_contact: null,
                pickup_date: new Date().toISOString(),
                total_amount: formData.total_amount,
                deposit_amount: formData.total_amount,
                custom_image_url: null,
                priority: 'normale',
                reception_type: 'retrait',
                delivery_address: null,
                order_channel: 'vitrine',
                subtotal: formData.total_amount,
                discount_amount: 0,
                customization_notes: null,
                status: 'completed',
                deposit_payment_method: 'cash',
                created_by: context.userId,
            },
            p_items: formData.items.map(item => ({
                id: item.id ?? null,
                product_id: item.product_id,
                name: 'Article vitrine',
                quantity: item.quantity,
                unit_price: item.unit_price,
                from_inventory: true,
            })),
            p_payments: formData.total_amount > 0 ? [{
                amount: formData.total_amount,
                payment_method: 'cash',
                label_type: 'SOLDE',
            }] : [],
            p_metrics: null,
        })

        if (error) return { error: error.message || 'Erreur lors de la vente vitrine' }

        revalidatePath('/dashboard')
        revalidatePath('/commandes')
        return { success: true }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

export async function importHistoricalOrder(input: unknown) {
    let context: Awaited<ReturnType<typeof requireRoleContext>>
    try {
        context = await requireRoleContext(['gerant', 'super_admin', 'vendeur', 'patissier'])
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: 'Non authentifié' }
    }

    const { data: importProfile } = await context.supabase
        .from('profiles')
        .select('can_import_history')
        .eq('id', context.userId)
        .eq('organization_id', context.organizationId)
        .single()

    const isAuthorized = ['gerant', 'super_admin'].includes(context.role) || importProfile?.can_import_history
    if (!isAuthorized) {
        return { error: 'Accès refusé. Vous n\'avez pas l\'autorisation pour importer des données historiques.' }
    }

    const orgId = context.organizationId

    // 2. Préparation des données
    if (!isRecord(input)) {
        return { error: 'Données obligatoires manquantes.' }
    }

    const historicalInput = input as Partial<HistoricalOrderInput>

    const {
        order_number,
        customer_name,
        customer_contact,
        pickup_date,      // Date de retrait (ex: 2024-01-04)
        created_at,       // Date de prise de commande (ex: 2024-01-01)
        total_amount,
        deposit_amount,
        deposit_payment_method = 'Espèces',
        balance_payment_method = 'Espèces',
        customization_notes,
        custom_image_url, // Image d'inspiration passée en entrée
        priority = 'normale',
        reception_type = 'retrait',
        status: inputStatus,
        items = [],
        payments = [] // Paiements multiples passés en entrée
    } = historicalInput

    // Déterminer dynamiquement le statut par défaut en fonction de la date de retrait
    let status = inputStatus
    if (!status) {
        status = 'completed'
        if (pickup_date) {
            const pickupDateTime = new Date(pickup_date).getTime()
            const nowTime = new Date().getTime()
            if (pickupDateTime > nowTime) {
                status = 'pending'
            }
        }
    }

    if (!customer_name || !created_at || !pickup_date || total_amount === undefined || deposit_amount === undefined) {
        return { error: 'Données obligatoires manquantes.' }
    }

    // Instancier le client d'administration pour forcer created_at
    const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Auto-enregistrement client historique dans le CRM : si un téléphone est fourni,
    // on cherche ou crée le client silencieusement pour alimenter le CRM & la fidélité.
    let resolvedCustomerId: string | null = null
    const clientPhone = normalizeCustomerPhone(customer_contact)

    if (clientPhone && customer_name && customer_name !== 'Client Vitrine') {
        const phoneCandidates = getPhoneSearchCandidates(customer_contact)

        const { data: existingCustomer } = await supabaseAdmin
            .from('customers')
            .select('id')
            .eq('organization_id', orgId)
            .in('phone', phoneCandidates)
            .limit(1)
            .maybeSingle()

        if (existingCustomer) {
            resolvedCustomerId = existingCustomer.id
        } else {
            const { data: newCustomer } = await supabaseAdmin
                .from('customers')
                .insert({
                    name: customer_name,
                    phone: clientPhone,
                    organization_id: orgId,
                    created_at: created_at // Forcer la date de création historique pour ce client
                })
                .select('id')
                .single()
            resolvedCustomerId = newCustomer?.id ?? null
        }
    }

    // Ajustements en cas de paiements multiples
    let resolvedDepositAmount = deposit_amount
    let resolvedBalance = Math.max(0, total_amount - deposit_amount)
    let resolvedPaymentStatus = deposit_amount >= total_amount
        ? 'SOLDEE'
        : deposit_amount > 0
            ? 'PARTIEL'
            : 'EN_ATTENTE'

    if (payments && payments.length > 0) {
        const sumAcompte = payments.filter(p => p.label_type === 'ACOMPTE').reduce((sum, p) => sum + p.amount, 0)
        const sumSolde = payments.filter(p => p.label_type === 'SOLDE').reduce((sum, p) => sum + p.amount, 0)
        const totalPaid = sumAcompte + sumSolde

        resolvedDepositAmount = sumAcompte
        resolvedBalance = Math.max(0, total_amount - totalPaid)
        resolvedPaymentStatus = totalPaid >= total_amount
            ? 'SOLDEE'
            : totalPaid > 0
                ? 'PARTIEL'
                : 'EN_ATTENTE'
    }

    // 3. Insertion de la commande historique
    const orderId = randomUUID()
    const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .insert({
            id: orderId,
            organization_id: orgId,
            order_number: order_number || `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            customer_id: resolvedCustomerId,
            customer_name,
            customer_contact,
            pickup_date,
            total_amount,
            deposit_amount: resolvedDepositAmount,
            priority,
            reception_type,
            status,
            payment_status: status === 'completed' || status === 'delivered' ? 'SOLDEE' : resolvedPaymentStatus,
            balance: status === 'completed' || status === 'delivered' ? 0 : resolvedBalance,
            customization_notes,
            custom_image_url,
            created_by: context.userId,
            created_at, // Forcer la date de prise de commande
            is_historical: true
        })
        .select()
        .single()

    if (orderError) return { error: `Erreur insertion commande : ${orderError.message}` }

    // 4. Insertion des lignes d'articles
    if (items && items.length > 0) {
        const { error: itemsError } = await supabaseAdmin
            .from('order_items')
            .insert(
                items.map(i => ({
                    id: i.id || randomUUID(),
                    order_id: orderId,
                    product_id: i.product_id || null,
                    name: i.name,
                    quantity: i.quantity,
                    unit_price: i.unit_price,
                    from_inventory: i.from_inventory || false,
                    created_at // Forcer la date d'article identique à la prise de commande
                }))
            )
        if (itemsError) console.error("Erreur insertion order_items:", itemsError)
    }

    // 5. Insertion des transactions avec les dates respectives (sans session active)
    if (payments && payments.length > 0) {
        let totalPaidAtCreation = 0
        for (const p of payments) {
            if (p.amount > 0) {
                // Utiliser la date historique de prise de commande pour un acompte,
                // et la date historique de retrait pour le solde.
                const paymentDate = p.label_type === 'ACOMPTE' ? created_at : pickup_date

                const { error: txError } = await supabaseAdmin.from('transactions').insert({
                    id: randomUUID(),
                    organization_id: orgId,
                    order_id: orderId,
                    customer_id: resolvedCustomerId,
                    client_name: customer_name,
                    amount: p.amount,
                    payment_method: p.payment_method || 'Espèces',
                    label_type: p.label_type,
                    created_by: context.userId,
                    created_at: paymentDate,
                    is_historical: true
                })
                if (txError) {
                    console.error("Erreur insertion transaction historique:", txError)
                    throw new Error(`Erreur insertion transaction : ${txError.message}`)
                }
                totalPaidAtCreation += p.amount
            }
        }

        // Créditer les points de fidélité pour le client historique
        if (resolvedCustomerId && totalPaidAtCreation > 0) {
            const points = calculateLoyaltyPoints(totalPaidAtCreation)
            if (points > 0) {
                const { data: cust } = await supabaseAdmin
                    .from('customers')
                    .select('loyalty_points, lifetime_points')
                    .eq('id', resolvedCustomerId)
                    .single()
                if (cust) {
                    await supabaseAdmin
                        .from('customers')
                        .update({
                            loyalty_points: addLoyaltyPoints(cust.loyalty_points, points),
                            lifetime_points: addLoyaltyPoints(cust.lifetime_points, points),
                        })
                        .eq('id', resolvedCustomerId)
                }
            }
        }
    } else {
        // Transaction Acompte (Logique classique)
        if (deposit_amount > 0) {
            const isFullyPaidByDeposit = deposit_amount >= total_amount
            const labelType = isFullyPaidByDeposit ? 'SOLDE' : 'ACOMPTE'
            
            const { error: txError } = await supabaseAdmin.from('transactions').insert({
                id: randomUUID(),
                organization_id: orgId,
                order_id: orderId,
                customer_id: resolvedCustomerId,
                client_name: customer_name,
                amount: deposit_amount,
                payment_method: deposit_payment_method,
                label_type: labelType,
                created_by: context.userId,
                created_at, // Date de prise de commande (date de l'acompte)
                is_historical: true
            })
            if (txError) {
                console.error("Erreur insertion transaction acompte:", txError)
                throw new Error(`Erreur insertion transaction acompte : ${txError.message}`)
            }
        }

        // Transaction Solde (si la commande est terminée et qu'il y a un solde à payer)
        const isCompleted = status === 'completed' || status === 'delivered'
        if (isCompleted && resolvedBalance > 0) {
            const { error: txError } = await supabaseAdmin.from('transactions').insert({
                id: randomUUID(),
                organization_id: orgId,
                order_id: orderId,
                customer_id: resolvedCustomerId,
                client_name: customer_name,
                amount: resolvedBalance,
                payment_method: balance_payment_method,
                label_type: 'SOLDE',
                created_by: context.userId,
                created_at: pickup_date, // Date de retrait (date du paiement du solde)
                is_historical: true
            })
            if (txError) {
                console.error("Erreur insertion transaction solde:", txError)
                throw new Error(`Erreur insertion transaction solde : ${txError.message}`)
            }
        }

        // Créditer les points de fidélité pour le client historique (1 point par 1000 FCFA payés)
        if (resolvedCustomerId) {
            const amountPaid = isCompleted ? total_amount : deposit_amount
            const points = calculateLoyaltyPoints(amountPaid)
            if (points > 0) {
                const { data: cust } = await supabaseAdmin
                    .from('customers')
                    .select('loyalty_points, lifetime_points')
                    .eq('id', resolvedCustomerId)
                    .single()
                if (cust) {
                    await supabaseAdmin
                        .from('customers')
                        .update({
                            loyalty_points: addLoyaltyPoints(cust.loyalty_points, points),
                            lifetime_points: addLoyaltyPoints(cust.lifetime_points, points),
                        })
                        .eq('id', resolvedCustomerId)
                }
            }
        }
    }

    revalidatePath('/commandes')
    revalidatePath('/dashboard')
    return { success: true, data: order }
}

export async function getHistoricalOrders(filters: {
    page?: number
    pageSize?: number
    period?: 'today' | 'week' | 'month' | 'custom' | 'all'
    startDate?: string
    endDate?: string
    status?: string
    customerName?: string
    customerContact?: string
    amount?: number
    paymentStatus?: 'all' | 'solded' | 'deposit' | 'unpaid'
    paymentMethod?: string
    searchQuery?: string
}) {
    try {
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur', 'patissier'])
        const { supabase, organizationId } = context

        const page = filters.page || 1
        const pageSize = filters.pageSize || 20
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        // 1. Détecter si une session de caisse est ouverte
        const { data: openSession } = await supabase
            .from('sales_sessions')
            .select('id, opened_at')
            .eq('organization_id', organizationId)
            .eq('status', 'open')
            .maybeSingle()

        const isSessionOpen = !!openSession
        const todayStr = new Date().toISOString().split('T')[0]

        // 2. Construire le select de base (inclut désormais order_payments)
        let selectStr = '*, order_items(*, products(name)), order_payments(*), creator_profile:profiles!orders_created_by_fkey(full_name, role_slug)'
        if (filters.paymentMethod) {
            selectStr += ', transactions!inner(payment_method)'
        }

        let query = supabase
            .from('orders')
            .select(selectStr, { count: 'exact' })
            .eq('organization_id', organizationId)

        // 3. Appliquer le filtrage par statut d'historique
        if (filters.searchQuery && filters.searchQuery.trim().length >= 2) {
            // Dans le cas d'une recherche globale, on cherche dans tout l'historique (les livrées ou annulées)
            query = query.in('status', ['delivered', 'completed', 'cancelled'])
        } else if (filters.status && filters.status !== 'all') {
            if (filters.status === 'completed' || filters.status === 'delivered') {
                // Pour les livrées dans l'historique : uniquement celles qui ne sont pas actives dans "À traiter"
                query = query.in('status', ['delivered', 'completed']).in('payment_status', ['paid', 'SOLDEE'])
                if (isSessionOpen) {
                    query = query.lt('pickup_date', `${todayStr}T00:00:00`)
                }
            } else {
                query = query.eq('status', filters.status)
            }
        } else {
            // Par défaut dans l'historique : les annulées OU les livrées qui ne sont pas dans "À traiter"
            if (isSessionOpen) {
                query = query.or(`status.eq.cancelled,and(status.in.(delivered,completed),payment_status.in.(paid,SOLDEE),pickup_date.lt.${todayStr}T00:00:00)`)
            } else {
                query = query.or(`status.eq.cancelled,and(status.in.(delivered,completed),payment_status.in.(paid,SOLDEE))`)
            }
        }

        // 4. Filtre de recherche universelle / globale textuelle
        if (filters.searchQuery && filters.searchQuery.trim().length >= 2) {
            const q = `%${filters.searchQuery.trim()}%`
            query = query.or(`customer_name.ilike.${q},customer_contact.ilike.${q},order_number.ilike.${q}`)
        }

        // 5. Filtre client et téléphone spécifiques (historique)
        if (filters.customerName) {
            query = query.ilike('customer_name', `%${filters.customerName}%`)
        }
        if (filters.customerContact) {
            query = query.ilike('customer_contact', `%${filters.customerContact}%`)
        }

        // 6. Filtre de montant
        if (filters.amount) {
            query = query.eq('total_amount', filters.amount)
        }

        // 7. Filtre d'état de paiement
        if (filters.paymentStatus === 'solded') {
            query = query.in('payment_status', ['paid', 'SOLDEE'])
        } else if (filters.paymentStatus === 'deposit') {
            query = query.in('payment_status', ['deposit_paid', 'partial', 'PARTIEL'])
        } else if (filters.paymentStatus === 'unpaid') {
            query = query.in('payment_status', ['unpaid', 'EN_ATTENTE'])
        }

        // 8. Filtre de mode de paiement
        if (filters.paymentMethod) {
            query = query.eq('transactions.payment_method', filters.paymentMethod)
        }

        // 9. Filtre de période temporelle
        if (filters.period && filters.period !== 'all') {
            const now = new Date()
            if (filters.period === 'today') {
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
                const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
                query = query.gte('pickup_date', todayStart.toISOString()).lte('pickup_date', todayEnd.toISOString())
            } else if (filters.period === 'week') {
                const startOfWeek = new Date(now)
                const day = startOfWeek.getDay()
                const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1) // lundi
                startOfWeek.setDate(diff)
                startOfWeek.setHours(0, 0, 0, 0)
                const endOfWeek = new Date(startOfWeek)
                endOfWeek.setDate(startOfWeek.getDate() + 6)
                endOfWeek.setHours(23, 59, 59, 999)
                query = query.gte('pickup_date', startOfWeek.toISOString()).lte('pickup_date', endOfWeek.toISOString())
            } else if (filters.period === 'month') {
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
                query = query.gte('pickup_date', startOfMonth.toISOString()).lte('pickup_date', endOfMonth.toISOString())
            } else if (filters.period === 'custom' && filters.startDate) {
                const start = new Date(filters.startDate)
                start.setHours(0, 0, 0, 0)
                query = query.gte('pickup_date', start.toISOString())
                if (filters.endDate) {
                    const end = new Date(filters.endDate)
                    end.setHours(23, 59, 59, 999)
                    query = query.lte('pickup_date', end.toISOString())
                }
            }
        }

        // Tri et pagination
        query = query.order('pickup_date', { ascending: false }).range(from, to)

        const { data, error, count } = await query

        if (error) {
            console.error("Erreur query getHistoricalOrders:", error)
            return { error: error.message }
        }

        return {
            orders: (data as unknown as Record<string, unknown>[]) || [],
            count: count || 0,
            hasMore: (count || 0) > to + 1
        }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: 'Erreur lors de la récupération des données historiques' }
    }
}

export async function addOrderPayment(
    orderId: string,
    payment: { amount: number; payment_method: string; payment_date?: string; note?: string }
) {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])
        await requireOpenSalesSession(context)
        const { supabase, organizationId, userId } = context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any

        // 1. Récupérer la commande pour validations
        const { data: order, error: fetchErr } = await supabaseAny
            .from('orders')
            .select('status, balance, total_amount, paid_amount')
            .eq('id', orderId)
            .eq('organization_id', organizationId)
            .single()

        if (fetchErr || !order) return { error: 'Commande introuvable' }

        if (order.status === 'cancelled') {
            return { error: 'Impossible d\'ajouter un paiement sur une commande annulée' }
        }

        if (payment.amount <= 0) {
            return { error: 'Le montant du paiement doit être supérieur à 0' }
        }

        // Vérification de sécurité temporelle (anti-doublon de 2 minutes)
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
        const { data: recentPayments, error: recentErr } = await supabaseAny
            .from('order_payments')
            .select('id')
            .eq('order_id', orderId)
            .eq('organization_id', organizationId)
            .eq('amount', payment.amount)
            .eq('payment_method', payment.payment_method)
            .gte('created_at', twoMinutesAgo)
            .limit(1)

        if (recentErr) {
            console.error('Erreur lors de la vérification anti-doublon:', recentErr)
        } else if (recentPayments && recentPayments.length > 0) {
            return { error: `Un paiement identique de ${payment.amount.toLocaleString('fr-FR')} FCFA a déjà été enregistré pour cette commande il y a moins de 2 minutes.` }
        }

        // 2. Insérer le paiement
        const { data: insertedPayment, error: insertErr } = await supabaseAny
            .from('order_payments')
            .insert({
                order_id: orderId,
                organization_id: organizationId,
                amount: payment.amount,
                payment_method: payment.payment_method,
                payment_date: payment.payment_date || new Date().toISOString(),
                note: payment.note || null,
                created_by: userId
            })
            .select()
            .single()

        if (insertErr) {
            console.error('Erreur lors de l\'insertion du paiement:', insertErr)
            return { error: insertErr.message }
        }

        revalidatePath('/commandes')
        revalidatePath('/dashboard')
        revalidatePath('/caisse')

        return { success: true, payment: insertedPayment }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

export async function updateOrderPayment(
    paymentId: string,
    orderId: string,
    payment: { amount: number; payment_method: string; payment_date?: string; note?: string }
) {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])
        await requireOpenSalesSession(context)
        const { supabase, organizationId } = context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any

        // 1. Récupérer la commande pour validations
        const { data: order, error: fetchOrderErr } = await supabaseAny
            .from('orders')
            .select('status')
            .eq('id', orderId)
            .eq('organization_id', organizationId)
            .single()

        if (fetchOrderErr || !order) return { error: 'Commande introuvable' }

        if (order.status === 'cancelled') {
            return { error: 'Impossible de modifier un paiement sur une commande annulée' }
        }

        if (payment.amount <= 0) {
            return { error: 'Le montant du paiement doit être supérieur à 0' }
        }

        // 2. Mettre à jour le paiement
        const { data: updatedPayment, error: updateErr } = await supabaseAny
            .from('order_payments')
            .update({
                amount: payment.amount,
                payment_method: payment.payment_method,
                payment_date: payment.payment_date || new Date().toISOString(),
                note: payment.note || null,
            })
            .eq('id', paymentId)
            .eq('order_id', orderId)
            .eq('organization_id', organizationId)
            .select()
            .single()

        if (updateErr) {
            console.error('Erreur lors de la modification du paiement:', updateErr)
            return { error: updateErr.message }
        }

        revalidatePath('/commandes')
        revalidatePath('/dashboard')
        revalidatePath('/caisse')

        return { success: true, payment: updatedPayment }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

export async function deleteOrderPayment(paymentId: string, orderId: string) {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])
        await requireOpenSalesSession(context)
        const { supabase, organizationId } = context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any

        // 1. Récupérer la commande pour validations
        const { data: order, error: fetchOrderErr } = await supabaseAny
            .from('orders')
            .select('status')
            .eq('id', orderId)
            .eq('organization_id', organizationId)
            .single()

        if (fetchOrderErr || !order) return { error: 'Commande introuvable' }

        if (order.status === 'cancelled') {
            return { error: 'Impossible de supprimer un paiement sur une commande annulée' }
        }

        // 2. Supprimer le paiement
        const { error: deleteErr } = await supabaseAny
            .from('order_payments')
            .delete()
            .eq('id', paymentId)
            .eq('order_id', orderId)
            .eq('organization_id', organizationId)

        if (deleteErr) {
            console.error('Erreur lors de la suppression du paiement:', deleteErr)
            return { error: deleteErr.message }
        }

        revalidatePath('/commandes')
        revalidatePath('/dashboard')
        revalidatePath('/caisse')

        return { success: true }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

export async function updateOrderItemDetails(
    orderId: string,
    itemId: string,
    input: {
        name: string
        quantity?: number
        unit_price?: number
        notes?: string | null
    }
) {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])
        await requireOpenSalesSession(context)
        const { supabase, organizationId } = context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any

        // 1. Récupérer l'article existant
        const { data: item, error: fetchItemErr } = await supabaseAny
            .from('order_items')
            .select('name, quantity, unit_price')
            .eq('id', itemId)
            .eq('order_id', orderId)
            .single()

        if (fetchItemErr || !item) {
            return { error: "Article introuvable dans cette commande" }
        }

        const oldName = item.name || ''
        const updatedQty = input.quantity !== undefined ? input.quantity : Number(item.quantity)
        const updatedPrice = input.unit_price !== undefined ? input.unit_price : Number(item.unit_price)
        const newSubtotal = updatedQty * updatedPrice

        // 2. Récupérer la commande
        const { data: order, error: fetchOrderErr } = await supabaseAny
            .from('orders')
            .select('status, customization_notes')
            .eq('id', orderId)
            .eq('organization_id', organizationId)
            .single()

        if (fetchOrderErr || !order) {
            return { error: "Commande introuvable" }
        }

        if (order.status === 'cancelled') {
            return { error: "Impossible de modifier un article sur une commande annulée" }
        }

        // 3. Mettre à jour les customization_notes (JSON)
        let updatedNotes = order.customization_notes
        if (updatedNotes) {
            try {
                if (updatedNotes.startsWith('[') || updatedNotes.startsWith('{')) {
                    const parsed = JSON.parse(updatedNotes)
                    if (Array.isArray(parsed)) {
                        const idx = parsed.findIndex((c: { name?: string }) => c.name?.toLowerCase() === oldName.toLowerCase())
                        if (idx !== -1) {
                            parsed[idx].name = input.name
                            parsed[idx].notes = input.notes || ''
                        } else {
                            parsed.push({
                                name: input.name,
                                notes: input.notes || '',
                                image_url: ''
                            })
                        }
                        updatedNotes = JSON.stringify(parsed)
                    }
                } else {
                    updatedNotes = input.notes || ''
                }
            } catch (e) {
                console.warn("Erreur parsing customization_notes, on écrase en texte brut", e)
                updatedNotes = input.notes || ''
            }
        } else if (input.notes) {
            updatedNotes = JSON.stringify([{
                name: input.name,
                notes: input.notes,
                image_url: ''
            }])
        }

        // 4. Mettre à jour l'article dans order_items
        const { error: updateItemErr } = await supabaseAny
            .from('order_items')
            .update({
                name: input.name,
                quantity: updatedQty,
                unit_price: updatedPrice
            })
            .eq('id', itemId)
            .eq('order_id', orderId)

        if (updateItemErr) {
            console.error('Erreur mise à jour order_item:', updateItemErr)
            return { error: updateItemErr.message }
        }

        // 5. Mettre à jour la note de la commande
        const { error: updateOrderNotesErr } = await supabaseAny
            .from('orders')
            .update({
                customization_notes: updatedNotes
            })
            .eq('id', orderId)
            .eq('organization_id', organizationId)

        if (updateOrderNotesErr) {
            console.error('Erreur mise à jour orders customization_notes:', updateOrderNotesErr)
            return { error: updateOrderNotesErr.message }
        }

        // 6. Recalculer le total global de la commande
        const { data: allItems, error: sumErr } = await supabaseAny
            .from('order_items')
            .select('subtotal')
            .eq('order_id', orderId)

        if (sumErr) {
            console.error('Erreur calcul totaux order_items:', sumErr)
            return { error: sumErr.message }
        }

        const newOrderTotal = (allItems || []).reduce((acc: number, cur: { subtotal?: number | null }) => acc + Number(cur.subtotal || 0), 0)

        // Mettre à jour le montant global de la commande
        const { error: updateOrderTotalErr } = await supabaseAny
            .from('orders')
            .update({
                total_amount: newOrderTotal,
                subtotal: newOrderTotal
            })
            .eq('id', orderId)
            .eq('organization_id', organizationId)

        if (updateOrderTotalErr) {
            console.error('Erreur mise à jour orders total_amount:', updateOrderTotalErr)
            return { error: updateOrderTotalErr.message }
        }

        // 7. Appeler le recalcul SQL du statut de paiement
        const { error: rpcErr } = await supabaseAny.rpc('recalculate_order_payment_status', {
            p_order_id: orderId
        })

        if (rpcErr) {
            console.error('Erreur RPC recalculate_order_payment_status:', rpcErr)
        }

        revalidatePath('/commandes')
        revalidatePath('/dashboard')
        revalidatePath('/caisse')

        return { success: true }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

export async function updateOrderTotal(orderId: string, newTotal: number, comment: string) {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur'])
        await requireOpenSalesSession(context)
        const { supabase, organizationId } = context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabaseAny = supabase as any

        // 1. Récupérer la commande
        const { data: order, error: fetchOrderErr } = await supabaseAny
            .from('orders')
            .select('status, subtotal, total_amount, customization_notes')
            .eq('id', orderId)
            .eq('organization_id', organizationId)
            .single()

        if (fetchOrderErr || !order) return { error: 'Commande introuvable' }
        if (order.status === 'cancelled') {
            return { error: 'Impossible de modifier le total d\'une commande annulée' }
        }

        // 2. Récupérer les articles
        const { data: items, error: fetchItemsErr } = await supabaseAny
            .from('order_items')
            .select('id, name, quantity, unit_price')
            .eq('order_id', orderId)

        if (fetchItemsErr) return { error: 'Erreur lors de la récupération des articles' }

        // 3. Préparer les notes de personnalisation avec l'audit log
        let updatedNotes = order.customization_notes
        const logEntry = `[Modif Tarif - ${new Date().toLocaleDateString('fr-FR')}] : ${comment}`
        if (updatedNotes) {
            try {
                if (updatedNotes.startsWith('[') || updatedNotes.startsWith('{')) {
                    const parsed = JSON.parse(updatedNotes)
                    if (Array.isArray(parsed)) {
                        if (parsed.length > 0) {
                            parsed[0].notes = (parsed[0].notes ? parsed[0].notes + '\n' : '') + logEntry
                        } else {
                            parsed.push({ name: 'Commande', notes: logEntry, image_url: '' })
                        }
                        updatedNotes = JSON.stringify(parsed)
                    }
                } else {
                    updatedNotes = updatedNotes + '\n' + logEntry
                }
            } catch {
                updatedNotes = updatedNotes + '\n' + logEntry
            }
        } else {
            updatedNotes = JSON.stringify([{ name: 'Commande', notes: logEntry, image_url: '' }])
        }

        // 4. Mettre à jour la commande
        const { error: updateErr } = await supabaseAny
            .from('orders')
            .update({
                total_amount: newTotal,
                subtotal: newTotal,
                customization_notes: updatedNotes
            })
            .eq('id', orderId)
            .eq('organization_id', organizationId)

        if (updateErr) return { error: updateErr.message }

        // 5. Si la commande a exactement 1 article, on ajuste son prix unitaire pour rester cohérent
        if (items && items.length === 1) {
            const item = items[0]
            const qty = Number(item.quantity || 1)
            const newUnitPrice = newTotal / qty
            await supabaseAny
                .from('order_items')
                .update({
                    unit_price: newUnitPrice
                })
                .eq('id', item.id)
                .eq('order_id', orderId)
        }

        // 6. Recalculer le statut de paiement de la commande
        const { error: rpcErr } = await supabaseAny.rpc('recalculate_order_payment_status', {
            p_order_id: orderId
        })
        if (rpcErr) console.error('Erreur RPC recalculate_order_payment_status:', rpcErr)

        revalidatePath('/commandes')
        revalidatePath('/dashboard')
        revalidatePath('/caisse')

        return { success: true, customization_notes: updatedNotes }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

export async function getVitrineSales(filters: {
    page?: number
    pageSize?: number
    period?: 'today' | 'week' | 'month' | 'custom' | 'all'
    startDate?: string
    endDate?: string
    amount?: number
    paymentMethod?: string
    searchQuery?: string
}) {
    try {
        const context = await requireRoleContext(['gerant', 'super_admin', 'vendeur', 'patissier'])
        const { supabase, organizationId } = context

        const page = filters.page || 1
        const pageSize = filters.pageSize || 20
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = (supabase as any)
            .from('transactions')
            .select('*, transaction_items(*), creator_profile:profiles!transactions_created_by_fkey(full_name, role_slug)', { count: 'exact' })
            .eq('organization_id', organizationId)
            .is('order_id', null)
            .eq('label_type', 'VENTE_DIRECTE')

        if (filters.searchQuery && filters.searchQuery.trim().length >= 2) {
            const q = `%${filters.searchQuery.trim()}%`
            query = query.or(`client_name.ilike.${q},id::text.ilike.${q}`)
        }

        if (filters.amount) {
            query = query.eq('amount', filters.amount)
        }

        if (filters.paymentMethod) {
            query = query.eq('payment_method', filters.paymentMethod)
        }

        if (filters.period && filters.period !== 'all') {
            const now = new Date()
            if (filters.period === 'today') {
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
                const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
                query = query.gte('created_at', todayStart.toISOString()).lte('created_at', todayEnd.toISOString())
            } else if (filters.period === 'week') {
                const startOfWeek = new Date(now)
                const day = startOfWeek.getDay()
                const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1)
                startOfWeek.setDate(diff)
                startOfWeek.setHours(0, 0, 0, 0)
                const endOfWeek = new Date(startOfWeek)
                endOfWeek.setDate(startOfWeek.getDate() + 6)
                endOfWeek.setHours(23, 59, 59, 999)
                query = query.gte('created_at', startOfWeek.toISOString()).lte('created_at', endOfWeek.toISOString())
            } else if (filters.period === 'month') {
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
                query = query.gte('created_at', startOfMonth.toISOString()).lte('created_at', endOfMonth.toISOString())
            } else if (filters.period === 'custom' && filters.startDate) {
                const startStr = `${filters.startDate}T00:00:00`
                query = query.gte('created_at', startStr)
                if (filters.endDate) {
                    const endStr = `${filters.endDate}T23:59:59.999`
                    query = query.lte('created_at', endStr)
                }
            }
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(from, to)

        if (error) return { error: error.message }

        return {
            transactions: data || [],
            count: count || 0,
            hasMore: count ? (to < count - 1) : false
        }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}

type DeleteVitrineSaleRpcClient = {
    rpc(
        fn: 'delete_vente_rapide_atomic',
        args: { p_transaction_id: string; p_organization_id: string }
    ): Promise<{ data: null; error: { message?: string } | null }>
}

export async function deleteVitrineSale(transactionId: string) {
    try {
        await ensureActiveSubscription()
        const context = await requireRoleContext(['gerant', 'super_admin'])
        await requireOpenSalesSession(context)
        const { supabase, organizationId } = context

        const { error } = await (supabase as unknown as DeleteVitrineSaleRpcClient).rpc('delete_vente_rapide_atomic', {
            p_transaction_id: transactionId,
            p_organization_id: organizationId
        })

        if (error) return { error: error.message }

        revalidatePath('/commandes')
        revalidatePath('/dashboard')
        revalidatePath('/caisse')

        return { success: true }
    } catch (e: unknown) {
        if (e instanceof AuthContextError) return { error: e.message }
        return { error: getErrorMessage(e) }
    }
}



