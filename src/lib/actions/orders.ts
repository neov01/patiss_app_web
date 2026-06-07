'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ensureActiveSubscription } from '@/lib/utils/subscription'
import { z } from 'zod'

import { orderSchema } from '@/lib/schemas/order.schema'

export async function createOrder(input: any) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    // 1. Validation Serveur (Zod)
    const result = orderSchema.safeParse(input)
    if (!result.success) {
        const errors = result.error.flatten().fieldErrors
        const firstErr = Object.values(errors).flat()[0]
        return { error: firstErr || 'Données de commande invalides' }
    }
    const formData = result.data
    const payments = input.payments // Récupération directe des paiements multiples

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Non authentifié' }

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    if (!profile?.organization_id) return { error: 'Organisation introuvable' }

    // Auto-enregistrement client : si pas de customer_id mais qu'un téléphone est fourni,
    // on cherche ou crée le client silencieusement pour alimenter le CRM & la fidélité.
    let resolvedCustomerId = formData.customer_id || null
    const clientPhone = formData.customer_contact?.replace(/\D/g, '') || null

    if (!resolvedCustomerId && clientPhone && formData.customer_name && formData.customer_name !== 'Client Vitrine') {
        // Normaliser le numéro pour la recherche (format Ivoirien +225 → local)
        let normalizedPhone = clientPhone
        if (clientPhone.startsWith('225') && clientPhone.length >= 11) {
            normalizedPhone = clientPhone.slice(3)
        }
        const phoneCandidates = Array.from(new Set([clientPhone, normalizedPhone]))

        const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id')
            .eq('organization_id', profile.organization_id)
            .in('phone', phoneCandidates)
            .limit(1)
            .maybeSingle()

        if (existingCustomer) {
            resolvedCustomerId = existingCustomer.id
        } else {
            const { data: newCustomer } = await supabase
                .from('customers')
                .insert({
                    name: formData.customer_name,
                    phone: normalizedPhone || clientPhone,
                    organization_id: profile.organization_id,
                })
                .select('id')
                .single()
            resolvedCustomerId = newCustomer?.id ?? null
        }
    }

    // 2. Calculs Sécurisés (Business Logic)
    const totalAmount = formData.total_amount
    const depositAmount = formData.deposit_amount
    const balance = Math.max(0, totalAmount - depositAmount)

    // Déterminer le statut de paiement initial
    const paymentStatus = depositAmount >= totalAmount
        ? 'SOLDEE'
        : depositAmount > 0
            ? 'PARTIEL'
            : 'EN_ATTENTE'

    // Ajustements en cas de paiements multiples
    let resolvedDepositAmount = depositAmount
    let resolvedBalance = balance
    let resolvedPaymentStatus = paymentStatus

    if (payments && payments.length > 0) {
        const sumAcompte = payments.filter((p: any) => p.label_type === 'ACOMPTE').reduce((sum: number, p: any) => sum + p.amount, 0)
        const sumSolde = payments.filter((p: any) => p.label_type === 'SOLDE').reduce((sum: number, p: any) => sum + p.amount, 0)
        const totalPaid = sumAcompte + sumSolde

        resolvedDepositAmount = sumAcompte
        resolvedBalance = Math.max(0, totalAmount - totalPaid)
        resolvedPaymentStatus = totalPaid >= totalAmount
            ? 'SOLDEE'
            : totalPaid > 0
                ? 'PARTIEL'
                : 'EN_ATTENTE'
    }

    const { data: order, error } = await supabase.from('orders').insert({
        id: formData.id,
        organization_id: profile.organization_id,
        order_number: formData.order_number,
        customer_id: resolvedCustomerId,
        customer_name: formData.customer_name,
        customer_contact: formData.customer_contact,
        pickup_date: formData.pickup_date,
        total_amount: totalAmount,
        deposit_amount: resolvedDepositAmount,
        custom_image_url: formData.custom_image_url,
        priority: formData.priority,
        reception_type: formData.reception_type,
        delivery_address: formData.delivery_address,
        order_channel: formData.order_channel,
        subtotal: formData.subtotal,
        balance: resolvedBalance,
        customization_notes: formData.customization_notes,
        created_by: user.id,
        status: formData.status || 'pending',
        payment_status: resolvedPaymentStatus,
    }).select().single()

    if (error) return { error: error.message }

    if (formData.items && formData.items.length > 0) {
        await supabase.from('order_items').insert(
            formData.items.map(i => ({ 
                id: i.id,
                order_id: order.id, 
                product_id: i.product_id || null,
                name: i.name,
                quantity: i.quantity,
                unit_price: i.unit_price,
                from_inventory: i.from_inventory
             })) as any
        )
    }

    // Enregistrement des transactions financières
    if (payments && payments.length > 0) {
        let totalPaidAtCreation = 0
        for (const p of payments) {
            if (p.amount > 0) {
                await supabase.from('transactions').insert({
                    organization_id: profile.organization_id,
                    order_id: order.id,
                    customer_id: resolvedCustomerId,
                    client_name: formData.customer_name,
                    amount: p.amount,
                    payment_method: p.payment_method || 'Espèces',
                    label_type: p.label_type,
                    created_by: user.id
                })
                totalPaidAtCreation += p.amount
            }
        }

        // Créditer les points de fidélité pour le montant total payé à la création
        if (resolvedCustomerId && totalPaidAtCreation > 0) {
            const points = Math.floor(totalPaidAtCreation / 1000)
            if (points > 0) {
                const { data: cust } = await supabase.from('customers').select('loyalty_points, lifetime_points').eq('id', resolvedCustomerId).single()
                if (cust) {
                    await supabase.from('customers').update({
                        loyalty_points: (cust.loyalty_points || 0) + points,
                        lifetime_points: (cust.lifetime_points || 0) + points,
                    }).eq('id', resolvedCustomerId)
                }
            }
        }
    } else {
        // Enregistrer l'acompte comme transaction unique avec label ACOMPTE (Logique classique)
        if (depositAmount > 0) {
            const labelType = depositAmount >= totalAmount ? 'SOLDE' : 'ACOMPTE'
            await supabase.from('transactions').insert({
                organization_id: profile.organization_id,
                order_id: order.id,
                customer_id: resolvedCustomerId,
                client_name: formData.customer_name,
                amount: depositAmount,
                payment_method: formData.deposit_payment_method || 'Espèces',
                label_type: labelType,
                created_by: user.id
            })
            // Créditer les points de fidélité pour l'acompte (1 point par 1000 FCFA)
            if (resolvedCustomerId) {
                const points = Math.floor(depositAmount / 1000)
                if (points > 0) {
                    const { data: cust } = await supabase.from('customers').select('loyalty_points, lifetime_points').eq('id', resolvedCustomerId).single()
                    if (cust) {
                        await supabase.from('customers').update({
                            loyalty_points: (cust.loyalty_points || 0) + points,
                            lifetime_points: (cust.lifetime_points || 0) + points,
                        }).eq('id', resolvedCustomerId)
                    }
                }
            }
        }
    }

    revalidatePath('/commandes')
    revalidatePath('/dashboard')
    return { data: order }

    revalidatePath('/commandes')
    revalidatePath('/dashboard')
    return { data: order }
}

