# Tableau de bord gérant — plan d'implémentation

> **Pour les agents :** sous-compétence requise : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** rendre le tableau de bord gérant lisible, fiable et vivant : bandeau « À faire maintenant », 4 cartes justes, 4 graphes SVG mis à jour à chaque vente.

**Architecture :** toutes les règles de calcul sont des fonctions pures testées dans `src/lib/domain/dashboard-metrics.ts`. Un chargeur serveur (`load-manager-charts.ts`) fait les requêtes Supabase sous RLS et appelle ces fonctions. La page serveur assemble des composants d'affichage simples ; seul le graphe CA cumulé et le filtre de période sont des composants client. Le temps réel vient de `RealtimeSync` (déjà monté dans le layout), qui appelle `router.refresh()` à chaque transaction ou commande.

**Stack :** Next.js 16 (App Router, composants serveur), React, Supabase JS, Lucide, Vitest 4. Aucune nouvelle dépendance.

**Spec :** `docs/superpowers/specs/2026-11-18-dashboard-gerant-design.md`

## Contraintes globales

- Tous les textes visibles en français.
- Aucune nouvelle dépendance npm, aucune migration SQL.
- Périmètre : vue `gerant` et `super_admin` de `/dashboard`. Les blocs `vendeur` et `patissier` restent identiques au caractère près.
- Bornes de journée et tranches horaires en UTC (convention actuelle de l'application, égale à l'heure de Côte d'Ivoire), via `utcDayKey` / `getUTCHours`.
- Montants formatés `toLocaleString('fr-FR')` suivis de la devise de l'organisation ; chiffres en `tabular-nums`.
- Couleurs : tokens existants (`var(--color-primary)`, `var(--color-muted)`, `var(--color-text)`, `var(--color-well)`, `var(--color-border)`, `var(--color-success)`, `var(--color-error)`) ; couleurs opérateurs conservées (Orange `#EA580C`, Wave `#1D93D2`, MTN `#F2C822`, Moov `#009F4D`).
- Cibles tactiles cliquables d'au moins 44px ; aucune information portée par la seule couleur.
- Requêtes faites avec le client Supabase de l'utilisateur (RLS). Toute requête sur `transaction_items` filtre explicitement `transactions.organization_id` (la politique RLS laisse un super-admin tout lire).
- Ne jamais commiter les fichiers déjà modifiés hors de ce chantier (`src/components/orders/*`, `src/lib/actions/orders.ts`, `supabase/.temp/cli-latest`, `.impeccable/critique/`) : ajouter les fichiers un par un.

## Faits vérifiés dans le code (2026-11-18)

- `transactions.payment_method` contient des slugs normalisés par SQL (`cash`, `orange_money`, `wave`, `mobile_money`, `moov_money`). Un paiement fractionné crée **une seule** transaction (méthode forcée à `cash`) avec la ventilation dans `payment_details`. Donc : 1 ligne = 1 encaissement, et la ventilation doit lire `payment_details`, ce que fait déjà `calculateCaisseMetrics` (`src/lib/domain/caisse-metrics.ts`).
- Les fonctions pures et leurs tests vivent dans `src/lib/domain/` (le plan y place `dashboard-metrics.ts` au lieu du `src/lib/dashboard/` cité par la spec).
- La carte s'appelle « Encaissements » plutôt que « Ventes » : un acompte est un encaissement, pas une vente.

## Fichiers

| Fichier | Rôle |
|---|---|
| Créer `src/lib/domain/dashboard-metrics.ts` | Fonctions pures : tranches horaires, cumul, comparaison vs hier, ventilation, top produits, pertes |
| Créer `src/lib/domain/dashboard-metrics.test.ts` | Tests Vitest des fonctions ci-dessus |
| Créer `src/app/(pâtisserie)/dashboard/load-manager-charts.ts` | Requêtes Supabase + appel des fonctions pures |
| Créer `src/components/dashboard/charts/ChartCard.tsx` | Cadre commun d'un graphe (titre, sous-titre, note, état vide) |
| Créer `src/components/dashboard/charts/HourlySalesBars.tsx` | Barres ventes par heure |
| Créer `src/components/dashboard/charts/TopProductsList.tsx` | Top 5 produits |
| Créer `src/components/dashboard/charts/PaymentDonut.tsx` | Anneau des modes de règlement |
| Créer `src/components/dashboard/charts/CumulativeRevenueChart.tsx` | Courbe CA cumulé vs hier (client, survol) |
| Créer `src/components/dashboard/TodoStrip.tsx` | Bandeau « À faire maintenant » |
| Créer `src/components/dashboard/DashboardPeriodFilter.tsx` | Bouton « Période » repliable (client) |
| Modifier `src/app/(pâtisserie)/dashboard/page.tsx` | Assemblage de la vue gérant |
| Modifier `src/components/dashboard/AIAssistant.tsx` | Icônes Lucide dans les suggestions, hauteur réduite |

---

### Tâche 1 : fonctions de calcul pures

**Fichiers :**
- Créer : `src/lib/domain/dashboard-metrics.ts`
- Test : `src/lib/domain/dashboard-metrics.test.ts`

**Interfaces :**
- Consomme : `calculateCaisseMetrics` (`./caisse-metrics`), `PAYMENT_METHODS`, `CanonicalPaymentMethod`, `PaymentDetails` (`./payments`).
- Produit (utilisé par les tâches 2 à 6) :
  - `type DashboardTransaction = { amount: number | null; created_at: string | null; payment_method: string | null; payment_details?: PaymentDetails | null; label_type: string | null }`
  - `type HourlyBucket = { hour: number; count: number; amount: number }`
  - `type CumulativePoint = { hour: number; today: number | null; yesterday: number }`
  - `type YesterdayComparison = { today: number; yesterday: number; deltaPct: number | null }`
  - `type SalesSummary = { count: number; revenue: number }`
  - `type PaymentSlice = { method: CanonicalPaymentMethod; amount: number; pct: number }`
  - `type TransactionItemInput = { name: string | null; quantity: number | null; unit_price: number | null; subtotal: number | null }`
  - `type TopProduct = { name: string; quantity: number; amount: number }`
  - `type WasteLogInput = { quantity_change: number | null; cost_per_unit: number | null }`
  - `type WasteSummary = { value: number; count: number; missingCost: number }`
  - `utcDayKey(date: Date): string`, `previousUtcDayKey(date: Date): string`
  - `transactionsSince(txs: DashboardTransaction[], startDay: string): DashboardTransaction[]`
  - `hourlyBuckets(txs: DashboardTransaction[], dayKey: string): HourlyBucket[]` (toujours 24 entrées)
  - `buildCumulativeSeries(txs: DashboardTransaction[], now: Date, defaultRange?: { from: number; to: number }): CumulativePoint[]`
  - `compareWithYesterday(txs: DashboardTransaction[], now: Date): YesterdayComparison`
  - `summarizeSales(txs: DashboardTransaction[]): SalesSummary`
  - `paymentSlices(txs: DashboardTransaction[]): PaymentSlice[]`
  - `topProducts(items: TransactionItemInput[], limit?: number): TopProduct[]`
  - `wasteSummary(logs: WasteLogInput[]): WasteSummary`

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `src/lib/domain/dashboard-metrics.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import {
  buildCumulativeSeries,
  compareWithYesterday,
  hourlyBuckets,
  paymentSlices,
  previousUtcDayKey,
  summarizeSales,
  topProducts,
  transactionsSince,
  utcDayKey,
  wasteSummary,
  type DashboardTransaction,
} from './dashboard-metrics'

const tx = (amount: number, created_at: string | null, payment_method = 'cash', payment_details: DashboardTransaction['payment_details'] = null): DashboardTransaction => ({
  amount,
  created_at,
  payment_method,
  payment_details,
  label_type: 'VENTE_DIRECTE',
})

const NOW = new Date('2026-11-18T11:30:00Z')

const TXS: DashboardTransaction[] = [
  tx(1000, '2026-11-18T08:15:00+00:00'),
  tx(2500, '2026-11-18T08:45:00+00:00', 'cash', { Wave: 1500, 'Espèces': 1000 }),
  tx(4000, '2026-11-18T10:05:00+00:00', 'orange_money'),
  tx(2000, '2026-11-17T09:00:00+00:00'),
  tx(3000, '2026-11-17T11:00:00+00:00', 'wave'),
  tx(6000, '2026-11-17T15:00:00+00:00'),
  tx(500, null),
]

describe('dashboard metrics — jours UTC', () => {
  it('donne la clé du jour et de la veille en UTC', () => {
    expect(utcDayKey(NOW)).toBe('2026-11-18')
    expect(previousUtcDayKey(new Date('2026-03-01T05:00:00Z'))).toBe('2026-02-28')
  })

  it('garde les transactions datées à partir du jour donné', () => {
    expect(transactionsSince(TXS, '2026-11-18')).toHaveLength(3)
  })
})

describe('dashboard metrics — tranches horaires', () => {
  it('regroupe nombre et montant par heure pour un jour', () => {
    const buckets = hourlyBuckets(TXS, '2026-11-18')
    expect(buckets).toHaveLength(24)
    expect(buckets[8]).toEqual({ hour: 8, count: 2, amount: 3500 })
    expect(buckets[10]).toEqual({ hour: 10, count: 1, amount: 4000 })
    expect(buckets[9]).toEqual({ hour: 9, count: 0, amount: 0 })
  })
})

describe('dashboard metrics — CA cumulé', () => {
  it('cumule aujourd\'hui jusqu\'à l\'heure courante et hier sur toute la plage', () => {
    const points = buildCumulativeSeries(TXS, NOW)
    expect(points[0]).toEqual({ hour: 6, today: 0, yesterday: 0 })
    expect(points[points.length - 1].hour).toBe(22)
    const byHour = new Map(points.map(p => [p.hour, p]))
    expect(byHour.get(8)).toEqual({ hour: 8, today: 3500, yesterday: 0 })
    expect(byHour.get(9)).toEqual({ hour: 9, today: 3500, yesterday: 2000 })
    expect(byHour.get(11)).toEqual({ hour: 11, today: 7500, yesterday: 5000 })
    expect(byHour.get(12)).toEqual({ hour: 12, today: null, yesterday: 5000 })
    expect(byHour.get(22)).toEqual({ hour: 22, today: null, yesterday: 11000 })
  })

  it('élargit la plage quand il y a de l\'activité avant 6h', () => {
    const points = buildCumulativeSeries([...TXS, tx(100, '2026-11-18T04:10:00+00:00')], NOW)
    expect(points[0]).toEqual({ hour: 4, today: 100, yesterday: 0 })
  })
})

describe('dashboard metrics — comparaison avec hier', () => {
  it('compare au CA d\'hier à la même heure', () => {
    expect(compareWithYesterday(TXS, NOW)).toEqual({ today: 7500, yesterday: 5000, deltaPct: 50 })
  })

  it('ne donne pas de pourcentage quand hier vaut 0', () => {
    const onlyToday = transactionsSince(TXS, '2026-11-18')
    expect(compareWithYesterday(onlyToday, NOW).deltaPct).toBeNull()
  })
})

describe('dashboard metrics — encaissements et modes', () => {
  it('compte une ligne par encaissement positif et somme le CA', () => {
    expect(summarizeSales(transactionsSince(TXS, '2026-11-18'))).toEqual({ count: 3, revenue: 7500 })
  })

  it('ventile les modes en lisant payment_details et les slugs', () => {
    const slices = paymentSlices(transactionsSince(TXS, '2026-11-18'))
    expect(slices.map(s => s.method)).toEqual(['Orange Money', 'Espèces', 'Wave'])
    expect(slices.map(s => s.amount)).toEqual([4000, 2000, 1500])
    expect(slices[0].pct).toBeCloseTo(53.33, 1)
  })
})

describe('dashboard metrics — produits et pertes', () => {
  it('classe les produits par quantité en regroupant les noms', () => {
    const items = [
      { name: 'Croissant', quantity: 3, unit_price: 500, subtotal: null },
      { name: 'Croissant ', quantity: 2, unit_price: 500, subtotal: 1000 },
      { name: 'Éclair', quantity: 1, unit_price: 800, subtotal: 800 },
      { name: null, quantity: 4, unit_price: 100, subtotal: null },
    ]
    expect(topProducts(items)).toEqual([
      { name: 'Croissant', quantity: 5, amount: 2500 },
      { name: 'Article', quantity: 4, amount: 400 },
      { name: 'Éclair', quantity: 1, amount: 800 },
    ])
    expect(topProducts(items, 2)).toHaveLength(2)
  })

  it('valorise les pertes au coût et compte celles sans coût', () => {
    expect(wasteSummary([
      { quantity_change: -2, cost_per_unit: 300 },
      { quantity_change: -0.5, cost_per_unit: 1000 },
      { quantity_change: -1, cost_per_unit: 0 },
      { quantity_change: -3, cost_per_unit: null },
    ])).toEqual({ value: 1100, count: 4, missingCost: 2 })
  })
})
```

- [ ] **Étape 2 : lancer les tests et constater l'échec**

Commande : `npx vitest run src/lib/domain/dashboard-metrics.test.ts`
Attendu : échec « Failed to resolve import "./dashboard-metrics" ».

- [ ] **Étape 3 : écrire l'implémentation**

Créer `src/lib/domain/dashboard-metrics.ts` :

```ts
import { calculateCaisseMetrics } from './caisse-metrics'
import { PAYMENT_METHODS, type CanonicalPaymentMethod, type PaymentDetails } from './payments'

export type DashboardTransaction = {
  amount: number | null
  created_at: string | null
  payment_method: string | null
  payment_details?: PaymentDetails | null
  label_type: string | null
}

export type HourlyBucket = { hour: number; count: number; amount: number }
export type CumulativePoint = { hour: number; today: number | null; yesterday: number }
export type YesterdayComparison = { today: number; yesterday: number; deltaPct: number | null }
export type SalesSummary = { count: number; revenue: number }
export type PaymentSlice = { method: CanonicalPaymentMethod; amount: number; pct: number }
export type TransactionItemInput = { name: string | null; quantity: number | null; unit_price: number | null; subtotal: number | null }
export type TopProduct = { name: string; quantity: number; amount: number }
export type WasteLogInput = { quantity_change: number | null; cost_per_unit: number | null }
export type WasteSummary = { value: number; count: number; missingCost: number }

const DAY_MS = 24 * 60 * 60 * 1000

function toNumber(value: number | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function previousUtcDayKey(date: Date): string {
  return utcDayKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1)))
}

export function transactionsSince(txs: DashboardTransaction[], startDay: string): DashboardTransaction[] {
  return txs.filter(tx => {
    const d = parseDate(tx.created_at)
    return d !== null && utcDayKey(d) >= startDay
  })
}

export function hourlyBuckets(txs: DashboardTransaction[], dayKey: string): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, amount: 0 }))
  for (const tx of txs) {
    const d = parseDate(tx.created_at)
    if (!d || utcDayKey(d) !== dayKey) continue
    const bucket = buckets[d.getUTCHours()]
    bucket.count += 1
    bucket.amount += toNumber(tx.amount)
  }
  return buckets
}

export function buildCumulativeSeries(
  txs: DashboardTransaction[],
  now: Date,
  defaultRange: { from: number; to: number } = { from: 6, to: 22 }
): CumulativePoint[] {
  const today = hourlyBuckets(txs, utcDayKey(now))
  const yesterday = hourlyBuckets(txs, previousUtcDayKey(now))
  const activeHours = [...today, ...yesterday].filter(b => b.count > 0).map(b => b.hour)
  const from = Math.min(defaultRange.from, ...activeHours)
  const to = Math.max(defaultRange.to, ...activeHours)
  const currentHour = now.getUTCHours()

  const points: CumulativePoint[] = []
  let cumulToday = 0
  let cumulYesterday = 0
  for (let hour = 0; hour <= to; hour++) {
    cumulToday += today[hour].amount
    cumulYesterday += yesterday[hour].amount
    if (hour >= from) {
      points.push({ hour, today: hour <= currentHour ? cumulToday : null, yesterday: cumulYesterday })
    }
  }
  return points
}

export function compareWithYesterday(txs: DashboardTransaction[], now: Date): YesterdayComparison {
  const todayKey = utcDayKey(now)
  const yesterdayKey = previousUtcDayKey(now)
  const cutoff = now.getTime() - DAY_MS
  let today = 0
  let yesterday = 0
  for (const tx of txs) {
    const d = parseDate(tx.created_at)
    if (!d) continue
    const key = utcDayKey(d)
    if (key === todayKey && d.getTime() <= now.getTime()) today += toNumber(tx.amount)
    else if (key === yesterdayKey && d.getTime() <= cutoff) yesterday += toNumber(tx.amount)
  }
  const deltaPct = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : null
  return { today, yesterday, deltaPct }
}

export function summarizeSales(txs: DashboardTransaction[]): SalesSummary {
  let count = 0
  let revenue = 0
  for (const tx of txs) {
    const amount = toNumber(tx.amount)
    revenue += amount
    if (amount > 0) count += 1
  }
  return { count, revenue }
}

export function paymentSlices(txs: DashboardTransaction[]): PaymentSlice[] {
  const { paymentBreakdown } = calculateCaisseMetrics(
    txs.map(tx => ({
      amount: tx.amount,
      payment_method: tx.payment_method,
      payment_details: tx.payment_details ?? null,
      label_type: tx.label_type,
    })),
    []
  )
  const positive = PAYMENT_METHODS
    .map(method => ({ method, amount: paymentBreakdown[method] }))
    .filter(slice => slice.amount > 0)
  const total = positive.reduce((sum, slice) => sum + slice.amount, 0)
  return positive
    .map(slice => ({ ...slice, pct: total > 0 ? (slice.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

export function topProducts(items: TransactionItemInput[], limit = 5): TopProduct[] {
  const byName = new Map<string, TopProduct>()
  for (const item of items) {
    const name = item.name?.trim() || 'Article'
    const quantity = toNumber(item.quantity)
    const amount = item.subtotal !== null && item.subtotal !== undefined
      ? toNumber(item.subtotal)
      : quantity * toNumber(item.unit_price)
    const current = byName.get(name) ?? { name, quantity: 0, amount: 0 }
    current.quantity += quantity
    current.amount += amount
    byName.set(name, current)
  }
  return [...byName.values()]
    .sort((a, b) => b.quantity - a.quantity || b.amount - a.amount)
    .slice(0, limit)
}

export function wasteSummary(logs: WasteLogInput[]): WasteSummary {
  let value = 0
  let missingCost = 0
  for (const log of logs) {
    const cost = toNumber(log.cost_per_unit)
    if (cost <= 0) {
      missingCost += 1
      continue
    }
    value += Math.abs(toNumber(log.quantity_change)) * cost
  }
  return { value, count: logs.length, missingCost }
}
```

- [ ] **Étape 4 : relancer les tests**

Commande : `npx vitest run src/lib/domain/dashboard-metrics.test.ts`
Attendu : tous les tests passent (11 tests).

- [ ] **Étape 5 : commiter**

```bash
git add src/lib/domain/dashboard-metrics.ts src/lib/domain/dashboard-metrics.test.ts
git commit -m "feat(dashboard): fonctions pures des indicateurs et graphes gérant"
```

---

### Tâche 2 : chargeur serveur des données gérant

**Fichiers :**
- Créer : `src/app/(pâtisserie)/dashboard/load-manager-charts.ts`

**Interfaces :**
- Consomme : tout l'export de la tâche 1 ; `createClient` de `@/lib/supabase/server` (pour le type du client).
- Produit :
  - `type ManagerChartsData = { cumulative: CumulativePoint[]; hourly: HourlyBucket[]; comparison: YesterdayComparison; sales: SalesSummary; paymentSlices: PaymentSlice[]; topProducts: TopProduct[]; waste: WasteSummary; errors: { transactions: boolean; items: boolean; waste: boolean } }`
  - `loadManagerCharts(supabase: ServerSupabase, organizationId: string, startDate: string, now: Date): Promise<ManagerChartsData>`

- [ ] **Étape 1 : écrire le chargeur**

Créer `src/app/(pâtisserie)/dashboard/load-manager-charts.ts` :

```ts
import type { createClient } from '@/lib/supabase/server'
import type { PaymentDetails } from '@/lib/domain/payments'
import {
  buildCumulativeSeries,
  compareWithYesterday,
  hourlyBuckets,
  paymentSlices,
  previousUtcDayKey,
  summarizeSales,
  topProducts,
  transactionsSince,
  utcDayKey,
  wasteSummary,
  type CumulativePoint,
  type DashboardTransaction,
  type HourlyBucket,
  type PaymentSlice,
  type SalesSummary,
  type TopProduct,
  type WasteSummary,
  type YesterdayComparison,
} from '@/lib/domain/dashboard-metrics'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

export type ManagerChartsData = {
  cumulative: CumulativePoint[]
  hourly: HourlyBucket[]
  comparison: YesterdayComparison
  sales: SalesSummary
  paymentSlices: PaymentSlice[]
  topProducts: TopProduct[]
  waste: WasteSummary
  errors: { transactions: boolean; items: boolean; waste: boolean }
}

export async function loadManagerCharts(
  supabase: ServerSupabase,
  organizationId: string,
  startDate: string,
  now: Date
): Promise<ManagerChartsData> {
  const yesterdayKey = previousUtcDayKey(now)
  const since = startDate < yesterdayKey ? startDate : yesterdayKey

  const [txRes, itemsRes, wasteRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, created_at, payment_method, payment_details, label_type')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .eq('is_historical', false)
      .gte('created_at', `${since}T00:00:00`),
    supabase
      .from('transaction_items')
      .select('name, quantity, unit_price, subtotal, transactions!inner(created_at, organization_id, deleted_at, is_historical)')
      .eq('transactions.organization_id', organizationId)
      .is('transactions.deleted_at', null)
      .eq('transactions.is_historical', false)
      .gte('transactions.created_at', `${startDate}T00:00:00`),
    supabase
      .from('inventory_logs')
      .select('quantity_change, ingredients(cost_per_unit)')
      .eq('organization_id', organizationId)
      .eq('reason', 'waste')
      .gte('log_date', `${startDate}T00:00:00`),
  ])

  const allTxs: DashboardTransaction[] = (txRes.data ?? []).map(row => ({
    amount: row.amount,
    created_at: row.created_at,
    payment_method: row.payment_method,
    payment_details: (row.payment_details ?? null) as PaymentDetails | null,
    label_type: row.label_type,
  }))
  const periodTxs = transactionsSince(allTxs, startDate)

  const items = (itemsRes.data ?? []).map(row => ({
    name: row.name,
    quantity: row.quantity,
    unit_price: row.unit_price,
    subtotal: row.subtotal,
  }))

  const wasteLogs = (wasteRes.data ?? []).map(row => {
    const ingredient = Array.isArray(row.ingredients) ? row.ingredients[0] : row.ingredients
    return { quantity_change: row.quantity_change, cost_per_unit: ingredient?.cost_per_unit ?? null }
  })

  return {
    cumulative: buildCumulativeSeries(allTxs, now),
    hourly: hourlyBuckets(allTxs, utcDayKey(now)),
    comparison: compareWithYesterday(allTxs, now),
    sales: summarizeSales(periodTxs),
    paymentSlices: paymentSlices(periodTxs),
    topProducts: topProducts(items),
    waste: wasteSummary(wasteLogs),
    errors: {
      transactions: Boolean(txRes.error),
      items: Boolean(itemsRes.error),
      waste: Boolean(wasteRes.error),
    },
  }
}
```

- [ ] **Étape 2 : vérifier le typage**

Commande : `npx tsc --noEmit -p . 2>&1 | grep -E "load-manager-charts|dashboard-metrics"`
Attendu : aucune ligne. Si Supabase type `row.ingredients` ou `row.transactions` autrement, ajuster uniquement la conversion dans les `map`, pas les fonctions de la tâche 1.

- [ ] **Étape 3 : commiter**

```bash
git add "src/app/(pâtisserie)/dashboard/load-manager-charts.ts"
git commit -m "feat(dashboard): chargeur serveur des données du tableau gérant"
```

---

### Tâche 3 : graphes serveur (cadre, ventes par heure, top produits, anneau)

**Fichiers :**
- Créer : `src/components/dashboard/charts/ChartCard.tsx`
- Créer : `src/components/dashboard/charts/HourlySalesBars.tsx`
- Créer : `src/components/dashboard/charts/TopProductsList.tsx`
- Créer : `src/components/dashboard/charts/PaymentDonut.tsx`

**Interfaces :**
- Consomme : `HourlyBucket`, `TopProduct`, `PaymentSlice`, `CanonicalPaymentMethod`.
- Produit :
  - `ChartCard({ title: string; subtitle?: string; note?: string; children: ReactNode })` (export par défaut) et `ChartEmpty({ children: ReactNode })` (export nommé)
  - `HourlySalesBars({ buckets: HourlyBucket[]; currentHour: number; currency: string })`
  - `TopProductsList({ products: TopProduct[]; currency: string })`
  - `PaymentDonut({ slices: PaymentSlice[]; currency: string })`

- [ ] **Étape 1 : créer `ChartCard.tsx`**

```tsx
import type { ReactNode } from 'react'

export function ChartEmpty({ children }: { children: ReactNode }) {
    return (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: 0, padding: '8px 0' }}>
            {children}
        </p>
    )
}

export default function ChartCard({ title, subtitle, note, children }: {
    title: string
    subtitle?: string
    note?: string
    children: ReactNode
}) {
    return (
        <section className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
            <header>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>{title}</h3>
                {subtitle && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '4px 0 0' }}>{subtitle}</p>
                )}
                {note && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: '4px 0 0', fontStyle: 'italic' }}>{note}</p>
                )}
            </header>
            {children}
        </section>
    )
}
```

- [ ] **Étape 2 : créer `HourlySalesBars.tsx`**

```tsx
import type { HourlyBucket } from '@/lib/domain/dashboard-metrics'
import { ChartEmpty } from './ChartCard'

export default function HourlySalesBars({ buckets, currentHour, currency }: {
    buckets: HourlyBucket[]
    currentHour: number
    currency: string
}) {
    const active = buckets.filter(b => b.count > 0)
    if (active.length === 0) return <ChartEmpty>Aucune vente pour le moment aujourd&apos;hui.</ChartEmpty>

    const max = Math.max(...active.map(b => b.count), 1)
    const peak = active.reduce((best, b) => (b.count > best.count ? b : best), active[0])

    return (
        <ul aria-label={`Ventes par heure aujourd'hui, pic à ${peak.hour}h avec ${peak.count} vente(s)`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {active.map(b => {
                const isCurrent = b.hour === currentHour
                return (
                    <li key={b.hour} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', alignItems: 'center', gap: '10px', fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{b.hour}h</span>
                        <span style={{ height: '10px', background: 'var(--color-well)', borderRadius: '9999px', overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${(b.count / max) * 100}%`, borderRadius: '9999px', background: isCurrent ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 45%, transparent)' }} />
                        </span>
                        <span style={{ color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                            <strong>{b.count}</strong> · {b.amount.toLocaleString('fr-FR')} {currency}
                            {isCurrent && <span style={{ marginLeft: '6px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)' }}>en cours</span>}
                        </span>
                    </li>
                )
            })}
        </ul>
    )
}
```

- [ ] **Étape 3 : créer `TopProductsList.tsx`**

```tsx
import type { TopProduct } from '@/lib/domain/dashboard-metrics'
import { ChartEmpty } from './ChartCard'

export default function TopProductsList({ products, currency }: { products: TopProduct[]; currency: string }) {
    if (products.length === 0) return <ChartEmpty>Aucun produit vendu sur la période.</ChartEmpty>

    const max = Math.max(...products.map(p => p.quantity), 1)

    return (
        <ol aria-label={`Produits les plus vendus : ${products.map(p => `${p.name} (${p.quantity})`).join(', ')}`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {products.map((p, i) => (
                <li key={p.name} style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', fontSize: '0.875rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-muted)', width: '16px' }}>{i + 1}</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <span style={{ color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                            <strong>{p.quantity}</strong> · {p.amount.toLocaleString('fr-FR')} {currency}
                        </span>
                    </div>
                    <span style={{ marginLeft: '24px', height: '8px', background: 'var(--color-well)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', width: `${(p.quantity / max) * 100}%`, background: 'var(--color-primary)', borderRadius: '9999px' }} />
                    </span>
                </li>
            ))}
        </ol>
    )
}
```

- [ ] **Étape 4 : créer `PaymentDonut.tsx`**

```tsx
import type { PaymentSlice } from '@/lib/domain/dashboard-metrics'
import type { CanonicalPaymentMethod } from '@/lib/domain/payments'
import { ChartEmpty } from './ChartCard'

const COLORS: Record<CanonicalPaymentMethod, string> = {
    'Espèces': 'var(--color-primary)',
    'Orange Money': '#EA580C',
    Wave: '#1D93D2',
    'MTN MOMO': '#F2C822',
    'Moov Money': '#009F4D',
}

const RADIUS = 60
const STROKE = 22
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function PaymentDonut({ slices, currency }: { slices: PaymentSlice[]; currency: string }) {
    if (slices.length === 0) return <ChartEmpty>Aucun encaissement sur la période.</ChartEmpty>

    const total = slices.reduce((sum, s) => sum + s.amount, 0)
    let offset = 0

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px' }}>
            <svg
                viewBox="0 0 160 160"
                width="150"
                height="150"
                role="img"
                aria-label={`Modes de règlement : ${slices.map(s => `${s.method} ${Math.round(s.pct)} %`).join(', ')}`}
                style={{ flexShrink: 0 }}
            >
                <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="var(--color-well)" strokeWidth={STROKE} />
                {slices.map(s => {
                    const length = (s.pct / 100) * CIRCUMFERENCE
                    const circle = (
                        <circle
                            key={s.method}
                            cx="80" cy="80" r={RADIUS}
                            fill="none"
                            stroke={COLORS[s.method]}
                            strokeWidth={STROKE}
                            strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                            strokeDashoffset={-offset}
                            transform="rotate(-90 80 80)"
                        />
                    )
                    offset += length
                    return circle
                })}
                <text x="80" y="78" textAnchor="middle" style={{ fontSize: '17px', fontWeight: 800, fill: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                    {total.toLocaleString('fr-FR')}
                </text>
                <text x="80" y="98" textAnchor="middle" style={{ fontSize: '11px', fill: 'var(--color-muted)' }}>{currency}</text>
            </svg>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '160px' }}>
                {slices.map(s => (
                    <li key={s.method} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                        <span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS[s.method], flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>{s.method}</span>
                        <span style={{ color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                            {s.amount.toLocaleString('fr-FR')} {currency}
                            <span style={{ color: 'var(--color-muted)', marginLeft: '6px' }}>{Math.round(s.pct)} %</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
```

- [ ] **Étape 5 : vérifier typage et lint**

Commandes :
- `npx tsc --noEmit -p . 2>&1 | grep "components/dashboard/charts"`, attendu : aucune ligne.
- `npx eslint src/components/dashboard/charts`, attendu : 0 erreur.

- [ ] **Étape 6 : commiter**

```bash
git add src/components/dashboard/charts/ChartCard.tsx src/components/dashboard/charts/HourlySalesBars.tsx src/components/dashboard/charts/TopProductsList.tsx src/components/dashboard/charts/PaymentDonut.tsx
git commit -m "feat(dashboard): graphes ventes par heure, top produits et modes de règlement"
```

---

### Tâche 4 : courbe CA cumulé vs hier (composant client)

**Fichiers :**
- Créer : `src/components/dashboard/charts/CumulativeRevenueChart.tsx`

**Interfaces :**
- Consomme : `CumulativePoint`.
- Produit : `CumulativeRevenueChart({ points: CumulativePoint[]; currency: string })` (export par défaut, `'use client'`).

- [ ] **Étape 1 : créer le composant**

```tsx
'use client'

import { useState, type PointerEvent } from 'react'
import type { CumulativePoint } from '@/lib/domain/dashboard-metrics'

const W = 640
const H = 220
const PAD = { top: 16, right: 16, bottom: 28, left: 56 }

function fmt(value: number) {
    return value.toLocaleString('fr-FR')
}

export default function CumulativeRevenueChart({ points, currency }: { points: CumulativePoint[]; currency: string }) {
    const [hovered, setHovered] = useState<number | null>(null)

    const todayPoints = points.filter(p => p.today !== null)
    const last = todayPoints[todayPoints.length - 1]
    const values = points.flatMap(p => (p.today === null ? [p.yesterday] : [p.today, p.yesterday]))
    const hi = Math.max(1, ...values)
    const lo = Math.min(0, ...values)
    const innerW = W - PAD.left - PAD.right
    const innerH = H - PAD.top - PAD.bottom
    const step = points.length > 1 ? innerW / (points.length - 1) : 0
    const x = (i: number) => PAD.left + i * step
    const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * innerH

    const yesterdayPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.yesterday)}`).join(' ')
    const todayPath = points
        .map((p, i) => (p.today === null ? null : `${x(i)},${y(p.today)}`))
        .filter((s): s is string => s !== null)
        .map((s, i) => `${i === 0 ? 'M' : 'L'}${s}`)
        .join(' ')
    const hasYesterday = points.some(p => p.yesterday !== 0)
    const lastIndex = last ? points.indexOf(last) : -1

    const onMove = (e: PointerEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const svgX = ((e.clientX - rect.left) / rect.width) * W
        const index = step > 0 ? Math.round((svgX - PAD.left) / step) : 0
        setHovered(Math.max(0, Math.min(points.length - 1, index)))
    }

    const hp = hovered !== null ? points[hovered] : undefined
    const summary = last
        ? `CA cumulé : ${fmt(last.today ?? 0)} ${currency} à ${last.hour}h, contre ${fmt(last.yesterday)} ${currency} hier à la même heure`
        : 'CA cumulé : aucune donnée'

    return (
        <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="20" height="4" aria-hidden="true"><line x1="0" y1="2" x2="20" y2="2" stroke="var(--color-primary)" strokeWidth="3" /></svg>
                    Aujourd&apos;hui
                </span>
                {hasYesterday && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="20" height="4" aria-hidden="true"><line x1="0" y1="2" x2="20" y2="2" stroke="var(--color-muted)" strokeWidth="2" strokeDasharray="3 3" /></svg>
                        Hier
                    </span>
                )}
            </div>
            <svg
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                role="img"
                aria-label={summary}
                onPointerMove={onMove}
                onPointerLeave={() => setHovered(null)}
                style={{ display: 'block', touchAction: 'pan-y' }}
            >
                {[hi, (hi + lo) / 2, lo].map(v => (
                    <g key={v}>
                        <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-border)" strokeWidth="1" />
                        <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" style={{ fontSize: '11px', fill: 'var(--color-muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(Math.round(v))}
                        </text>
                    </g>
                ))}
                {points.map((p, i) => (p.hour % 3 === 0 ? (
                    <text key={p.hour} x={x(i)} y={H - 8} textAnchor="middle" style={{ fontSize: '11px', fill: 'var(--color-muted)' }}>{p.hour}h</text>
                ) : null))}
                {hasYesterday && (
                    <path d={yesterdayPath} fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeDasharray="4 4" />
                )}
                {todayPath && <path d={todayPath} fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
                {last && lastIndex >= 0 && (
                    <g>
                        <circle cx={x(lastIndex)} cy={y(last.today ?? 0)} r="5" fill="var(--color-primary)" stroke="white" strokeWidth="2" />
                        <text x={x(lastIndex)} y={y(last.today ?? 0) - 10} textAnchor={lastIndex > points.length * 0.8 ? 'end' : 'middle'} style={{ fontSize: '12px', fontWeight: 800, fill: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(last.today ?? 0)} {currency}
                        </text>
                    </g>
                )}
                {hp && hovered !== null && (
                    <line x1={x(hovered)} x2={x(hovered)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-text)" strokeOpacity="0.25" strokeWidth="1" />
                )}
            </svg>
            {hp && hovered !== null && (
                <div
                    role="status"
                    style={{
                        position: 'absolute', top: '28px',
                        left: `${(x(hovered) / W) * 100}%`,
                        transform: hovered > points.length / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
                        background: 'var(--color-text)', color: 'white', borderRadius: '8px',
                        padding: '6px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap', pointerEvents: 'none',
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    <strong>{hp.hour}h</strong> · Aujourd&apos;hui : {hp.today === null ? '—' : `${fmt(hp.today)} ${currency}`} · Hier : {fmt(hp.yesterday)} {currency}
                </div>
            )}
            {!last || (last.today ?? 0) === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '8px 0 0' }}>Aucune vente pour le moment aujourd&apos;hui.</p>
            ) : null}
        </div>
    )
}
```

- [ ] **Étape 2 : vérifier typage et lint**

Commandes :
- `npx tsc --noEmit -p . 2>&1 | grep CumulativeRevenueChart`, attendu : aucune ligne.
- `npx eslint src/components/dashboard/charts/CumulativeRevenueChart.tsx`, attendu : 0 erreur.

- [ ] **Étape 3 : commiter**

```bash
git add src/components/dashboard/charts/CumulativeRevenueChart.tsx
git commit -m "feat(dashboard): courbe du CA cumulé comparé à hier"
```

---

### Tâche 5 : bandeau « À faire maintenant » et filtre de période

**Fichiers :**
- Créer : `src/components/dashboard/TodoStrip.tsx`
- Créer : `src/components/dashboard/DashboardPeriodFilter.tsx`

**Interfaces :**
- Produit :
  - `TodoStrip({ readyCount: number; overdueCount: number; alertCount: number; pendingDeposits: number; currency: string })`
  - `DashboardPeriodFilter({ period: 'day' | 'week' | 'month'; client: string })` (`'use client'`)

- [ ] **Étape 1 : créer `TodoStrip.tsx`**

```tsx
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, PackageCheck, Wallet, type LucideIcon } from 'lucide-react'

