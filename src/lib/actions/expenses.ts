'use server'

import { revalidatePath } from 'next/cache'
import {
  AuthContextError,
  requireOrgRole,
} from '@/lib/auth/organization-context'
import {
  CancelExpenseSchema,
  CloseExpenseCycleSchema,
  CreateExpenseSchema,
  CreateTopUpSchema,
  UpdateWeeklyBudgetSchema,
  type BudgetTopUp,
  type Expense,
  type ExpenseCycle,
} from '@/lib/schemas/expenses'

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Erreur inattendue'
}

/**
 * Récupère le cycle actif de l'organisation (ou le crée s'il n'existe pas),
 * ainsi que ses dépenses, ses rallonges et les infos de caisse en cours.
 */
export async function getActiveExpenseCycleData() {
  try {
    const { supabase, organizationId } = await requireOrgRole([
      'gerant',
      'super_admin',
      'vendeur',
      'patissier',
    ])

    // 0. Récupérer le budget hebdomadaire configuré sur l'organisation (défaut 150 000)
    const { data: orgData } = await (supabase as any)
      .from('organizations')
      .select('weekly_expense_budget')
      .eq('id', organizationId)
      .single()

    const orgWeeklyBudget = Number(orgData?.weekly_expense_budget) || 150000.0

    // 1. Récupérer ou initialiser le cycle actif via la RPC atomique
    const { data: cycleData, error: cycleErr } = await (supabase as any).rpc(
      'get_or_create_active_expense_cycle',
      {
        p_org_id: organizationId,
        p_default_budget: orgWeeklyBudget,
      }
    )

    if (cycleErr || !cycleData) {
      console.error('Erreur get_or_create_active_expense_cycle:', cycleErr)
      return { success: false, error: cycleErr?.message || 'Erreur chargement cycle' }
    }

    const activeCycle = cycleData as unknown as ExpenseCycle

    // 2. Charger les dépenses du cycle en cours (y compris annulées avec badge)
    const { data: expensesData, error: expErr } = await (supabase as any)
      .from('expenses')
      .select('*, profiles:created_by(full_name)')
      .eq('cycle_id', activeCycle.id)
      .eq('organization_id', organizationId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (expErr) {
      console.error('Erreur chargement dépenses:', expErr)
    }

    // 3. Charger les rallonges du cycle en cours
    const { data: topUpsData, error: topUpErr } = await (supabase as any)
      .from('budget_top_ups')
      .select('*, profiles:created_by(full_name)')
      .eq('cycle_id', activeCycle.id)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (topUpErr) {
      console.error('Erreur chargement rallonges:', topUpErr)
    }

    // 4. Vérifier s'il y a une session de caisse ouverte et calculer les espèces physiques disponibles
    const { data: openSession } = await supabase
      .from('sales_sessions')
      .select('id, opened_at, total_cash')
      .eq('organization_id', organizationId)
      .eq('status', 'open')
      .maybeSingle()

    let availableCashInDrawer = 0
    if (openSession) {
      // Calculer les espèces physiques actuellement en caisse
      const { data: cashTxs } = await supabase
        .from('transactions')
        .select('amount, payment_method, payment_details')
        .eq('organization_id', organizationId)
        .gte('created_at', openSession.opened_at)
        .is('deleted_at', null)

      if (cashTxs) {
        for (const tx of cashTxs) {
          const amt = Number(tx.amount ?? 0)
          if (tx.payment_method === 'Espèces') {
            availableCashInDrawer += amt
          } else if (tx.payment_details && typeof tx.payment_details === 'object') {
            const details = tx.payment_details as Record<string, number>
            if (details['Espèces']) {
              availableCashInDrawer += Number(details['Espèces'] ?? 0)
            }
          }
        }
      }
    }

    // 5. Calculer le total des ventes espèces de la semaine en cours (pour la clôture)
    const { data: weekCashTxs } = await supabase
      .from('transactions')
      .select('amount, payment_method, payment_details')
      .eq('organization_id', organizationId)
      .gte('created_at', activeCycle.start_date)
      .is('deleted_at', null)

    let totalWeekCashSales = 0
    if (weekCashTxs) {
      for (const tx of weekCashTxs) {
        const amt = Number(tx.amount ?? 0)
        // Ignorer les sorties de caisse pour connaître les recettes brutes encaissées
        if (amt > 0) {
          if (tx.payment_method === 'Espèces') {
            totalWeekCashSales += amt
          } else if (tx.payment_details && typeof tx.payment_details === 'object') {
            const details = tx.payment_details as Record<string, number>
            if (details['Espèces']) {
              totalWeekCashSales += Number(details['Espèces'] ?? 0)
            }
          }
        }
      }
    }

    return {
      success: true,
      cycle: activeCycle,
      expenses: (expensesData ?? []) as unknown as Expense[],
      topUps: (topUpsData ?? []) as unknown as BudgetTopUp[],
      hasOpenSalesSession: !!openSession,
      availableCashInDrawer: Math.max(0, availableCashInDrawer),
      totalWeekCashSales,
      org_weekly_budget: orgWeeklyBudget,
    }
  } catch (err: unknown) {
    if (err instanceof AuthContextError) {
      return { success: false, error: err.message }
    }
    return { success: false, error: getErrorMessage(err) }
  }
}

/**
 * Enregistre une nouvelle dépense atomique
 */
export async function createExpenseAction(rawInput: unknown) {
  try {
    const parsed = CreateExpenseSchema.parse(rawInput)
    const { supabase, organizationId, userId } = await requireOrgRole([
      'gerant',
      'super_admin',
      'vendeur',
    ])

    const { data, error } = await (supabase as any).rpc('record_expense_atomic', {
      p_org_id: organizationId,
      p_cycle_id: parsed.cycle_id,
      p_amount: parsed.amount,
      p_category: parsed.category,
      p_description: parsed.description,
      p_payment_method: parsed.payment_method,
      p_receipt_url: parsed.receipt_url ?? null,
      p_user_id: userId,
      p_expense_date: parsed.expense_date ?? new Date().toISOString(),
    })

    if (error) {
      console.error('Erreur record_expense_atomic:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/depenses')
    revalidatePath('/dashboard')

    return { success: true, data }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/**
 * Annule une dépense saisie par erreur (avec commentaire obligatoire)
 */
export async function cancelExpenseAction(rawInput: unknown) {
  try {
    const parsed = CancelExpenseSchema.parse(rawInput)
    const { supabase, organizationId, userId } = await requireOrgRole([
      'gerant',
      'super_admin',
      'vendeur',
    ])

    const { data, error } = await (supabase as any).rpc('cancel_expense_atomic', {
      p_org_id: organizationId,
      p_expense_id: parsed.expense_id,
      p_reason: parsed.reason,
      p_user_id: userId,
    })

    if (error) {
      console.error('Erreur cancel_expense_atomic:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/depenses')
    revalidatePath('/dashboard')

    return { success: true, data }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/**
 * Effectue une rallonge exceptionnelle (top-up) depuis la caisse du jour ou apport externe
 */
export async function createTopUpAction(rawInput: unknown) {
  try {
    const parsed = CreateTopUpSchema.parse(rawInput)
    const { supabase, organizationId, userId } = await requireOrgRole([
      'gerant',
      'super_admin',
      'vendeur',
    ])

    const { data, error } = await (supabase as any).rpc('record_top_up_atomic', {
      p_org_id: organizationId,
      p_cycle_id: parsed.cycle_id,
      p_amount: parsed.amount,
      p_reason: parsed.reason,
      p_source: parsed.source,
      p_user_id: userId,
    })

    if (error) {
      console.error('Erreur record_top_up_atomic:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/depenses')
    revalidatePath('/caisse')
    revalidatePath('/dashboard')

    return { success: true, data }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/**
 * Clôture le cycle hebdomadaire et ouvre le cycle suivant à 100 000 FCFA
 */
export async function closeWeeklyCycleAction(rawInput: unknown) {
  try {
    const parsed = CloseExpenseCycleSchema.parse(rawInput)
    const { supabase, organizationId, userId } = await requireOrgRole([
      'gerant',
      'super_admin',
    ])

    const { data, error } = await (supabase as any).rpc('close_expense_cycle_atomic', {
      p_org_id: organizationId,
      p_cycle_id: parsed.cycle_id,
      p_recharge_source: parsed.recharge_source,
      p_user_id: userId,
      p_new_budget: parsed.new_budget,
    })

    if (error) {
      console.error('Erreur close_expense_cycle_atomic:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/depenses')
    revalidatePath('/dashboard')

    return { success: true, data }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/**
 * Récupère les cycles archivés passés pour consultation de l'historique
 */
export async function getClosedExpenseCyclesAction() {
  try {
    const { supabase, organizationId } = await requireOrgRole([
      'gerant',
      'super_admin',
      'vendeur',
    ])

    const { data, error } = await (supabase as any)
      .from('expense_cycles')
      .select('*, profiles:closed_by(full_name)')
      .eq('organization_id', organizationId)
      .eq('status', 'closed')
      .order('end_date', { ascending: false })
      .limit(20)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, cycles: data }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/**
 * Téléverse un justificatif (ticket/facturette) vers Supabase Storage
 */
export async function uploadExpenseReceiptAction(formData: FormData) {
  try {
    const file = formData.get('file') as File | null
    if (!file) {
      return { success: false, error: 'Aucun fichier fourni' }
    }

    const { supabase, organizationId } = await requireOrgRole([
      'gerant',
      'super_admin',
      'vendeur',
    ])

    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `${organizationId}/${Date.now()}_${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Erreur upload justificatif:', uploadError)
      return { success: false, error: "Erreur lors de l'envoi du fichier" }
    }

    const { data: urlData } = supabase.storage
      .from('receipts')
      .getPublicUrl(fileName)

    return { success: true, publicUrl: urlData.publicUrl }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/**
 * Met à jour le montant du budget hebdomadaire alloué à l'organisation
 * et permet d'ajuster immédiatement le solde du cycle actif en cours.
 */
export async function updateOrganizationWeeklyBudgetAction(rawInput: unknown) {
  try {
    const { supabase, organizationId, userId } = await requireOrgRole([
      'gerant',
      'super_admin',
    ])

    const parsed = UpdateWeeklyBudgetSchema.parse(rawInput)

    const { data, error } = await (supabase as any).rpc(
      'update_organization_expense_budget',
      {
        p_org_id: organizationId,
        p_new_budget: parsed.new_budget,
        p_adjust_active_cycle: parsed.adjust_active_cycle,
        p_user_id: userId,
      }
    )

    if (error) {
      console.error('Erreur update_organization_expense_budget:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/depenses')
    revalidatePath('/dashboard')
    revalidatePath('/admin')

    return { success: true, data }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
}