export async function updateOrderStatus(orderId: string, status: string) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
    if (error) return { error: error.message }
    revalidatePath('/commandes')
    return { success: true }
}

export async function deleteOrder(orderId: string) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    const supabase = await createClient()

    // 1. Récupérer les transactions liées pour déduire les points de fidélité correspondants
    const { data: linkedTransactions } = await supabase
        .from('transactions')
        .select('amount, customer_id')
        .eq('order_id', orderId)

    if (linkedTransactions && linkedTransactions.length > 0) {
        for (const tx of linkedTransactions) {
            if (tx.customer_id && Number(tx.amount) > 0) {
                const pointsToSubtract = Math.floor(Number(tx.amount) / 1000)
                if (pointsToSubtract > 0) {
                    const { data: cust } = await supabase
                        .from('customers')
                        .select('loyalty_points, lifetime_points')
                        .eq('id', tx.customer_id)
                        .single()
                    if (cust) {
                        await supabase.from('customers').update({
                            loyalty_points: Math.max(0, (cust.loyalty_points || 0) - pointsToSubtract),
                            lifetime_points: Math.max(0, (cust.lifetime_points || 0) - pointsToSubtract)
                        }).eq('id', tx.customer_id)
                    }
                }
            }
        }
        // 2. Supprimer les transactions associées
        await supabase.from('transactions').delete().eq('order_id', orderId)
    }

    // 3. Supprimer la commande
    const { error } = await supabase.from('orders').delete().eq('id', orderId)
    if (error) return { error: error.message }
    
    revalidatePath('/commandes')
    revalidatePath('/dashboard')
    revalidatePath('/caisse')
    
    return { success: true }
}