type TodoItem = { key: string; href: string; icon: LucideIcon; label: string; tone: 'warning' | 'danger' | 'info' }

const TONES = {
    warning: { bg: 'var(--color-badge-warning-bg)', fg: 'var(--color-badge-warning-text)' },
    danger: { bg: 'var(--color-badge-danger-bg)', fg: 'var(--color-badge-danger-text)' },
    info: { bg: 'var(--color-well)', fg: 'var(--color-text)' },
}

export default function TodoStrip({ readyCount, overdueCount, alertCount, pendingDeposits, currency }: {
    readyCount: number
    overdueCount: number
    alertCount: number
    pendingDeposits: number
    currency: string
}) {
    const items: TodoItem[] = []
    if (readyCount > 0) items.push({ key: 'ready', href: '/commandes', icon: PackageCheck, tone: 'info', label: `${readyCount} commande${readyCount > 1 ? 's' : ''} prête${readyCount > 1 ? 's' : ''} à retirer` })
    if (overdueCount > 0) items.push({ key: 'overdue', href: '/commandes', icon: Clock, tone: 'danger', label: `${overdueCount} retard${overdueCount > 1 ? 's' : ''} de retrait` })
    if (alertCount > 0) items.push({ key: 'stock', href: '/ingredients', icon: AlertTriangle, tone: 'warning', label: `${alertCount} ingrédient${alertCount > 1 ? 's' : ''} sous le seuil` })
    if (pendingDeposits > 0) items.push({ key: 'deposits', href: '/commandes', icon: Wallet, tone: 'info', label: `${pendingDeposits.toLocaleString('fr-FR')} ${currency} d'acomptes en cours` })

    return (
        <section aria-label="À faire maintenant" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)', marginRight: '4px' }}>À faire maintenant</span>
            {items.length === 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: 'var(--color-success)', fontWeight: 600 }}>
                    <CheckCircle2 size={16} aria-hidden="true" /> Rien d&apos;urgent pour le moment
                </span>
            ) : items.map(item => {
                const Icon = item.icon
                const tone = TONES[item.tone]
                return (
                    <Link
                        key={item.key}
                        href={item.href}
                        prefetch={true}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px', padding: '0 14px', borderRadius: '9999px', background: tone.bg, color: tone.fg, fontSize: '0.8125rem', fontWeight: 700, textDecoration: 'none' }}
                    >
                        <Icon size={16} aria-hidden="true" />
                        {item.label}
                    </Link>
                )
            })}
        </section>
    )
}
```

- [ ] **Étape 2 : créer `DashboardPeriodFilter.tsx`**

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CalendarDays, ChevronDown } from 'lucide-react'

type Period = 'day' | 'week' | 'month'

const LABELS: Record<Period, string> = {
    day: "Aujourd'hui",
    week: '7 derniers jours',
    month: '30 derniers jours',
}

export default function DashboardPeriodFilter({ period, client }: { period: Period; client: string }) {
    const router = useRouter()
    const pathname = usePathname()
    const [open, setOpen] = useState(false)
    const [clientValue, setClientValue] = useState(client)

    const navigate = (next: { period?: Period; client?: string }) => {
        const params = new URLSearchParams()
        const p = next.period ?? period
        const c = (next.client ?? client).trim()
        if (p !== 'day') params.set('period', p)
        if (c) params.set('client', c)
        const qs = params.toString()
        router.push(qs ? `${pathname}?${qs}` : pathname)
    }

    const onClientSubmit = (e: FormEvent) => {
        e.preventDefault()
        navigate({ client: clientValue })
    }

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                className="btn-secondary"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
                <CalendarDays size={16} aria-hidden="true" />
                Période : {LABELS[period]}{client ? ` · ${client}` : ''}
                <ChevronDown size={16} aria-hidden="true" />
            </button>
            {open && (
                <div className="card" style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 6px)', left: 0, width: 'min(320px, calc(100vw - 32px))', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>
                        Période
                        <select
                            className="input"
                            value={period}
                            onChange={e => navigate({ period: e.target.value as Period })}
                        >
                            {(Object.keys(LABELS) as Period[]).map(p => (
                                <option key={p} value={p}>{LABELS[p]}</option>
                            ))}
                        </select>
                    </label>
                    <form onSubmit={onClientSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label htmlFor="dashboard-client-filter" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>Client</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                id="dashboard-client-filter"
                                className="input"
                                value={clientValue}
                                onChange={e => setClientValue(e.target.value)}
                                placeholder="Nom du client"
                                style={{ flex: 1, minWidth: 0 }}
                            />
                            <button type="submit" className="btn-primary" style={{ minHeight: '44px' }}>Appliquer</button>
                        </div>
                        {client && (
                            <button type="button" className="btn-secondary" onClick={() => { setClientValue(''); navigate({ client: '' }) }} style={{ minHeight: '44px' }}>
                                Effacer le filtre client
                            </button>
                        )}
                    </form>
                </div>
            )}
        </div>
    )
}
```

