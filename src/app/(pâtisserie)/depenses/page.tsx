import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveExpenseCycleData } from '@/lib/actions/expenses'
import DepensesClient from '@/components/depenses/DepensesClient'

export const metadata = {
  title: 'Dépenses & Petite Caisse — Pâtiss\'App',
  description: 'Gestion de la régie d’avances hebdomadaire (100 000 FCFA), dépenses quotidiennes et clôture.',
}

export default async function DepensesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role_slug, organization_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['super_admin', 'gerant', 'vendeur', 'patissier'].includes(profile.role_slug)) {
    redirect('/dashboard')
  }

  const result = await getActiveExpenseCycleData()

  if (!result.success || !result.cycle) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="p-6 bg-white rounded-2xl border border-red-200 shadow-sm">
          <h2 className="text-lg font-bold text-red-700 font-display">
            Impossible de charger la régie de dépenses
          </h2>
          <p className="text-sm text-[#51443C] mt-2">
            {result.error || 'Erreur inconnue lors du chargement de l’enveloppe hebdomadaire.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <DepensesClient
      initialCycle={result.cycle}
      initialExpenses={result.expenses || []}
      initialTopUps={result.topUps || []}
      hasOpenSalesSession={result.hasOpenSalesSession || false}
      availableCashInDrawer={result.availableCashInDrawer || 0}
      totalWeekCashSales={result.totalWeekCashSales || 0}
      userRole={profile.role_slug}
    />
  )
}