export async function updateOrderDetails(
    orderId: string, 
    details: { customer_name?: string; customer_contact?: string; pickup_date?: string }
) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('orders').update(details).eq('id', orderId)
    if (error) return { error: error.message }
    revalidatePath('/commandes')
    revalidatePath('/dashboard')
    revalidatePath('/caisse')
    return { success: true }
}

export async function createVitrineSale(input: any) {
    // Bloquer si l'abonnement est expiré
    try {
        await ensureActiveSubscription()
    } catch (e: any) {
        return { error: e.message }
    }

    // Validation rapide pour la vitrine
    const vitrineSchema = z.object({
        id: z.string().uuid().optional(),
        total_amount: z.number().min(0),
        items: z.array(z.object({
            id: z.string().uuid().optional(),
            product_id: z.string().uuid(),
            quantity: z.number().positive(),
            unit_price: z.number().min(0)
        })).min(1)
    })

    const result = vitrineSchema.safeParse(input)
    if (!result.success) return { error: 'Données de vente invalides' }
    const formData = result.data

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Non authentifié' }

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    if (!profile?.organization_id) return { error: 'Organisation introuvable' }

    // Vente vitrine: Commande instantanée complétée
    const { data: order, error } = await supabase.from('orders').insert({
        id: formData.id,
        organization_id: profile.organization_id,
        customer_name: 'Client Vitrine',
        pickup_date: new Date().toISOString(),
        total_amount: formData.total_amount,
        deposit_amount: formData.total_amount, 
        created_by: user.id,
        status: 'completed',
        payment_status: 'SOLDEE'
    }).select().single()

    if (error) return { error: error.message }

    if (formData.items.length > 0) {
        await supabase.from('order_items').insert(
            formData.items.map((i: any) => ({ id: i.id, order_id: order.id, ...i }))
        )
        
        // Enregistrer la transaction associée
        await supabase.from('transactions').insert({
            organization_id: profile.organization_id,
            order_id: order.id,
            client_name: 'Client Vitrine',
            amount: formData.total_amount,
            payment_method: 'Espèces', // Par défaut
            label_type: 'SOLDE',
            created_by: user.id
        })
    }

    revalidatePath('/dashboard')
    revalidatePath('/commandes')
    return { success: true }
}

