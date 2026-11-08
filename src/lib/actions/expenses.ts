'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AuthContextError,
  requireOrgRole,
} from '@/lib/auth/organization-context'
import {
  CancelExpenseSchema,
  CreateExpenseSchema,
  CreateTopUpSchema,
  UpdateWeeklyBudgetSchema,
  WeeklyClosingSchema,
  type BudgetTopUp,
  type Expense,
  type ExpenseCycle,
  type WeeklyBilanPreview,
} from '@/lib/schemas/expenses'
import {
  buildWeeklyBilan,
  isWeeklyClosingDue,
  sumCashFromTransactions,
} from '@/lib/domain/expenses'

// Les tables / RPC de la régie ne figurent pas dans les types générés :
// client non typé explicite plutôt que `any`.
function untypedDb(client: unknown): SupabaseClient {
  return client as SupabaseClient
}

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
      // Espèces physiques actuellement en caisse (sorties de caisse déduites)
      const { data: cashTxs } = await supabase
        .from('transactions')
        .select('amount, payment_method, payment_details')
        .eq('organization_id', organizationId)
        .gte('created_at', openSession.opened_at)
        .is('deleted_at', null)

      availableCashInDrawer = sumCashFromTransactions(cashTxs ?? [], { includeOutflows: true })
    }

    // 5. Calculer le total des ventes espèces de la semaine en cours (pour la clôture)
    const { data: weekCashTxs } = await supabase
      .from('transactions')
      .select('amount, payment_method, payment_details')
      .eq('organization_id', organizationId)
      .gte('created_at', activeCycle.start_date)
      .is('deleted_at', null)

    // Recettes espèces brutes (sorties de caisse ignorées)
    const totalWeekCashSales = sumCashFromTransactions(weekCashTxs ?? [])

    // 6. La semaine précédente a-t-elle basculé automatiquement sans bilan ?
    const { data: lastClosed } = await untypedDb(supabase)
      .from('expense_cycles')
      .select('recharge_source')
      .eq('organization_id', organizationId)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const previousBilanMissing = lastClosed?.recharge_source === 'non_enregistree'

    return {
      success: true,
      cycle: activeCycle,
      expenses: (expensesData ?? []) as unknown as Expense[],
      topUps: (topUpsData ?? []) as unknown as BudgetTopUp[],
      hasOpenSalesSession: !!openSession,
      availableCashInDrawer: Math.max(0, availableCashInDrawer),
      totalWeekCashSales,
      org_weekly_budget: orgWeeklyBudget,
      previousBilanMissing,
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

const WEEKLY_CLOSING_ROLES = ['gerant', 'super_admin', 'vendeur']

/**
 * Aperçu du bilan hebdomadaire : semaine active, recharge à prélever dans le
 * tiroir et estimation des espèces à remettre à la gérante.
 * Lecture seule (hormis la bascule automatique d'une semaine dépassée).
 */
export async function getWeeklyBilanPreviewAction(): Promise<{
  success: boolean
  preview?: WeeklyBilanPreview
  error?: string
}> {
  try {
    const { supabase, organizationId } = await requireOrgRole(WEEKLY_CLOSING_ROLES)

    const { data: orgData } = await untypedDb(supabase)
      .from('organizations')
      .select('weekly_expense_budget')
      .eq('id', organizationId)
      .single()
    const budget = Number(orgData?.weekly_expense_budget) || 150000

    const { data: cycleData, error: cycleErr } = await untypedDb(supabase).rpc(
      'get_or_create_active_expense_cycle',
      { p_org_id: organizationId, p_default_budget: budget }
    )
    if (cycleErr || !cycleData) {
      return { success: false, error: cycleErr?.message || 'Semaine de dépenses introuvable' }
    }
    const cycle = cycleData as unknown as ExpenseCycle

    const [{ data: openSession }, { data: weekTxs }] = await Promise.all([
      supabase
        .from('sales_sessions')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('status', 'open')
        .maybeSingle(),
      supabase
        .from('transactions')
        .select('amount, payment_method, payment_details')
        .eq('organization_id', organizationId)
        .gte('created_at', cycle.start_date)
        .is('deleted_at', null),
    ])

    const currentBalance = Number(cycle.current_balance) || 0
    const netWeekCash = sumCashFromTransactions(weekTxs ?? [], { includeOutflows: true })
    const figures = buildWeeklyBilan({ budget, currentBalance, netWeekCash })

    return {
      success: true,
      preview: {
        cycleId: cycle.id,
        startDate: cycle.start_date,
        endDate: cycle.end_date,
        isDue: isWeeklyClosingDue(cycle.end_date, new Date()),
        budget,
        currentBalance,
        netWeekCash,
        ...figures,
        hasOpenSalesSession: !!openSession,
      },
    }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/**
 * Bilan hebdomadaire : prélève la recharge dans le tiroir (sortie de caisse),
 * archive la semaine et ouvre la suivante au budget de l'organisation.
 * Accessible aux vendeurs : c'est la caissière qui fait le bilan du dimanche.
 */
export async function weeklyExpenseClosingAction(rawInput: unknown) {
  try {
    const parsed = WeeklyClosingSchema.parse(rawInput)
    const { supabase, organizationId } = await requireOrgRole(WEEKLY_CLOSING_ROLES)

    const { data, error } = await untypedDb(supabase).rpc('weekly_expense_closing_atomic', {
      p_org_id: organizationId,
      p_cycle_id: parsed.cycle_id,
    })

    if (error) {
      console.error('Erreur weekly_expense_closing_atomic:', error.message)
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