- [ ] **Étape 3 : vérifier typage et lint**

Commandes :
- `npx tsc --noEmit -p . 2>&1 | grep -E "TodoStrip|DashboardPeriodFilter"`, attendu : aucune ligne.
- `npx eslint src/components/dashboard/TodoStrip.tsx src/components/dashboard/DashboardPeriodFilter.tsx`, attendu : 0 erreur.

- [ ] **Étape 4 : commiter**

```bash
git add src/components/dashboard/TodoStrip.tsx src/components/dashboard/DashboardPeriodFilter.tsx
git commit -m "feat(dashboard): bandeau « À faire maintenant » et filtre de période repliable"
```

---

### Tâche 6 : assembler la vue gérant dans `page.tsx`

**Fichiers :**
- Modifier : `src/app/(pâtisserie)/dashboard/page.tsx` (fichier entier remplacé ci-dessous ; les blocs vendeur et pâtissier sont recopiés à l'identique)

**Interfaces :**
- Consomme : `loadManagerCharts`, `ManagerChartsData` (tâche 2) ; `ChartCard`, `ChartEmpty`, `HourlySalesBars`, `TopProductsList`, `PaymentDonut` (tâche 3) ; `CumulativeRevenueChart` (tâche 4) ; `TodoStrip`, `DashboardPeriodFilter` (tâche 5).

- [ ] **Étape 1 : remplacer le contenu de `page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import StatCard from '@/components/ui/StatCard'
import AIAssistant from '@/components/dashboard/AIAssistant'
import DashboardNewOrderButton from '@/components/dashboard/DashboardNewOrderButton'
import DashboardPeriodFilter from '@/components/dashboard/DashboardPeriodFilter'
import TodoStrip from '@/components/dashboard/TodoStrip'
import ChartCard, { ChartEmpty } from '@/components/dashboard/charts/ChartCard'
import CumulativeRevenueChart from '@/components/dashboard/charts/CumulativeRevenueChart'
import PaymentDonut from '@/components/dashboard/charts/PaymentDonut'
import HourlySalesBars from '@/components/dashboard/charts/HourlySalesBars'
import TopProductsList from '@/components/dashboard/charts/TopProductsList'
import { ShoppingBag, Banknote, Receipt, TrendingDown, AlertTriangle, Clock, ChefHat, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import ProductionPlan from './ProductionPlan'
import VitrineSales from './VitrineSales'
import { loadManagerCharts } from './load-manager-charts'
import { Suspense } from 'react'
import SessionPill from '@/components/layout/SessionPill'

import { cookies } from 'next/headers'
import { getDailyStats } from '@/lib/actions/stats'
import { verifyKioskToken } from '@/lib/kiosk-token'

interface DashboardSearchParams {
    period?: string
    client?: string
}

function computeStartDate(period: string | undefined): string {
    const now = new Date()
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    if (period === 'week') {
        base.setDate(base.getDate() - 7)
    } else if (period === 'month') {
        base.setDate(base.getDate() - 30)
    }

    return base.toISOString().split('T')[0]
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
    const resolvedSearchParams = await searchParams
    const supabase = await createClient()
    // 1. Get auth user and kiosk info
    const { data: { user } } = await supabase.auth.getUser()
    const cookieStore = await cookies()
    
    const kioskToken = cookieStore.get('kiosk_token')?.value
    const claims = kioskToken ? verifyKioskToken(kioskToken) : null
    const kioskUserId = claims?.userId

    if (!user && !kioskUserId) return null

    // 2. Resolve target profile (same logic as Layout)
    let adminProfile = null
    if (user) {
        const { data: p } = await supabase.from('profiles').select('*, organizations(*)').eq('id', user.id).single()
        adminProfile = p
    }

    let profile = adminProfile
    
    if (kioskUserId) {
        // En mode Kiosque, on utilise le client admin pour récupérer le profil de manière fiable
        // (surtout si le gérant s'est déconnecté et qu'il n'y a plus de session auth active)
        const { createClient: createAdminClient } = await import('@supabase/supabase-js')
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data: kp } = await supabaseAdmin.from('profiles').select('*, organizations(*)').eq('id', kioskUserId).single()
        if (kp) profile = kp
    }

    if (!profile) return null

    const org = profile.organizations as { name: string; currency_symbol: string } | null
    const currency = org?.currency_symbol ?? ''

    const roleSlug = profile.role_slug?.toLowerCase() || ''
    const isManager = roleSlug === 'gerant' || roleSlug === 'super_admin'

    const period = resolvedSearchParams.period === 'week' || resolvedSearchParams.period === 'month' ? resolvedSearchParams.period : 'day'
    const startDate = computeStartDate(period)
    const clientFilter = (resolvedSearchParams.client ?? '').trim()
    const now = new Date()

    // Données parallèles
    const ordersQuery = supabase
        .from('orders')
        .select('id, order_number, total_amount, status, pickup_date, customer_name, deposit_amount, payment_status, reception_type')
        .eq('organization_id', profile.organization_id!)
        .is('deleted_at', null)
        .or(`pickup_date.gte.${startDate},status.in.(pending,production,ready,confirmed,in_preparation,awaiting_pickup)`)

    const filteredOrdersQuery = clientFilter
        ? ordersQuery.ilike('customer_name', `%${clientFilter}%`)
        : ordersQuery

    const [ordersRes, alertsRes, dailyStats, charts] = await Promise.all([
        filteredOrdersQuery,
        supabase.from('ingredients').select('name, current_stock, alert_threshold').eq('organization_id', profile.organization_id!),
        period === 'day' && !clientFilter ? getDailyStats(profile.organization_id!) : Promise.resolve({ ca_encaisse: null }),
        isManager ? loadManagerCharts(supabase, profile.organization_id!, startDate, now) : Promise.resolve(null),
    ])

    const orders = ordersRes.data ?? []
    const ingredients = alertsRes.data ?? []

    // Si on regarde la journée sans filtre client, la Source of Truth est le RPC (qui inclut commandes payées + caisse rapide).
    // Sinon, on fait la somme classique des commandes filtrées/période large.
    const totalSales = dailyStats.ca_encaisse !== null 
        ? dailyStats.ca_encaisse 
        : orders.filter(o => o.status === 'completed').reduce((s, o) => s + o.total_amount, 0)

    const pendingCount = orders.filter(o => ['pending', 'production', 'confirmed', 'in_preparation'].includes(o.status)).length
    const readyCount = orders.filter(o => ['ready', 'awaiting_pickup'].includes(o.status)).length
    
    const pendingDeposits = orders
        .filter(o => ['pending', 'production', 'ready', 'confirmed', 'in_preparation', 'awaiting_pickup'].includes(o.status))
        .reduce((sum, o) => sum + (o.deposit_amount || 0), 0)

    const alertCount = ingredients.filter(i => i.current_stock < i.alert_threshold).length

    // Nouvelles métriques sémantiques pour le POS
    const todayStr = now.toISOString().split('T')[0]
    const todayOrders = orders.filter(o => o.pickup_date?.substring(0, 10) === todayStr)
    const plannedPickupsCount = todayOrders.filter(o => o.status !== 'cancelled').length
    const completedPickupsCount = todayOrders.filter(o => o.status === 'completed').length

    const overdueCount = orders.filter(o => {
        const pickupDateStr = o.pickup_date?.substring(0, 10)
        return pickupDateStr && pickupDateStr < todayStr && ['pending', 'production', 'ready', 'confirmed', 'in_preparation', 'awaiting_pickup'].includes(o.status)
    }).length

    const periodLabel =
        period === 'week' ? '7 derniers jours' :
            period === 'month' ? '30 derniers jours' :
                'Aujourd\'hui'

    const updatedAt = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
    const chartsNote = clientFilter ? 'Graphes non filtrés par client' : undefined
    const deltaPct = charts && period === 'day' && !clientFilter ? charts.comparison.deltaPct : null
    const caTrend = deltaPct === null ? {} : {
        trend: (deltaPct >= 0 ? 'up' : 'down') as 'up' | 'down',
        trendLabel: `${deltaPct >= 0 ? '+' : ''}${deltaPct} % vs hier à la même heure`,
    }

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
                        Bonjour, {profile.full_name.split(' ')[0]}
                    </h1>
                    <p style={{ color: 'var(--color-muted)', margin: '4px 0 0', fontSize: '0.9rem' }}>
                        {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        {org ? ` · ${org.name}` : ''}
                    </p>
                    {isManager && (
                        <p style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: '6px 0 0', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-success)' }}>
                            <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)' }} />
                            En direct · mis à jour à {updatedAt}
                        </p>
                    )}
                </div>
                {/* Pill session + Bouton Nouvelle Commande — visibles pour les rôles autorisés */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <SessionPill />
                    {(roleSlug === 'gerant' || roleSlug === 'vendeur' || roleSlug === 'super_admin') && (
                        <DashboardNewOrderButton organizationId={profile.organization_id!} currency={currency} />
                    )}
                </div>
            </div>

            {/* ── Gérant ── */}
            {isManager && charts && (
                <>
                    <div style={{ marginBottom: '16px' }}>
                        <DashboardPeriodFilter period={period} client={clientFilter} />
                    </div>

                    <TodoStrip
                        readyCount={readyCount}
                        overdueCount={overdueCount}
                        alertCount={alertCount}
                        pendingDeposits={pendingDeposits}
                        currency={currency}
                    />

                    <div className="dashboard-kpis">
                        <StatCard
                            title={`CA (${periodLabel})`}
                            value={`${totalSales.toLocaleString('fr-FR')} ${currency}`}
                            icon={Banknote} iconColor="var(--color-primary)" accent="var(--color-primary)"
                            {...caTrend}
                        />
                        <StatCard
                            title={`Encaissements (${periodLabel})`}
                            value={charts.sales.count}
                            subtitle={charts.sales.count > 0
                                ? `Panier moyen : ${Math.round(charts.sales.revenue / charts.sales.count).toLocaleString('fr-FR')} ${currency}`
                                : 'Aucun encaissement'}
                            icon={Receipt} iconColor="var(--color-primary)" accent="var(--color-primary)"
                        />
                        <StatCard
                            title="Retraits du jour"
                            value={plannedPickupsCount > 0 ? `${completedPickupsCount} sur ${plannedPickupsCount}` : '0'}
                            subtitle={plannedPickupsCount > 0 ? 'commandes retirées' : 'Aucun retrait prévu'}
                            icon={ShoppingBag} iconColor="var(--color-badge-success-accent)" accent="var(--color-badge-success-bg)"
                        />
                        <StatCard
                            title={`Pertes (${periodLabel})`}
                            value={charts.errors.waste ? '—' : `${Math.round(charts.waste.value).toLocaleString('fr-FR')} ${currency}`}
                            subtitle={charts.errors.waste
                                ? 'Données indisponibles'
                                : `${charts.waste.count} déclaration${charts.waste.count > 1 ? 's' : ''}${charts.waste.missingCost > 0 ? `, dont ${charts.waste.missingCost} sans coût renseigné` : ''}`}
                            icon={TrendingDown} iconColor="var(--color-error)" accent="var(--color-badge-danger-bg)"
                        />
                    </div>

                    <div className="dashboard-row dashboard-row-wide">
                        <ChartCard title="CA cumulé aujourd'hui" subtitle="Comparé à hier, heure par heure" note={chartsNote}>
                            {charts.errors.transactions
                                ? <ChartEmpty>Données indisponibles.</ChartEmpty>
                                : <CumulativeRevenueChart points={charts.cumulative} currency={currency} />}
                        </ChartCard>
                        <ChartCard title="Modes de règlement" subtitle={periodLabel} note={chartsNote}>
                            {charts.errors.transactions
                                ? <ChartEmpty>Données indisponibles.</ChartEmpty>
                                : <PaymentDonut slices={charts.paymentSlices} currency={currency} />}
                        </ChartCard>
                    </div>

                    <div className="dashboard-row dashboard-row-half">
                        <ChartCard title="Ventes par heure" subtitle="Aujourd'hui" note={chartsNote}>
                            {charts.errors.transactions
                                ? <ChartEmpty>Données indisponibles.</ChartEmpty>
                                : <HourlySalesBars buckets={charts.hourly} currentHour={now.getUTCHours()} currency={currency} />}
                        </ChartCard>
                        <ChartCard title="Top 5 produits" subtitle={periodLabel} note={chartsNote}>
                            {charts.errors.items
                                ? <ChartEmpty>Données indisponibles.</ChartEmpty>
                                : <TopProductsList products={charts.topProducts} currency={currency} />}
                        </ChartCard>
                    </div>

                    {/* Retraits & Livraisons du jour */}
                    <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
                                    Retraits & Livraisons
                                </h3>
                                <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '4px 0 0' }}>
                                    Commandes prévues aujourd&apos;hui ({now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })})
                                </p>
                            </div>
                            <Link href="/commandes" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '2px', padding: '4px 8px', borderRadius: '6px', background: 'var(--color-well)' }}>
                                Tout voir <ArrowUpRight size={12} />
                            </Link>
                        </div>

                        {todayOrders.length === 0 ? (
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: 0 }}>
                                Aucun retrait ou livraison prévu aujourd&apos;hui.
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '280px', paddingRight: '4px' }}>
                                {todayOrders.map((o) => {
                                    // Calculer le style et label de statut
                                    let statusColor = 'var(--color-badge-warning-text)'
                                    let statusBg = 'var(--color-badge-warning-bg)'
                                    let statusText = 'En attente'
                                    if (o.status === 'production' || o.status === 'in_preparation') {
                                        statusColor = 'var(--color-badge-production-text)'
                                        statusBg = 'var(--color-badge-production-bg)'
                                        statusText = 'En cours'
                                    } else if (o.status === 'ready' || o.status === 'awaiting_pickup') {
                                        statusColor = 'var(--color-badge-success-text)'
                                        statusBg = 'var(--color-badge-success-bg)'
                                        statusText = 'Prête'
                                    } else if (o.status === 'completed' || o.status === 'delivered') {
                                        statusColor = 'var(--color-text)'
                                        statusBg = 'var(--color-well)'
                                        statusText = 'Retirée'
                                    } else if (o.status === 'cancelled') {
                                        statusColor = 'var(--color-badge-danger-text)'
                                        statusBg = 'var(--color-badge-danger-bg)'
                                        statusText = 'Annulée'
                                    }

                                    // Formatter l'heure de retrait (pickup_date)
                                    let timeStr = 'Non définie'
                                    if (o.pickup_date) {
                                        const d = new Date(o.pickup_date)
                                        if (!Number.isNaN(d.getTime())) {
                                            timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                                        }
                                    }

                                    return (
                                        <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--color-well)', borderRadius: 'var(--radius-sm)', gap: '12px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', fontWeight: 600 }}>
                                                        {o.order_number || `#${o.id.substring(0, 6)}`}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: o.reception_type === 'livraison' ? '#E0F2FE' : '#F3E8FF', color: o.reception_type === 'livraison' ? '#0369A1' : '#6B21A8', textTransform: 'capitalize' }}>
                                                        {o.reception_type || 'Retrait'}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {o.customer_name}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                                                        {o.total_amount.toLocaleString('fr-FR')} {currency}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 500 }}>
                                                        à {timeStr}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: statusColor, background: statusBg, padding: '4px 8px', borderRadius: '9999px', minWidth: '70px', textAlign: 'center' }}>
                                                    {statusText}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <AIAssistant currency={currency} organizationId={profile.organization_id!} />
                </>
            )}

            {/* ── Vendeur ── */}
            {roleSlug === 'vendeur' && (
                <>
                    <div className="metrics-carousel" style={{ display: 'flex', gap: '16px', marginBottom: '28px', overflowX: 'auto', paddingBottom: '12px', scrollSnapType: 'x mandatory' }}>
                        <StatCard title={`Commandes (${periodLabel})`} value={orders.length} icon={ShoppingBag} iconColor="var(--color-rose-dark)" accent="#E8B4A0" style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
                        <StatCard title="En attente" value={pendingCount} icon={Clock} iconColor="#E6A817" accent="var(--color-badge-warning-bg)" style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <Link href="/commandes" prefetch={true} className="btn-secondary">
                            Voir toutes les commandes
                        </Link>
                    </div>

                    <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center' }}>Chargement de la vitrine...</div>}>
                        <VitrineSales organizationId={profile.organization_id!} currency={currency} />
                    </Suspense>
                </>
            )}

            {/* ── Pâtissier ── */}
            {roleSlug === 'patissier' && (
                <>
                    <div className="metrics-carousel" style={{ display: 'flex', gap: '16px', marginBottom: '28px', overflowX: 'auto', paddingBottom: '12px', scrollSnapType: 'x mandatory' }}>
                        <StatCard title="À produire" value={pendingCount} icon={ChefHat} iconColor="#9CB8A0" accent="var(--color-badge-success-bg)" subtitle="commandes à traiter" style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
                        <StatCard title="Alertes stock" value={alertCount} icon={AlertTriangle} iconColor={alertCount > 0 ? 'var(--color-error)' : 'var(--color-success)'} accent={alertCount > 0 ? 'var(--color-badge-danger-bg)' : 'var(--color-badge-success-bg)'} style={{ minWidth: '240px', flex: '0 0 auto', scrollSnapAlign: 'start' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <Link href="/inventaire" prefetch={true} className="btn-primary">
                            <ChefHat size={18} />
                            Déclarer une perte
                        </Link>
                    </div>

                    <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center' }}>Chargement du plan de production...</div>}>
                        <ProductionPlan organizationId={profile.organization_id!} startDate={startDate} />
                    </Suspense>
                </>
            )}

            <style>{`
                .metrics-carousel::-webkit-scrollbar {
                    display: none;
                }
                .metrics-carousel {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                .dashboard-kpis {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 16px;
                    margin-bottom: 24px;
                }
                .dashboard-row {
                    display: grid;
                    gap: 24px;
                    margin-bottom: 24px;
                }
                .dashboard-row-wide {
                    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
                }
                .dashboard-row-half {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                @media (max-width: 1100px) {
                    .dashboard-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                }
                @media (max-width: 900px) {
                    .dashboard-row-wide,
                    .dashboard-row-half { grid-template-columns: minmax(0, 1fr); }
                }
                @media (max-width: 480px) {
                    .dashboard-kpis { gap: 10px; }
                    .dashboard-kpis .card { padding: 16px !important; }
                    .dashboard-kpis h3 { font-size: 1.25rem !important; overflow-wrap: anywhere; }
                }
            `}</style>
        </div>
    )
}
```

Notes pour l'exécutant :
- `getDailyStats`, `SessionPill`, `VitrineSales`, `ProductionPlan` et les blocs vendeur et pâtissier sont inchangés.
- Le formulaire `<form method="GET">` des filtres est supprimé, remplacé par `DashboardPeriodFilter` (mêmes paramètres d'URL `period` et `client`).
- Le bandeau rouge d'alerte stock et la carte « Alertes stock » de la vue gérant sont supprimés (remplacés par la pastille du bandeau).
- La branche `else if (o.status === 'confirmed' || o.status === 'pending')` d'origine est retirée : elle redonnait les mêmes valeurs que l'initialisation.

- [ ] **Étape 2 : vérifier typage, lint et tests**

Commandes :
- `npx tsc --noEmit -p . 2>&1 | grep "dashboard/page"`, attendu : aucune ligne.
- `npx eslint "src/app/(pâtisserie)/dashboard/page.tsx"`, attendu : 0 erreur.
- `npm test`, attendu : tous les tests passent.

- [ ] **Étape 3 : commiter**

```bash
git add "src/app/(pâtisserie)/dashboard/page.tsx"
git commit -m "feat(dashboard): vue gérant avec bandeau, cartes fiables et graphes en direct"
```

---

### Tâche 7 : Croustik, icônes Lucide et hauteur réduite

**Fichiers :**
- Modifier : `src/components/dashboard/AIAssistant.tsx:4` (import), `:15-20` (`QUICK_QUESTIONS`), `:149` (hauteur), `:267-291` (rendu des suggestions)

- [ ] **Étape 1 : remplacer l'import Lucide (ligne 4)**

Avant :
```tsx
import { Send, Loader2, MoreVertical, Trash2 } from 'lucide-react'
```
Après :
```tsx
import { Send, Loader2, MoreVertical, Trash2, BarChart3, Trophy, TrendingUp, Wallet } from 'lucide-react'
```

- [ ] **Étape 2 : remplacer `QUICK_QUESTIONS` (lignes 15-20)**

Avant :
```tsx
const QUICK_QUESTIONS = [
    { label: '📊 Résumé du jour', text: 'Donne-moi un résumé des ventes d\'aujourd\'hui.' },
    { label: '🏆 Meilleurs produits', text: 'Quels sont mes produits les plus vendus cette semaine ?' },
    { label: '📈 Prévision demain', text: 'Quelle prévision de chiffre d\'affaires pour demain ?' },
    { label: '💰 Chiffre du mois', text: 'Quel est mon chiffre d\'affaires ce mois-ci ?' },
]
```
Après :
```tsx
const QUICK_QUESTIONS = [
    { label: 'Résumé du jour', icon: BarChart3, text: 'Donne-moi un résumé des ventes d\'aujourd\'hui.' },
    { label: 'Meilleurs produits', icon: Trophy, text: 'Quels sont mes produits les plus vendus cette semaine ?' },
    { label: 'Prévision demain', icon: TrendingUp, text: 'Quelle prévision de chiffre d\'affaires pour demain ?' },
    { label: 'Chiffre du mois', icon: Wallet, text: 'Quel est mon chiffre d\'affaires ce mois-ci ?' },
]
```

- [ ] **Étape 3 : réduire la hauteur de la carte (ligne 149)**

Dans le `style` de la `div` `className="card shadow-2xl ..."`, remplacer `height: '500px'` par `height: '440px'`.

- [ ] **Étape 4 : afficher l'icône dans chaque suggestion**

Dans le `style` du `<button>` des suggestions, ajouter `display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px',` après `whiteSpace: 'nowrap',`. Puis remplacer le contenu `{qq.label}` par :

