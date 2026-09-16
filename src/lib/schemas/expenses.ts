import { z } from 'zod'

export const EXPENSE_CATEGORIES = [
  'ingredients_urgents',
  'emballages',
  'entretien_hygiene',
  'transport_courses',
  'petit_materiel',
  'reparations',
  'autre',
] as const

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]

export interface CategoryMeta {
  key: ExpenseCategoryKey
  label: string
  shortLabel: string
  iconName: string
  badgeBg: string
  badgeText: string
  badgeBorder: string
}

export const CATEGORY_CONFIG: Record<ExpenseCategoryKey, CategoryMeta> = {
  ingredients_urgents: {
    key: 'ingredients_urgents',
    label: 'Ingrédients urgents (courses, dépannage)',
    shortLabel: 'Ingrédients',
    iconName: 'Egg',
    badgeBg: '#FEF3C7',
    badgeText: '#92400E',
    badgeBorder: '#FDE68A',
  },
  emballages: {
    key: 'emballages',
    label: 'Emballages, boîtes & sachets',
    shortLabel: 'Emballages',
    iconName: 'Package',
    badgeBg: '#EFF6FF',
    badgeText: '#1E40AF',
    badgeBorder: '#BFDBFE',
  },
  entretien_hygiene: {
    key: 'entretien_hygiene',
    label: 'Entretien, nettoyage & hygiène',
    shortLabel: 'Entretien',
    iconName: 'Sparkles',
    badgeBg: '#ECFDF5',
    badgeText: '#065F46',
    badgeBorder: '#A7F3D0',
  },
  transport_courses: {
    key: 'transport_courses',
    label: 'Transport, livraison & courses',
    shortLabel: 'Transport',
    iconName: 'Bike',
    badgeBg: '#F3E8FF',
    badgeText: '#6B21A8',
    badgeBorder: '#E9D5FF',
  },
  petit_materiel: {
    key: 'petit_materiel',
    label: 'Petit matériel & ustensiles',
    shortLabel: 'Matériel',
    iconName: 'Utensils',
    badgeBg: '#FFF7ED',
    badgeText: '#9A3412',
    badgeBorder: '#FFEDD5',
  },
  reparations: {
    key: 'reparations',
    label: 'Réparations & maintenance',
    shortLabel: 'Réparations',
    iconName: 'Wrench',
    badgeBg: '#FEE2E2',
    badgeText: '#991B1B',
    badgeBorder: '#FECACA',
  },
  autre: {
    key: 'autre',
    label: 'Autre dépense de fonctionnement',
    shortLabel: 'Autre',
    iconName: 'CircleEllipsis',
    badgeBg: '#F1F5F9',
    badgeText: '#475569',
    badgeBorder: '#E2E8F0',
  },
}

export const ExpenseCategoryEnum = z.enum(EXPENSE_CATEGORIES)

export const ExpensePaymentMethodEnum = z.enum([
  'cash',
  'orange_money',
  'wave',
  'mtn_momo',
  'moov_money',
  'autre',
])

export const CreateExpenseSchema = z.object({
  cycle_id: z.string().uuid('ID de cycle invalide'),
  amount: z.number().positive('Le montant doit être strictement supérieur à 0'),
  category: ExpenseCategoryEnum,
  description: z.string().min(2, 'Le libellé de la dépense doit comporter au moins 2 caractères'),
  payment_method: ExpensePaymentMethodEnum.default('cash'),
  receipt_url: z.string().url().nullable().optional(),
  expense_date: z.string().optional(),
})

export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>

export const CancelExpenseSchema = z.object({
  expense_id: z.string().uuid('ID de dépense invalide'),
  reason: z.string().min(3, 'Le motif d’annulation est obligatoire (min 3 caractères)'),
})

export type CancelExpenseInput = z.infer<typeof CancelExpenseSchema>

export const CreateTopUpSchema = z.object({
  cycle_id: z.string().uuid('ID de cycle invalide'),
  amount: z.number().positive('Le montant de la rallonge doit être strictement positif'),
  reason: z.string().min(3, 'Le motif de la rallonge est requis'),
  source: z.enum(['caisse_du_jour', 'apport_externe_gerant', 'autre']).default('caisse_du_jour'),
})

export type CreateTopUpInput = z.infer<typeof CreateTopUpSchema>

export const CloseExpenseCycleSchema = z.object({
  cycle_id: z.string().uuid('ID de cycle invalide'),
  recharge_source: z.enum(['ventes_hebdo', 'apport_externe', 'mixte', 'aucune']).default('ventes_hebdo'),
  new_budget: z.number().positive('Le budget cible doit être supérieur à 0').default(100000),
})

export type CloseExpenseCycleInput = z.infer<typeof CloseExpenseCycleSchema>

// Types pour la vue et le state
export interface ExpenseCycle {
  id: string
  organization_id: string
  start_date: string
  end_date: string
  initial_budget: number
  total_allocated: number
  total_spent: number
  current_balance: number
  status: 'active' | 'closed'
  closed_at: string | null
  closed_by: string | null
  recharge_amount: number
  recharge_source: string | null
  closure_summary: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface Expense {
  id: string
  organization_id: string
  cycle_id: string
  amount: number
  category: ExpenseCategoryKey
  description: string
  payment_method: string
  receipt_url: string | null
  expense_date: string
  created_by: string | null
  created_at: string
  is_cancelled: boolean
  cancellation_reason: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  profiles?: {
    full_name: string | null
  } | null
}

export interface BudgetTopUp {
  id: string
  organization_id: string
  cycle_id: string
  sales_session_id: string | null
  transaction_id: string | null
  amount: number
  reason: string
  source: 'caisse_du_jour' | 'apport_externe_gerant' | 'autre'
  created_by: string | null
  created_at: string
  profiles?: {
    full_name: string | null
  } | null
}
