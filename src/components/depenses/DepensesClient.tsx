'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import BudgetHeroGauge from './BudgetHeroGauge'
import BudgetKpiCards from './BudgetKpiCards'
import QuickActionsBar from './QuickActionsBar'
import ExpenseHistoryFeed from './ExpenseHistoryFeed'
import NewExpenseModal from './NewExpenseModal'
import TopUpModal from './TopUpModal'
import WeeklyClosingModal from './WeeklyClosingModal'
import CancelExpenseModal from './CancelExpenseModal'
import ReceiptPreviewModal from './ReceiptPreviewModal'
import CycleArchiveDrawer from './CycleArchiveDrawer'
import type { ExpenseCycle, Expense, BudgetTopUp } from '@/lib/schemas/expenses'
import { getActiveExpenseCycleData } from '@/lib/actions/expenses'
import { toast } from 'sonner'

interface Props {
  initialCycle: ExpenseCycle
  initialExpenses: Expense[]
  initialTopUps: BudgetTopUp[]
  hasOpenSalesSession: boolean
  availableCashInDrawer: number
  totalWeekCashSales: number
  userRole: string
}

export default function DepensesClient({
  initialCycle,
  initialExpenses,
  initialTopUps,
  hasOpenSalesSession,
  availableCashInDrawer,
  totalWeekCashSales,
  userRole,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [cycle, setCycle] = useState<ExpenseCycle>(initialCycle)
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [topUps, setTopUps] = useState<BudgetTopUp[]>(initialTopUps)
  const [cashInDrawer, setCashInDrawer] = useState(availableCashInDrawer)
  const [weekSales, setWeekSales] = useState(totalWeekCashSales)

  // Modals state
  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false)
  const [isTopUpOpen, setIsTopUpOpen] = useState(false)
  const [isClosingOpen, setIsClosingOpen] = useState(false)
  const [isArchivesOpen, setIsArchivesOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Expense | null>(null)
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null)

  const canClose = ['super_admin', 'gerant'].includes(userRole)

  // Détection du dimanche ou lundi pour la clôture
  const now = new Date()
  const isSundayOrMonday = now.getDay() === 0 || now.getDay() === 1

  // Détection si la date de fin du cycle est déjà passée
  const isPastCycleUnclosed = new Date(cycle.end_date) < now

  // Rafraîchissement complet après mutation
  const refreshData = async () => {
    const res = await getActiveExpenseCycleData()
    if (res.success && res.cycle) {
      setCycle(res.cycle)
      setExpenses(res.expenses || [])
      setTopUps(res.topUps || [])
      setCashInDrawer(res.availableCashInDrawer || 0)
      setWeekSales(res.totalWeekCashSales || 0)
    }
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. Titre & Entête de Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-[#1A1C1A] tracking-tight font-display">
            Régie Dépenses & Menue Caisse
          </h1>
          <p className="text-xs md:text-sm text-[#51443C] mt-0.5">
            Petite caisse de fonctionnement hebdomadaire fixe (100 000 FCFA) · Isolée des ventes
          </p>
        </div>
      </div>

      {/* 2. Cockpit Jauge & Solde Restant */}
      <BudgetHeroGauge
        cycle={cycle}
        isPastCycleUnclosed={isPastCycleUnclosed}
        onOpenClosingModal={() => setIsClosingOpen(true)}
      />

      {/* 3. Actions Rapides Tactiles (48px) */}
      <QuickActionsBar
        onOpenNewExpense={() => setIsNewExpenseOpen(true)}
        onOpenTopUp={() => setIsTopUpOpen(true)}
        onOpenClosing={() => setIsClosingOpen(true)}
        onOpenArchives={() => setIsArchivesOpen(true)}
        canClose={canClose}
        isSundayOrMonday={isSundayOrMonday}
      />

      {/* 4. Cartes KPI (Alloué, Dépensé, Rallonges, Moyenne/Jour) */}
      <BudgetKpiCards cycle={cycle} expenses={expenses} topUps={topUps} />

      {/* 5. Fil d'Activité & Historique Quotidien */}
      <div className="pt-2">
        <div className="mb-3">
          <h2 className="text-base font-bold text-[#1A1C1A] font-display">
            Journal des Achats & Sorties
          </h2>
          <p className="text-xs text-[#51443C]">
            Historique chronologique des opérations de la semaine
          </p>
        </div>

        <ExpenseHistoryFeed
          expenses={expenses}
          topUps={topUps}
          onPreviewReceipt={(url) => setPreviewReceiptUrl(url)}
          onCancelRequest={(exp) => setCancelTarget(exp)}
        />
      </div>

      {/* ── Modales ── */}

      {/* Modal d'ajout de dépense */}
      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => setIsNewExpenseOpen(false)}
        cycleId={cycle.id}
        currentBalance={Number(cycle.current_balance)}
        onExpenseCreated={refreshData}
      />

      {/* Modal de rallonge exceptionnelle */}
      <TopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        cycleId={cycle.id}
        hasOpenSalesSession={hasOpenSalesSession}
        availableCashInDrawer={cashInDrawer}
        onTopUpCreated={refreshData}
      />

      {/* Modal de clôture hebdomadaire */}
      <WeeklyClosingModal
        isOpen={isClosingOpen}
        onClose={() => setIsClosingOpen(false)}
        cycle={cycle}
        expenses={expenses}
        topUps={topUps}
        totalWeekCashSales={weekSales}
        onCycleClosed={refreshData}
      />

      {/* Modal d'annulation de dépense avec motif */}
      <CancelExpenseModal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        expense={cancelTarget}
        onExpenseCancelled={refreshData}
      />

      {/* Modal de prévisualisation du ticket */}
      <ReceiptPreviewModal
        isOpen={!!previewReceiptUrl}
        onClose={() => setPreviewReceiptUrl(null)}
        receiptUrl={previewReceiptUrl}
      />

      {/* Tiroir d'archives des cycles précédents */}
      <CycleArchiveDrawer
        isOpen={isArchivesOpen}
        onClose={() => setIsArchivesOpen(false)}
      />
    </div>
  )
}