export async function importHistoricalOrder(input: any) {
    // 1. Authentification et Vérification des droits
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Non authentifié' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, role_slug, can_import_history')
        .eq('id', user.id)
        .single()

    if (!profile) return { error: 'Profil introuvable' }

    const isAuthorized = ['gerant', 'super_admin'].includes(profile.role_slug) || profile.can_import_history
    if (!isAuthorized) {
        return { error: 'Accès refusé. Vous n\'avez pas l\'autorisation pour importer des données historiques.' }
    }

    const orgId = profile.organization_id
    if (!orgId) return { error: 'Organisation introuvable' }

    // 2. Préparation des données
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
    } = input

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
    const { createClient: createSupabaseAdminClient } = require('@supabase/supabase-js')
    const supabaseAdmin = createSupabaseAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Auto-enregistrement client historique dans le CRM : si un téléphone est fourni,
    // on cherche ou crée le client silencieusement pour alimenter le CRM & la fidélité.
    let resolvedCustomerId = null
    const clientPhone = customer_contact?.replace(/\D/g, '') || null

    if (clientPhone && customer_name && customer_name !== 'Client Vitrine') {
        // Normaliser le numéro pour la recherche (format Ivoirien +225 → local)
        let normalizedPhone = clientPhone
        if (clientPhone.startsWith('225') && clientPhone.length >= 11) {
            normalizedPhone = clientPhone.slice(3)
        }
        const phoneCandidates = Array.from(new Set([clientPhone, normalizedPhone]))

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
                    phone: normalizedPhone || clientPhone,
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
        const sumAcompte = payments.filter((p: any) => p.label_type === 'ACOMPTE').reduce((sum: number, p: any) => sum + p.amount, 0)
        const sumSolde = payments.filter((p: any) => p.label_type === 'SOLDE').reduce((sum: number, p: any) => sum + p.amount, 0)
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
    const orderId = require('crypto').randomUUID()
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
            created_by: user.id,
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
                items.map((i: any) => ({
                    id: i.id || require('crypto').randomUUID(),
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

                await supabaseAdmin.from('transactions').insert({
                    id: require('crypto').randomUUID(),
                    organization_id: orgId,
                    order_id: orderId,
                    customer_id: resolvedCustomerId,
                    client_name: customer_name,
                    amount: p.amount,
                    payment_method: p.payment_method || 'Espèces',
                    label_type: p.label_type,
                    created_by: user.id,
                    created_at: paymentDate,
                    is_historical: true
                })
                totalPaidAtCreation += p.amount
            }
        }

        // Créditer les points de fidélité pour le client historique
        if (resolvedCustomerId && totalPaidAtCreation > 0) {
            const points = Math.floor(totalPaidAtCreation / 1000)
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
                            loyalty_points: (cust.loyalty_points || 0) + points,
                            lifetime_points: (cust.lifetime_points || 0) + points,
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
            
            await supabaseAdmin.from('transactions').insert({
                id: require('crypto').randomUUID(),
                organization_id: orgId,
                order_id: orderId,
                customer_id: resolvedCustomerId,
                client_name: customer_name,
                amount: deposit_amount,
                payment_method: deposit_payment_method,
                label_type: labelType,
                created_by: user.id,
                created_at, // Date de prise de commande (date de l'acompte)
                is_historical: true
            })
        }

        // Transaction Solde (si la commande est terminée et qu'il y a un solde à payer)
        const isCompleted = status === 'completed' || status === 'delivered'
        if (isCompleted && resolvedBalance > 0) {
            await supabaseAdmin.from('transactions').insert({
                id: require('crypto').randomUUID(),
                organization_id: orgId,
                order_id: orderId,
                customer_id: resolvedCustomerId,
                client_name: customer_name,
                amount: resolvedBalance,
                payment_method: balance_payment_method,
                label_type: 'SOLDE',
                created_by: user.id,
                created_at: pickup_date, // Date de retrait (date du paiement du solde)
                is_historical: true
            })
        }

        // Créditer les points de fidélité pour le client historique (1 point par 1000 FCFA payés)
        if (resolvedCustomerId) {
            const amountPaid = isCompleted ? total_amount : deposit_amount
            const points = Math.floor(amountPaid / 1000)
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
                            loyalty_points: (cust.loyalty_points || 0) + points,
                            lifetime_points: (cust.lifetime_points || 0) + points,
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