```tsx
                            <qq.icon size={14} aria-hidden="true" />
                            {qq.label}
```

- [ ] **Étape 5 : vérifier typage et lint**

Commandes :
- `npx tsc --noEmit -p . 2>&1 | grep AIAssistant`, attendu : aucune ligne.
- `npx eslint src/components/dashboard/AIAssistant.tsx`, attendu : 0 erreur.

- [ ] **Étape 6 : commiter**

```bash
git add src/components/dashboard/AIAssistant.tsx
git commit -m "feat(dashboard): icônes Lucide dans les suggestions de Croustik"
```

---

### Tâche 8 : vérification dans le navigateur et contrôle de cohérence du CA

**Fichiers :** aucun (sauf correctifs issus des constats).

- [ ] **Étape 1 : contrôles automatiques**

Commandes : `npm run typecheck`, `npm run lint`, `npm test`.
Attendu : aucune nouvelle erreur par rapport à la branche avant le chantier ; tous les tests passent. Séparer les erreurs préexistantes (signalées comme telles) des nouvelles.

- [ ] **Étape 2 : desktop 1280×800, organisation « test 2 »**

Avec le serveur de dev déjà lancé (`http://localhost:3000/dashboard`), vérifier :
- en-tête sans emoji, « En direct · mis à jour à HH:MM » visible ;
- bandeau « À faire maintenant » (ou « Rien d'urgent pour le moment ») ;
- 4 cartes sur une ligne, sans badge de tendance factice ;
- courbe, anneau, barres horaires, top produits affichés ou avec leur état vide ;
- console navigateur sans erreur.

- [ ] **Étape 3 : contrôle de cohérence du CA (point d'arrêt)**

En période « Aujourd'hui » sans filtre client, comparer la valeur de la carte CA (RPC `get_daily_metrics`) avec le montant affiché au dernier point de la courbe.
- Égaux : continuer.
- Différents : **s'arrêter**, noter les deux montants et l'explication probable (remboursements, acomptes, `is_historical`), et demander à l'utilisateur quelle source commune adopter avant tout changement de la carte.

- [ ] **Étape 4 : mobile 375×812**

Vérifier : premier chiffre (carte CA) visible sans défiler, cartes en 2×2 sans débordement, graphes empilés, panneau « Période » utilisable (sélecteur et champ client).

- [ ] **Étape 5 : temps réel**

Dans un second onglet, encaisser une vente test en caisse sur « test 2 » (organisation de test), puis revenir au tableau de bord sans recharger : la courbe, les barres horaires, le top produits, l'anneau et l'heure « mis à jour à » doivent avoir changé. Aucune ligne « cash » séparée d'« Espèces ».

- [ ] **Étape 6 : remettre la fenêtre du navigateur en taille par défaut et commiter les éventuels correctifs**

```bash
git status --short
git add <uniquement les fichiers corrigés de ce chantier>
git commit -m "fix(dashboard): corrections issues de la vérification navigateur"
```

---

## Couverture de la spec

| Section de la spec | Tâche |
|---|---|
| 3.1 En-tête, indicateur en direct, filtre repliable | 5, 6 |
| 3.2 Bandeau « À faire maintenant » | 5, 6 |
| 3.3 Quatre cartes (CA vs hier, encaissements, retraits, pertes en FCFA) | 1, 2, 6 |
| 3.4–3.5 Graphes et disposition | 3, 4, 6 |
| 3.6 Retraits & Livraisons, état vide compact | 6 |
| 3.7 Croustik | 7 |
| 4.x Graphes (accessibilité, états vides, périodes) | 3, 4 |
| 5.1 Requêtes | 2 |
| 5.2 Fuseau horaire | 1 (`utcDayKey`, `getUTCHours`) |
| 5.3 Cohérence du CA | 8, étape 3 |
| 5.4 Temps réel | 8, étape 5 |
| 6 Erreurs et cas limites | 2 (`errors`), 3, 4, 6 (`chartsNote`) |
| 7 Vérification | 8 |
