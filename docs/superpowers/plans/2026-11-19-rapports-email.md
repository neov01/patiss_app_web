# Rapports par e-mail (clôture enrichie + récap mensuel) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer l'e-mail de clôture par le nouveau template validé (comparaisons J-1 / J-7, graphiques en HTML pur) et ajouter un récap mensuel envoyé automatiquement le 1er du mois.

**Architecture :** un dossier `src/lib/reports/` regroupe des fonctions pures (calculs, règles « En bref »), des chargeurs de données Supabase (lecture paginée, filtrée par organisation), et deux gabarits React rendus en HTML par `@react-email/render`. La clôture (`closeSingleSession`) garde ses étapes 1 à 4 ; seule l'étape 5 (e-mail) est remplacée. Une nouvelle route `GET /api/cron/monthly-report`, planifiée dans `vercel.json`, envoie le récap avec une clé d'idempotence Resend.

**Tech Stack :** Next.js 16.2.9 (App Router), React 19.2.3, TypeScript, Supabase JS (client service-role), Resend 6.x, `@react-email/render` 2.3.1, Vitest 4.

**Spec :** `docs/superpowers/specs/2026-11-19-rapports-email-design.md`
**Maquettes validées :** `docs/superpowers/mockups/email-quotidien.html`, `docs/superpowers/mockups/email-mensuel.html`

## Global Constraints

- Tout le texte visible (e-mails, messages d'erreur renvoyés, commits) est en français.
- E-mails : uniquement des tableaux et des styles en ligne. Aucune image, aucun SVG, aucun JavaScript, ni flexbox ni grid.
- Palette (DESIGN.md) : terracotta `#815431`, terracotta clair `#C08A63`, sauge `#4B6450`, sauge pâle `#CDEAD0`, teal `#2F6671`, teal doux `#699EAA`, fond `#EDE6DC`, puits `#F5EEE4`, encre `#1A1C1A`, encre atténuée `#51443C`, bordure `#D5C3B8`, danger `#BA1A1A`, danger pâle `#FFDAD6`, attente `#FEF3C7`.
- Polices : `Manrope, Inter` pour les titres, `Inter` pour le texte, repli `'Helvetica Neue', Arial, sans-serif`.
- Les journées sont découpées en UTC (heure de la Côte d'Ivoire), comme sur le Dashboard.
- Chaque requête Supabase filtre sur `organization_id` : le client service-role contourne le RLS.
- Toute lecture de transactions, d'articles, de commandes ou de dépenses portant sur une période passe par `fetchAllRows` (PostgREST plafonne à 1 000 lignes par réponse).
- Les journaux ne contiennent ni adresse e-mail, ni nom de client, ni montant : uniquement l'identifiant d'organisation et un libellé d'erreur.
- E-mail quotidien : transactions `is_historical = false`. Récap mensuel : historiques comprises, part historique affichée à part.
- Une erreur dans un bloc optionnel ne doit jamais empêcher la clôture ni l'envoi.
- Expéditeur inchangé : `Pâtiss'App <onboarding@resend.dev>`.
- Une seule dépendance ajoutée : `@react-email/render@2.3.1` (`@react-email/components` est déprécié, et le paquet `react-email` embarque une CLI lourde).
- Toute modification du calcul de l'argent à la clôture est livrée dans un commit séparé.
- Commandes de vérification : `npm run test`, `npm run lint`, `npm run build`.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/test/supabase-fake.ts` | Faux client Supabase pour les tests : enregistre chaque appel chaîné, renvoie une réponse choisie par table |
| `src/lib/reports/fetch-all-rows.ts` | Lecture paginée générique (`range`) |
| `src/lib/reports/types.ts` | Types `DailyReportData`, `MonthlyReportData` et types partagés |
| `src/lib/reports/report-math.ts` | Calculs purs : variation %, plus fort reste, bornes de mois, totaux par jour, moyennes par jour de semaine, classement produits |
| `src/lib/reports/report-insights.ts` | Règles du bloc « En bref », noms de mois |
| `src/lib/reports/constants.ts` | Expéditeur, URL publique de l'app |
| `src/lib/reports/report-recipient.ts` | Destinataire des rapports (gérant en production, `REPORT_DEV_EMAIL` sinon) |
| `src/lib/reports/daily-report-data.ts` | Chargement des données du rapport quotidien |
| `src/lib/reports/monthly-report-data.ts` | Chargement des données du récap mensuel |
| `src/lib/reports/send-monthly-report.ts` | Chargement + rendu + envoi du récap pour une organisation |
| `src/lib/reports/emails/format.ts` | Formats français (montants, %, dates, heures) |
| `src/lib/reports/emails/components.tsx` | Briques visuelles des e-mails |
| `src/lib/reports/emails/DailyReportEmail.tsx` | Gabarit quotidien |
| `src/lib/reports/emails/MonthlyReportEmail.tsx` | Gabarit mensuel |
| `src/lib/reports/emails/render.tsx` | Rendu HTML des deux gabarits |
| `src/lib/reports/emails/fixtures.ts` | Données fictives des maquettes (tests et aperçus) |
| `src/app/api/cron/monthly-report/route.ts` | Route du cron mensuel |
| `scripts/render-report-previews.tsx` | Génère les aperçus HTML à partir des fixtures |
| Modifiés : `src/lib/actions/session-utils.ts`, `vercel.json`, `src/app/api/cron/close-session/route.ts` (si D2 confirmé), `.env.example` | |
| Supprimés : `src/app/api/cron/daily-report/route.ts`, `supabase/functions/daily-report/` | |

---

### Task 0 : Espace de travail isolé

La branche courante `design/atelier-gourmand` contient des travaux non commités sans rapport. On travaille dans un worktree créé depuis `main`.

**Files :**
- Create : `docs/superpowers/specs/2026-11-19-rapports-email-design.md`, `docs/superpowers/plans/2026-11-19-rapports-email.md`, `docs/superpowers/mockups/email-quotidien.html`, `docs/superpowers/mockups/email-mensuel.html` (copiés depuis le dossier d'origine)
- Modify : `package.json`, `package-lock.json`

- [ ] **Step 1 : Créer le worktree** (suivre superpowers:using-git-worktrees)

```bash
cd "/Users/willmac/patiss-app copie 2"
git fetch origin
git worktree add "../patiss-app-rapports" -b feat/rapports-email origin/main
```

- [ ] **Step 2 : Copier la spec, le plan, les maquettes et l'environnement local**

```bash
SRC="/Users/willmac/patiss-app copie 2"
DST="/Users/willmac/patiss-app-rapports"
mkdir -p "$DST/docs/superpowers/specs" "$DST/docs/superpowers/plans" "$DST/docs/superpowers/mockups"
cp "$SRC/docs/superpowers/specs/2026-11-19-rapports-email-design.md" "$DST/docs/superpowers/specs/"
cp "$SRC/docs/superpowers/plans/2026-11-19-rapports-email.md" "$DST/docs/superpowers/plans/"
cp "$SRC/docs/superpowers/mockups/"*.html "$DST/docs/superpowers/mockups/"
cp "$SRC/.env.local" "$DST/.env.local" 2>/dev/null || true
```

- [ ] **Step 3 : Installer les dépendances et ajouter le moteur de rendu**

```bash
cd "/Users/willmac/patiss-app-rapports"
npm ci
npm install @react-email/render@2.3.1
```

Expected : `package.json` contient `"@react-email/render": "^2.3.1"` dans `dependencies`.

- [ ] **Step 4 : Vérifier que la base est saine**

Run : `npm run test`
Expected : tous les tests existants passent.

- [ ] **Step 5 : Commit**

```bash
git add docs/superpowers package.json package-lock.json
git commit -m "docs(rapports): spec, plan et maquettes des e-mails de rapport

Ajoute aussi la dépendance @react-email/render pour le rendu HTML."
```

---

### Task 1 : Faux client Supabase et lecture paginée

**Files :**
- Create : `src/test/supabase-fake.ts`
- Create : `src/test/supabase-fake.test.ts`
- Create : `src/lib/reports/fetch-all-rows.ts`
- Test : `src/lib/reports/fetch-all-rows.test.ts`

**Interfaces :**
- Produces :
  - `createSupabaseFake(handlers?: Record<string, FakeHandler>, options?: { userEmail?: string | null }): { client: FakeClient; calls: FakeCall[] }`
  - `type FakeCall = { table: string; ops: Array<[string, unknown[]]> }`
  - `type FakeResult = { data: unknown; error: { message: string } | null; count?: number | null }`
  - `type FakeHandler = (call: FakeCall) => FakeResult`
  - `hasOp(call: FakeCall, op: string, args: unknown[]): boolean`
  - `callsTo(calls: FakeCall[], table: string): FakeCall[]`
  - `opArg(call: FakeCall, op: string, column: string): unknown` (2ᵉ argument du premier appel `op(column, valeur)`)
  - `isSingle(call: FakeCall): boolean`
  - `fetchAllRows<T>(makeQuery: (from: number, to: number) => PromiseLike<PageResult<T>>, pageSize?: number, maxPages?: number): Promise<T[]>`
  - `type PageResult<T> = { data: T[] | null; error: { message: string } | null }`

- [ ] **Step 1 : Écrire le faux client**

```ts
// src/test/supabase-fake.ts
export type FakeCall = { table: string; ops: Array<[string, unknown[]]> }
export type FakeResult = { data: unknown; error: { message: string } | null; count?: number | null }
export type FakeHandler = (call: FakeCall) => FakeResult

const EMPTY: FakeResult = { data: [], error: null }

/**
 * Faux client Supabase : chaque `from(table)` enregistre les méthodes chaînées
 * (select, eq, gte, range…) puis, au moment du `await`, renvoie la réponse
 * produite par le handler de la table (par défaut : aucune ligne).
 */
export function createSupabaseFake(
  handlers: Record<string, FakeHandler> = {},
  options: { userEmail?: string | null } = {}
) {
  const calls: FakeCall[] = []

  const from = (table: string) => {
    const call: FakeCall = { table, ops: [] }
    calls.push(call)
    const builder: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (onFulfilled: (value: FakeResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
              Promise.resolve()
                .then(() => (handlers[table] ?? (() => EMPTY))(call))
                .then(onFulfilled, onRejected)
          }
          if (typeof prop !== 'string') return undefined
          return (...args: unknown[]) => {
            call.ops.push([prop, args])
            return builder
          }
        },
      }
    )
    return builder
  }

  const userEmail = options.userEmail === undefined ? 'gerant@test.local' : options.userEmail
  const client = {
    from,
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: userEmail ? { email: userEmail } : null }, error: null }),
      },
    },
  }
  return { client, calls }
}

export function hasOp(call: FakeCall, op: string, args: unknown[]): boolean {
  return call.ops.some(([name, values]) => name === op && args.every((value, i) => Object.is(values[i], value)))
}

export function callsTo(calls: FakeCall[], table: string): FakeCall[] {
  return calls.filter(call => call.table === table)
}

export function opArg(call: FakeCall, op: string, column: string): unknown {
  return call.ops.find(([name, values]) => name === op && values[0] === column)?.[1][1]
}

export function isSingle(call: FakeCall): boolean {
  return call.ops.some(([name]) => name === 'single' || name === 'maybeSingle')
}
```

- [ ] **Step 2 : Écrire les tests du faux client**

```ts
// src/test/supabase-fake.test.ts
import { describe, expect, it } from 'vitest'
import { callsTo, createSupabaseFake, hasOp, isSingle, opArg } from './supabase-fake'

type Chain = { [method: string]: (...args: unknown[]) => Chain } & PromiseLike<{ data: unknown }>

describe('createSupabaseFake', () => {
  it('enregistre les appels chaînés et renvoie la réponse du handler', async () => {
    const fake = createSupabaseFake({ orders: () => ({ data: [{ id: 'o1' }], error: null }) })
    const db = fake.client as unknown as { from: (table: string) => Chain }
    const result = await db.from('orders').select('id').eq('organization_id', 'org-1')
    expect(result.data).toEqual([{ id: 'o1' }])
    const [call] = callsTo(fake.calls, 'orders')
    expect(hasOp(call, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(opArg(call, 'eq', 'organization_id')).toBe('org-1')
    expect(isSingle(call)).toBe(false)
  })

  it('renvoie aucune ligne par défaut', async () => {
    const fake = createSupabaseFake()
    const db = fake.client as unknown as { from: (table: string) => Chain }
    const result = await db.from('x')
    expect(result.data).toEqual([])
  })
})
```

- [ ] **Step 3 : Lancer les tests du faux client**

Run : `npx vitest run src/test/supabase-fake.test.ts`
Expected : PASS (2 tests).

- [ ] **Step 4 : Écrire les tests de `fetchAllRows` (en échec)**

```ts
// src/lib/reports/fetch-all-rows.test.ts
import { describe, expect, it } from 'vitest'
import { fetchAllRows } from './fetch-all-rows'

describe('fetchAllRows', () => {
  it("enchaîne les pages jusqu'à une page incomplète", async () => {
    const ranges: Array<[number, number]> = []
    const rows = await fetchAllRows<number>(async (from, to) => {
      ranges.push([from, to])
      const size = from === 0 ? 2 : 1
      return { data: Array.from({ length: size }, (_, i) => from + i), error: null }
    }, 2)
    expect(rows).toEqual([0, 1, 2])
    expect(ranges).toEqual([[0, 1], [2, 3]])
  })

  it("s'arrête sur une page vide après une page pleine", async () => {
    const rows = await fetchAllRows<number>(async from => ({ data: from === 0 ? [1, 2] : [], error: null }), 2)
    expect(rows).toEqual([1, 2])
  })

  it('traite une réponse sans données comme une page vide', async () => {
    const rows = await fetchAllRows<number>(async () => ({ data: null, error: null }))
    expect(rows).toEqual([])
  })

  it('propage une erreur Supabase', async () => {
    await expect(fetchAllRows(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom')
  })

  it('lève une erreur si la limite de pages est atteinte', async () => {
    await expect(fetchAllRows<number>(async () => ({ data: [1, 2], error: null }), 2, 3)).rejects.toThrow('limite de pages')
  })
})
```

- [ ] **Step 5 : Lancer les tests pour vérifier l'échec**

Run : `npx vitest run src/lib/reports/fetch-all-rows.test.ts`
Expected : FAIL, module `./fetch-all-rows` introuvable.

- [ ] **Step 6 : Implémenter `fetchAllRows`**

```ts
// src/lib/reports/fetch-all-rows.ts
export type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Lit toutes les lignes d'une requête PostgREST page par page.
 * PostgREST plafonne chaque réponse (1 000 lignes par défaut) : sans pagination,
 * un total mensuel serait tronqué sans erreur.
 * La requête doit avoir un ordre stable (ex. .order('created_at').order('id')).
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
  maxPages = 100
): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize
    const { data, error } = await makeQuery(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < pageSize) return rows
  }
  throw new Error('fetchAllRows : limite de pages atteinte')
}
```

- [ ] **Step 7 : Lancer les tests**

Run : `npx vitest run src/lib/reports/fetch-all-rows.test.ts src/test/supabase-fake.test.ts`
Expected : PASS (7 tests).

- [ ] **Step 8 : Commit**

```bash
git add src/test src/lib/reports/fetch-all-rows.ts src/lib/reports/fetch-all-rows.test.ts
git commit -m "test(rapports): faux client Supabase et lecture paginée fetchAllRows"
```

---

### Task 2 : Clôture : exclure les transactions historiques et futures (D1, zone argent)

Commit séparé, comme exigé par la spec (§ 9, D1).

**Files :**
- Modify : `src/lib/actions/session-utils.ts` (étape 2, lectures `transactions` et `orders`, actuellement lignes 88-103)
- Test : `src/lib/actions/session-utils.test.ts`

**Interfaces :**
- Consumes : `createSupabaseFake`, `callsTo`, `hasOp` (Task 1)
- Produces : aucun changement de signature ; `closeSingleSession` lit désormais `transactions` avec `.eq('is_historical', false)` et `.lte('created_at', <maintenant>)`, et `orders` avec `.eq('is_historical', false)`.

- [ ] **Step 1 : Écrire le test (en échec)**

```ts
// src/lib/actions/session-utils.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, createSupabaseFake, hasOp } from '@/test/supabase-fake'

const state = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => state.client }))

import { closeSingleSession, type SessionResult } from './session-utils'

const SESSION: SessionResult = {
  id: 'session-1',
  organization_id: 'org-1',
  opened_at: '2026-11-14T07:00:00.000Z',
  opened_by: null,
  organizations: { name: 'Pâtisserie Démo', currency_symbol: 'FCFA' },
}

describe('closeSingleSession : périmètre des encaissements (D1)', () => {
  let fake: ReturnType<typeof createSupabaseFake>

  beforeEach(() => {
    fake = createSupabaseFake()
    state.client = fake.client
  })

  it('exclut les transactions historiques et celles datées après la clôture', async () => {
    const result = await closeSingleSession('session-1', null, SESSION)
    expect(result.success).toBe(true)
    const [tx] = callsTo(fake.calls, 'transactions')
    expect(hasOp(tx, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(hasOp(tx, 'eq', ['is_historical', false])).toBe(true)
    expect(tx.ops.some(([op, args]) => op === 'lte' && args[0] === 'created_at')).toBe(true)
  })

  it('exclut les commandes historiques du calcul des soldes dus', async () => {
    await closeSingleSession('session-1', null, SESSION)
    const [orders] = callsTo(fake.calls, 'orders')
    expect(hasOp(orders, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(hasOp(orders, 'eq', ['is_historical', false])).toBe(true)
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

Run : `npx vitest run src/lib/actions/session-utils.test.ts`
Expected : FAIL sur les deux assertions `is_historical` (et sur `lte`).

- [ ] **Step 3 : Corriger l'étape 2 de `closeSingleSession`**

Remplacer le bloc qui commence par `// Récupération des transactions depuis l'ouverture de la session` et se termine par `.gte('created_at', sessionStart)` de la requête `orders` par :

```ts
    // Fin de la fenêtre de clôture : rien de daté après « maintenant » n'appartient à la session.
    const closingWindowEnd = new Date().toISOString()

    // Récupération des transactions depuis l'ouverture de la session.
    // Les imports historiques (commandes papier) ne sont pas passés par cette caisse.
    const { data: periodTransactions } = await supabaseAdmin
        .from('transactions')
        .select('amount, payment_method, payment_details, label_type')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .eq('is_historical', false)
        .gte('created_at', sessionStart)
        .lte('created_at', closingWindowEnd)

    // Récupération des commandes depuis l'ouverture de la session (hors imports historiques)
    const { data: periodOrders } = await supabaseAdmin
        .from('orders')
        .select('id, total_amount, deposit_amount, status')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .eq('is_historical', false)
        .gte('created_at', sessionStart)
```

- [ ] **Step 4 : Lancer les tests**

Run : `npx vitest run src/lib/actions/session-utils.test.ts`
Expected : PASS (2 tests).

- [ ] **Step 5 : Commit (séparé, zone argent)**

```bash
git add src/lib/actions/session-utils.ts src/lib/actions/session-utils.test.ts
git commit -m "fix(caisse): la clôture exclut les transactions historiques et futures

La colonne transactions.is_historical sert à exclure les imports papier des
clôtures, mais closeSingleSession ne la filtrait pas et n'avait pas de borne
haute : un solde importé daté dans le futur était compté dans la session.
En usage normal (imports datés dans le passé), le total ne change pas."
```

---

### Task 3 : Types partagés et calculs purs

**Files :**
- Create : `src/lib/reports/types.ts`
- Create : `src/lib/reports/report-math.ts`
- Test : `src/lib/reports/report-math.test.ts`

**Interfaces :**
- Consumes : `topProducts`, `utcDayKey`, `TransactionItemInput` (`src/lib/domain/dashboard-metrics.ts`) ; `PAYMENT_METHODS`, `PaymentBreakdown`, `CanonicalPaymentMethod` (`src/lib/domain/payments.ts`)
- Produces (types) : `PaymentShare`, `RankedProduct`, `DayTotal`, `DailyReportData`, `MonthlyReportData` (définitions exactes au Step 1)
- Produces (fonctions) :
  - `variationPct(current: number, reference: number | null | undefined): number | null`
  - `largestRemainderPercents(values: number[]): number[]`
  - `toPaymentShares(breakdown: PaymentBreakdown): PaymentShare[]`
  - `type MonthBounds = { key: string; start: string; end: string; daysInMonth: number }`
  - `monthBounds(monthKey: string): MonthBounds` (lève une erreur si le format n'est pas `AAAA-MM`)
  - `shiftMonth(monthKey: string, delta: number): string`
  - `previousMonthKey(now: Date): string`
  - `isoWeekdayIndex(date: Date): number` (0 = lundi … 6 = dimanche)
  - `sumAmounts(rows: { amount: number | null }[]): number`
  - `sumForUtcDay(rows: { amount: number | null; created_at: string | null }[], dayKey: string): number`
  - `dailyTotals(rows: { amount: number | null; created_at: string | null }[], monthKey: string): DayTotal[]`
  - `weekdayAverages(days: DayTotal[]): (number | null)[]`
  - `rankProducts(items: TransactionItemInput[]): RankedProduct[]` (tri par CA décroissant)

- [ ] **Step 1 : Écrire les types**

```ts
// src/lib/reports/types.ts
import type { CanonicalPaymentMethod } from '@/lib/domain/payments'

/** Part d'un mode de règlement ; `pct` est un entier, la somme des parts vaut 100. */
export type PaymentShare = { method: CanonicalPaymentMethod; amount: number; pct: number }

export type RankedProduct = { name: string; quantity: number; amount: number }

/** `weekday` : 0 = lundi … 6 = dimanche. */
export type DayTotal = { day: number; weekday: number; amount: number }

export type DailyReportData = {
  orgName: string
  currency: string
  /** Instant de la clôture. */
  reportDate: Date
  appUrl: string | null
  /** Total encaissé de la session (identique au metrics_snapshot). */
  totalRevenue: number
  /** null si les transactions des jours de comparaison n'ont pas pu être lues. */
  comparisons: { yesterday: number; lastWeek: number; lastWeekDate: Date } | null
  sales: { count: number; revenue: number; countYesterday: number; revenueYesterday: number } | null
  expenses: { total: number; count: number }
  /** 24 montants par heure UTC pour chaque jour. */
  hourly: { today: number[]; yesterday: number[] } | null
  payments: PaymentShare[]
  /** null = lecture en erreur ; [] = aucun article vendu. */
  topProducts: RankedProduct[] | null
  /** firstPickupAt est null si l'heure de retrait n'est pas renseignée (minuit). */
  tomorrow: { count: number; firstPickupAt: string | null; remaining: number } | null
  stockAlerts: { name: string; current: number; threshold: number; unit: string }[]
  pendingTotal: number
  breakdown: { ventesDirectes: number; acomptes: number; soldes: number }
  caisse: {
    openerName: string
    openerRole: string
    openedAt: string
    closerName: string
    closerRole: string
    closedAt: string
  }
  team: { name: string; role: string; orders: number; imports: number }[]
}

export type MonthlyReportData = {
  orgName: string
  currency: string
  appUrl: string | null
  /** 'AAAA-MM' */
  month: string
  revenue: number
  historicalRevenue: number
  revenuePrev: number
  revenueLastYear: number
  sales: { count: number; countPrev: number }
  orders: { count: number; countPrev: number }
  expenses: { total: number; totalPrev: number }
  days: DayTotal[]
  openDays: number
  /** 7 valeurs (lundi → dimanche), null si le jour n'a jamais été ouvert. */
  weekdayAverages: (number | null)[]
  payments: PaymentShare[]
  /** 10 produits maximum, classés par CA. */
  topProducts: RankedProduct[]
  /** 3 produits les moins vendus ; [] si moins de 13 produits distincts. */
  flopProducts: RankedProduct[]
  /** Nombre de produits vendus au moins une fois mais moins de 10 fois. */
  lowSellerCount: number
  customers: {
    newCount: number
    returningCount: number
    top: { name: string; orders: number; amount: number }[]
  }
  insights: string[]
}
```

- [ ] **Step 2 : Écrire les tests (en échec)**

```ts
// src/lib/reports/report-math.test.ts
import { describe, expect, it } from 'vitest'
import { emptyPaymentBreakdown } from '@/lib/domain/payments'
import {
  dailyTotals,
  isoWeekdayIndex,
  largestRemainderPercents,
  monthBounds,
  previousMonthKey,
  rankProducts,
  shiftMonth,
  sumAmounts,
  sumForUtcDay,
  toPaymentShares,
  variationPct,
  weekdayAverages,
} from './report-math'

describe('variationPct', () => {
  it('arrondit la variation à l’entier', () => {
    expect(variationPct(487_000, 312_000)).toBe(56)
    expect(variationPct(452_000, 487_000)).toBe(-7)
  })
  it('renvoie null sans référence', () => {
    expect(variationPct(100, 0)).toBeNull()
    expect(variationPct(100, null)).toBeNull()
    expect(variationPct(100, undefined)).toBeNull()
  })
})

describe('largestRemainderPercents', () => {
  it('donne une somme exacte de 100', () => {
    const pcts = largestRemainderPercents([1, 1, 1])
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100)
    expect(pcts).toEqual([34, 33, 33])
  })
  it('gère un seul mode et un total nul', () => {
    expect(largestRemainderPercents([500])).toEqual([100])
    expect(largestRemainderPercents([0, 0])).toEqual([0, 0])
  })
})

describe('toPaymentShares', () => {
  it('ne garde que les modes > 0, triés, avec des % entiers sommant à 100', () => {
    const breakdown = { ...emptyPaymentBreakdown(), 'Espèces': 214_000, Wave: 146_250, 'Moov Money': 9_750 }
    const shares = toPaymentShares(breakdown)
    expect(shares.map(s => s.method)).toEqual(['Espèces', 'Wave', 'Moov Money'])
    expect(shares.reduce((a, s) => a + s.pct, 0)).toBe(100)
  })
})

describe('bornes de mois', () => {
  it('calcule début, fin exclusive et nombre de jours', () => {
    expect(monthBounds('2026-10')).toEqual({
      key: '2026-10',
      start: '2026-10-01T00:00:00.000Z',
      end: '2026-11-01T00:00:00.000Z',
      daysInMonth: 31,
    })
    expect(monthBounds('2028-02').daysInMonth).toBe(29)
    expect(monthBounds('2026-02').daysInMonth).toBe(28)
  })
  it('refuse un format invalide', () => {
    expect(() => monthBounds('2026-13')).toThrow()
    expect(() => monthBounds('oct')).toThrow()
  })
  it('décale les mois en franchissant les années', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-10', -12)).toBe('2025-10')
  })
  it('donne le mois précédant une date', () => {
    expect(previousMonthKey(new Date('2026-11-01T06:00:00Z'))).toBe('2026-10')
    expect(previousMonthKey(new Date('2027-01-01T06:00:00Z'))).toBe('2026-12')
  })
})

describe('agrégats par jour', () => {
  const rows = [
    { amount: 500, created_at: '2026-10-03T09:00:00Z' },
    { amount: 250, created_at: '2026-10-03T18:00:00+00:00' },
    { amount: 100, created_at: '2026-10-05T10:00:00Z' },
    { amount: 999, created_at: '2026-11-01T00:00:00Z' },
    { amount: null, created_at: null },
  ]

  it('numérote les jours de la semaine à partir du lundi', () => {
    expect(isoWeekdayIndex(new Date('2026-10-05T00:00:00Z'))).toBe(0) // lundi
    expect(isoWeekdayIndex(new Date('2026-10-04T00:00:00Z'))).toBe(6) // dimanche
  })

  it('additionne les montants', () => {
    expect(sumAmounts(rows)).toBe(1849)
    expect(sumForUtcDay(rows, '2026-10-03')).toBe(750)
  })

  it('produit un total par jour du mois, hors autres mois', () => {
    const days = dailyTotals(rows, '2026-10')
    expect(days).toHaveLength(31)
    expect(days[0]).toEqual({ day: 1, weekday: 3, amount: 0 }) // 1er octobre 2026 = jeudi
    expect(days[2].amount).toBe(750)
    expect(days[4]).toEqual({ day: 5, weekday: 0, amount: 100 })
  })

  it('moyenne par jour de la semaine sur les seuls jours ouverts', () => {
    const days = dailyTotals(rows, '2026-10')
    const averages = weekdayAverages(days)
    expect(averages[5]).toBe(750) // samedi 3
    expect(averages[0]).toBe(100) // lundi 5
    expect(averages[1]).toBeNull()
  })
})

describe('rankProducts', () => {
  it('classe par CA décroissant en regroupant par nom', () => {
    const ranked = rankProducts([
      { name: 'Croissant', quantity: 86, unit_price: 500, subtotal: 43_000 },
      { name: 'Forêt-Noire', quantity: 7, unit_price: 15_000, subtotal: 105_000 },
      { name: 'Croissant', quantity: 4, unit_price: 500, subtotal: 2_000 },
    ])
    expect(ranked).toEqual([
      { name: 'Forêt-Noire', quantity: 7, amount: 105_000 },
      { name: 'Croissant', quantity: 90, amount: 45_000 },
    ])
  })
})
```

- [ ] **Step 3 : Lancer les tests pour vérifier l'échec**

Run : `npx vitest run src/lib/reports/report-math.test.ts`
Expected : FAIL, module `./report-math` introuvable.

- [ ] **Step 4 : Implémenter `report-math.ts`**

```ts
// src/lib/reports/report-math.ts
import { topProducts, utcDayKey, type TransactionItemInput } from '@/lib/domain/dashboard-metrics'
import { PAYMENT_METHODS, type PaymentBreakdown } from '@/lib/domain/payments'
import type { DayTotal, PaymentShare, RankedProduct } from './types'

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/

type Amount = { amount: number | null }
type DatedAmount = Amount & { created_at: string | null }

function toNumber(value: number | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Variation en % arrondie à l'entier ; null quand la référence est absente ou nulle. */
export function variationPct(current: number, reference: number | null | undefined): number | null {
  if (reference === null || reference === undefined || reference === 0) return null
  return Math.round(((current - reference) / reference) * 100)
}

/** Pourcentages entiers dont la somme fait exactement 100 (méthode du plus fort reste). */
export function largestRemainderPercents(values: number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0)
  if (total <= 0) return values.map(() => 0)
  const raw = values.map(v => (v / total) * 100)
  const result = raw.map(r => Math.floor(r))
  let remaining = 100 - result.reduce((sum, v) => sum + v, 0)
  const order = raw
    .map((r, i) => ({ i, fraction: r - result[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i)
  for (const { i } of order) {
    if (remaining <= 0) break
    result[i] += 1
    remaining -= 1
  }
  return result
}

export function toPaymentShares(breakdown: PaymentBreakdown): PaymentShare[] {
  const positive = PAYMENT_METHODS
    .map(method => ({ method, amount: toNumber(breakdown[method]) }))
    .filter(share => share.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const pcts = largestRemainderPercents(positive.map(share => share.amount))
  return positive.map((share, i) => ({ ...share, pct: pcts[i] }))
}

export type MonthBounds = { key: string; start: string; end: string; daysInMonth: number }

export function monthBounds(monthKey: string): MonthBounds {
  const match = MONTH_KEY.exec(monthKey)
  if (!match) throw new Error(`Mois invalide : ${monthKey} (format attendu AAAA-MM)`)
  const year = Number(match[1])
  const month = Number(match[2])
  return {
    key: monthKey,
    start: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, month, 1)).toISOString(),
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  }
}

export function shiftMonth(monthKey: string, delta: number): string {
  const start = new Date(monthBounds(monthKey).start)
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + delta, 1)).toISOString().slice(0, 7)
}

export function previousMonthKey(now: Date): string {
  return shiftMonth(now.toISOString().slice(0, 7), -1)
}

/** 0 = lundi … 6 = dimanche (jour UTC). */
export function isoWeekdayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7
}

export function sumAmounts(rows: Amount[]): number {
  return rows.reduce((sum, row) => sum + toNumber(row.amount), 0)
}

export function sumForUtcDay(rows: DatedAmount[], dayKey: string): number {
  return sumAmounts(rows.filter(row => row.created_at !== null && utcDayKey(new Date(row.created_at)) === dayKey))
}

export function dailyTotals(rows: DatedAmount[], monthKey: string): DayTotal[] {
  const { start, daysInMonth } = monthBounds(monthKey)
  const first = new Date(start)
  const days: DayTotal[] = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    weekday: isoWeekdayIndex(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1))),
    amount: 0,
  }))
  for (const row of rows) {
    if (!row.created_at) continue
    const date = new Date(row.created_at)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== monthKey) continue
    days[date.getUTCDate() - 1].amount += toNumber(row.amount)
  }
  return days
}

/** CA moyen par jour de la semaine, calculé sur les seuls jours ouverts (CA > 0). */
export function weekdayAverages(days: DayTotal[]): (number | null)[] {
  const sums = new Array<number>(7).fill(0)
  const counts = new Array<number>(7).fill(0)
  for (const day of days) {
    if (day.amount <= 0) continue
    sums[day.weekday] += day.amount
    counts[day.weekday] += 1
  }
  return sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : null))
}

export function rankProducts(items: TransactionItemInput[]): RankedProduct[] {
  return topProducts(items, Number.MAX_SAFE_INTEGER)
    .sort((a, b) => b.amount - a.amount || b.quantity - a.quantity)
}
```

- [ ] **Step 5 : Lancer les tests**

Run : `npx vitest run src/lib/reports/report-math.test.ts`
Expected : PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/reports/types.ts src/lib/reports/report-math.ts src/lib/reports/report-math.test.ts
git commit -m "feat(rapports): types et calculs purs des rapports"
```

---

### Task 4 : Règles du bloc « En bref »

**Files :**
- Create : `src/lib/reports/report-insights.ts`
- Test : `src/lib/reports/report-insights.test.ts`

**Interfaces :**
- Consumes : `variationPct`, `shiftMonth` (Task 3) ; `MonthlyReportData` (Task 3)
- Produces :
  - `type InsightInput = Omit<MonthlyReportData, 'insights'>`
  - `monthName(monthKey: string): string` → `'octobre'`
  - `monthLabel(monthKey: string): string` → `'octobre 2026'`
  - `buildMonthlyInsights(data: InsightInput): string[]` (4 phrases au maximum)

Règles, dans cet ordre (spec § 6.4, règle 2 formulée à partir du solde net réel) :
1. Tendance du CA si `revenuePrev > 0`. « porté par {n°1} » si la variation est ≥ 0 et que le n°1 pèse ≥ 15 % du CA ; « … et {n°2} » si le n°2 pèse aussi ≥ 15 %.
2. Solde net si `expenses.total > 0`, `expenses.totalPrev > 0` et solde net de M-1 > 0 : « Le solde net (CA − dépenses) progresse de +x % » ou « recule de −x % » par rapport au mois précédent.
3. Jour faible si au moins 5 jours de la semaine ont été ouverts et que l'écart du plus faible avec la moyenne est ≥ 25 %.
4. Produits peu vendus si `flopProducts` n'est pas vide et `lowSellerCount > 0`.

- [ ] **Step 1 : Écrire les tests (en échec)**

```ts
// src/lib/reports/report-insights.test.ts
import { describe, expect, it } from 'vitest'
import { buildMonthlyInsights, monthLabel, monthName, type InsightInput } from './report-insights'

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    orgName: 'Pâtisserie Démo',
    currency: 'FCFA',
    appUrl: null,
    month: '2026-10',
    revenue: 1_000_000,
    historicalRevenue: 0,
    revenuePrev: 800_000,
    revenueLastYear: 0,
    sales: { count: 100, countPrev: 90 },
    orders: { count: 10, countPrev: 8 },
    expenses: { total: 0, totalPrev: 0 },
    days: [],
    openDays: 20,
    weekdayAverages: [null, null, null, null, null, null, null],
    payments: [],
    topProducts: [],
    flopProducts: [],
    lowSellerCount: 0,
    customers: { newCount: 0, returningCount: 0, top: [] },
    ...overrides,
  }
}

describe('noms de mois', () => {
  it('donne le nom et le libellé en français', () => {
    expect(monthName('2026-10')).toBe('octobre')
    expect(monthLabel('2026-02')).toBe('février 2026')
  })
})

describe('buildMonthlyInsights', () => {
  it('annonce la progression du CA et les produits qui la portent', () => {
    const [first] = buildMonthlyInsights(input({
      topProducts: [
        { name: 'Forêt-Noire', quantity: 142, amount: 200_000 },
        { name: 'Fraisier', quantity: 96, amount: 160_000 },
        { name: 'Croissant', quantity: 900, amount: 90_000 },
      ],
    }))
    expect(first).toBe('Le CA progresse de +25 % par rapport à septembre, porté par Forêt-Noire et Fraisier.')
  })

  it('annonce un recul sans citer de produit', () => {
    const [first] = buildMonthlyInsights(input({ revenue: 600_000 }))
    expect(first).toBe('Le CA recule de −25 % par rapport à septembre.')
  })

  it("n'écrit rien sur le CA sans mois de référence", () => {
    expect(buildMonthlyInsights(input({ revenuePrev: 0 }))).toEqual([])
  })

  it('commente le solde net quand les dépenses des deux mois sont connues', () => {
    const insights = buildMonthlyInsights(input({ expenses: { total: 200_000, totalPrev: 200_000 } }))
    // net : 800 000 contre 600 000 → +33 %
    expect(insights).toContain('Le solde net (CA − dépenses) progresse de +33 % par rapport à septembre.')
  })

  it('signale le jour le plus calme si l’écart dépasse 25 %', () => {
    const insights = buildMonthlyInsights(input({ weekdayAverages: [100, 300, 300, 300, 300, 500, null] }))
    // moyenne 300, lundi à 100 → 67 % de moins
    expect(insights).toContain('Les lundis restent les plus calmes (67 % de moins que la moyenne).')
  })

  it("ne signale pas de jour calme avec moins de 5 jours ouverts", () => {
    const insights = buildMonthlyInsights(input({ weekdayAverages: [100, 300, 300, null, null, 500, null] }))
    expect(insights.some(s => s.includes('plus calmes'))).toBe(false)
  })

  it('signale les produits peu vendus, au singulier comme au pluriel', () => {
    const flop = [{ name: 'Opéra', quantity: 1, amount: 1_500 }]
    expect(buildMonthlyInsights(input({ flopProducts: flop, lowSellerCount: 3 })))
      .toContain('3 produits se vendent à moins de 10 exemplaires par mois : à revoir.')
    expect(buildMonthlyInsights(input({ flopProducts: flop, lowSellerCount: 1 })))
      .toContain('1 produit se vend à moins de 10 exemplaires par mois : à revoir.')
  })

  it('renvoie au plus 4 phrases dans l’ordre des règles', () => {
    const insights = buildMonthlyInsights(input({
      expenses: { total: 200_000, totalPrev: 200_000 },
      weekdayAverages: [100, 300, 300, 300, 300, 500, null],
      flopProducts: [{ name: 'Opéra', quantity: 1, amount: 1_500 }],
      lowSellerCount: 2,
    }))
    expect(insights).toHaveLength(4)
    expect(insights[0]).toMatch(/^Le CA/)
    expect(insights[1]).toMatch(/^Le solde net/)
    expect(insights[2]).toMatch(/^Les lundis/)
    expect(insights[3]).toMatch(/^2 produits/)
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run : `npx vitest run src/lib/reports/report-insights.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 3 : Implémenter**

```ts
// src/lib/reports/report-insights.ts
import { shiftMonth, variationPct } from './report-math'
import type { MonthlyReportData } from './types'

export type InsightInput = Omit<MonthlyReportData, 'insights'>

const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
const WEEKDAY_PLURAL = ['lundis', 'mardis', 'mercredis', 'jeudis', 'vendredis', 'samedis', 'dimanches']

export function monthName(monthKey: string): string {
  return MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1]
}

export function monthLabel(monthKey: string): string {
  return `${monthName(monthKey)} ${monthKey.slice(0, 4)}`
}

function signed(pct: number): string {
  return pct >= 0 ? `+${pct} %` : `−${Math.abs(pct)} %`
}

/** Constats chiffrés du bloc « En bref » ; aucune suggestion inventée. */
export function buildMonthlyInsights(d: InsightInput): string[] {
  const insights: string[] = []
  const previousName = monthName(shiftMonth(d.month, -1))

  const revenueVar = variationPct(d.revenue, d.revenuePrev)
  if (revenueVar !== null) {
    if (revenueVar >= 0) {
      let sentence = `Le CA progresse de ${signed(revenueVar)} par rapport à ${previousName}`
      const [first, second] = d.topProducts
      if (first && first.amount >= 0.15 * d.revenue) {
        sentence += `, porté par ${first.name}`
        if (second && second.amount >= 0.15 * d.revenue) sentence += ` et ${second.name}`
      }
      insights.push(`${sentence}.`)
    } else {
      insights.push(`Le CA recule de ${signed(revenueVar)} par rapport à ${previousName}.`)
    }
  }

  if (d.expenses.total > 0 && d.expenses.totalPrev > 0) {
    const netVar = variationPct(d.revenue - d.expenses.total, d.revenuePrev - d.expenses.totalPrev)
    if (netVar !== null && d.revenuePrev - d.expenses.totalPrev > 0) {
      const verb = netVar >= 0 ? 'progresse' : 'recule'
      insights.push(`Le solde net (CA − dépenses) ${verb} de ${signed(netVar)} par rapport à ${previousName}.`)
    }
  }

  const open = d.weekdayAverages
    .map((avg, i) => ({ avg, i }))
    .filter((entry): entry is { avg: number; i: number } => entry.avg !== null)
  if (open.length >= 5) {
    const mean = open.reduce((sum, entry) => sum + entry.avg, 0) / open.length
    const weakest = open.reduce((min, entry) => (entry.avg < min.avg ? entry : min))
    const gap = mean > 0 ? (mean - weakest.avg) / mean : 0
    if (gap >= 0.25) {
      insights.push(`Les ${WEEKDAY_PLURAL[weakest.i]} restent les plus calmes (${Math.round(gap * 100)} % de moins que la moyenne).`)
    }
  }

  if (d.flopProducts.length > 0 && d.lowSellerCount > 0) {
    insights.push(d.lowSellerCount === 1
      ? '1 produit se vend à moins de 10 exemplaires par mois : à revoir.'
      : `${d.lowSellerCount} produits se vendent à moins de 10 exemplaires par mois : à revoir.`)
  }

  return insights.slice(0, 4)
}
```

- [ ] **Step 4 : Lancer les tests**

Run : `npx vitest run src/lib/reports/report-insights.test.ts`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/reports/report-insights.ts src/lib/reports/report-insights.test.ts
git commit -m "feat(rapports): règles du bloc « En bref » du récap mensuel"
```

---

### Task 5 : Formats, briques visuelles et gabarit quotidien

**Files :**
- Create : `src/lib/reports/emails/format.ts`
- Create : `src/lib/reports/emails/components.tsx`
- Create : `src/lib/reports/emails/DailyReportEmail.tsx`
- Create : `src/lib/reports/emails/render.tsx`
- Create : `src/lib/reports/emails/fixtures.ts` (partie quotidienne)
- Test : `src/lib/reports/emails/format.test.ts`, `src/lib/reports/emails/DailyReportEmail.test.tsx`

**Interfaces :**
- Consumes : `variationPct` (Task 3), `DailyReportData`, `PaymentShare`, `RankedProduct`, `DayTotal` (Task 3)
- Produces :
  - `formatNumber(v: number): string`, `formatMoney(v: number, currency: string): string`, `formatQty(v: number): string`, `formatSignedPct(p: number): string`, `capitalize(s: string): string`, `formatLongDate(d: Date): string`, `formatShortDate(d: Date): string`, `formatTime(iso: string): string`, `formatWeekday(d: Date): string`
  - Composants : `C`, `EmailShell`, `Section`, `Hero`, `DeltaPill`, `KpiTiles` (`type Kpi`), `Legend`, `StackedBar`, `PairedHourBars`, `DayBars`, `WeekdayBars`, `RankedList`, `Callout`, `InfoBox`, `DetailRows`, `Strong`, `Spacer`, `Eyebrow`
  - `DailyReportEmail({ data }: { data: DailyReportData })`, `dailyPreheader(d: DailyReportData): string`, `dailySubject(d: DailyReportData): string`
  - `renderDailyReportEmail(data: DailyReportData): Promise<string>`
  - `dailyFixture: DailyReportData`

- [ ] **Step 1 : Écrire les tests de format (en échec)**

```ts
// src/lib/reports/emails/format.test.ts
import { describe, expect, it } from 'vitest'
import { capitalize, formatLongDate, formatMoney, formatNumber, formatQty, formatShortDate, formatSignedPct, formatTime, formatWeekday } from './format'

describe('formats français', () => {
  it('groupe les milliers avec une espace normale', () => {
    expect(formatNumber(487_000)).toBe('487 000')
    expect(formatNumber(10_506_000.4)).toBe('10 506 000')
    expect(formatMoney(487_000, 'FCFA')).toBe('487 000 FCFA')
  })
  it('formate les quantités décimales', () => {
    expect(formatQty(1.5)).toBe('1,5')
    expect(formatQty(2)).toBe('2')
  })
  it('signe les pourcentages', () => {
    expect(formatSignedPct(56)).toBe('+56 %')
    expect(formatSignedPct(-7)).toBe('−7 %')
    expect(formatSignedPct(0)).toBe('+0 %')
  })
  it('formate les dates et heures en UTC', () => {
    const d = new Date('2026-11-14T20:14:00Z')
    expect(formatLongDate(d)).toBe('Samedi 14 novembre 2026')
    expect(formatShortDate(new Date('2026-11-07T10:00:00Z'))).toBe('7 nov.')
    expect(formatTime('2026-11-14T07:02:00Z')).toBe('07h02')
    expect(formatWeekday(d)).toBe('samedi')
    expect(capitalize('octobre 2026')).toBe('Octobre 2026')
  })
})
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/reports/emails/format.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 3 : Implémenter `format.ts`**

```ts
// src/lib/reports/emails/format.ts
const DATE_LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const DATE_SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' })

// Une espace normale (et non l'espace fine insécable de Intl) : certaines polices
// grasses l'affichent mal dans les messageries. Les montants sont en white-space: nowrap.
function normalizeSpaces(value: string): string {
  return value.replace(/\s/g, ' ')
}

export function formatNumber(value: number): string {
  return normalizeSpaces(Math.round(value).toLocaleString('fr-FR'))
}

export function formatMoney(value: number, currency: string): string {
  return `${formatNumber(value)} ${currency}`
}

export function formatQty(value: number): string {
  return normalizeSpaces(value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }))
}

export function formatSignedPct(pct: number): string {
  return pct >= 0 ? `+${pct} %` : `−${Math.abs(pct)} %`
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function formatLongDate(date: Date): string {
  return capitalize(DATE_LONG.format(date))
}

export function formatShortDate(date: Date): string {
  return DATE_SHORT.format(date)
}

export function formatTime(iso: string): string {
  return TIME.format(new Date(iso)).replace(':', 'h')
}

export function formatWeekday(date: Date): string {
  return WEEKDAY.format(date)
}
```

- [ ] **Step 4 : Lancer les tests de format**

Run : `npx vitest run src/lib/reports/emails/format.test.ts`
Expected : PASS.

- [ ] **Step 5 : Écrire les briques visuelles**

```tsx
// src/lib/reports/emails/components.tsx
import type { CSSProperties, ReactNode } from 'react'
import type { CanonicalPaymentMethod } from '@/lib/domain/payments'
import { variationPct } from '../report-math'
import type { DayTotal, PaymentShare, RankedProduct } from '../types'
import { formatMoney, formatNumber, formatSignedPct } from './format'

export const C = {
  terra: '#815431',
  terraLight: '#C08A63',
  sage: '#4B6450',
  sageMist: '#CDEAD0',
  teal: '#2F6671',
  tealSoft: '#699EAA',
  canvas: '#EDE6DC',
  well: '#F5EEE4',
  ink: '#1A1C1A',
  muted: '#51443C',
  border: '#D5C3B8',
  danger: '#BA1A1A',
  dangerSoft: '#FFDAD6',
  pending: '#FEF3C7',
  pendingInk: '#7A4A12',
  headerSub: '#F1DCC8',
} as const

const FONT = "Inter,'Helvetica Neue',Arial,sans-serif"
const HFONT = "Manrope,Inter,'Helvetica Neue',Arial,sans-serif"

export const PAYMENT_COLORS: Record<CanonicalPaymentMethod, string> = {
  'Espèces': C.sage,
  Wave: C.tealSoft,
  'Orange Money': '#E07B39',
  'MTN MOMO': '#E2B33C',
  'Moov Money': C.teal,
}

export const PAYMENT_LABELS: Record<CanonicalPaymentMethod, string> = {
  'Espèces': 'Espèces',
  Wave: 'Wave',
  'Orange Money': 'Orange Money',
  'MTN MOMO': 'MTN MoMo',
  'Moov Money': 'Moov Money',
}

const labelStyle: CSSProperties = {
  margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color: C.muted, textTransform: 'uppercase',
}
const rowCell: CSSProperties = { padding: '6px 0', borderBottom: `1px solid ${C.well}` }

function Tbl({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={style}>
      <tbody>{children}</tbody>
    </table>
  )
}

function Swatch({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color }} />
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong style={{ color: C.ink }}>{children}</strong>
}

export function Spacer({ h }: { h: number }) {
  return <div style={{ height: h, lineHeight: `${h}px` }}>&nbsp;</div>
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p style={{ ...labelStyle, margin: '14px 0 6px', letterSpacing: 0.6 }}>{children}</p>
}

export function EmailShell({
  orgName, title, subtitle, preheader, currency, appUrl, children,
}: {
  orgName: string
  title: string
  subtitle: string
  preheader: string
  currency: string
  appUrl: string | null
  children: ReactNode
}) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{title}</title>
      </head>
      <body style={{ margin: 0, padding: 0, background: C.canvas, fontFamily: FONT, color: C.ink }}>
        <div style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>{preheader}</div>
        <Tbl style={{ background: C.canvas }}>
          <tr>
            <td style={{ padding: '24px 12px', textAlign: 'center' }}>
              <table width={600} cellPadding={0} cellSpacing={0} role="presentation"
                style={{ maxWidth: 600, width: '100%', margin: '0 auto', background: '#FFFFFF', borderRadius: 16, overflow: 'hidden', textAlign: 'left' }}>
                <tbody>
                  <tr>
                    <td style={{ background: C.terra, padding: '22px 28px' }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 1, color: C.headerSub, textTransform: 'uppercase' }}>{orgName}</p>
                      <h1 style={{ margin: '4px 0 0', fontFamily: HFONT, fontSize: 22, fontWeight: 800, color: '#FFFFFF' }}>{title}</h1>
                      <p style={{ margin: '4px 0 0', fontSize: 14, color: C.headerSub }}>{subtitle}</p>
                    </td>
                  </tr>
                  {children}
                  <tr>
                    <td style={{ padding: 28 }}>
                      <Tbl style={{ borderTop: `1px solid ${C.border}` }}>
                        <tr>
                          <td style={{ paddingTop: 14, fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>
                            Rapport généré automatiquement par <strong>{"Pâtiss'App"}</strong> · Montants en {currency}
                            {appUrl ? (
                              <>
                                <br />
                                <a href={appUrl} style={{ color: C.terra, fontWeight: 700 }}>Ouvrir le tableau de bord →</a>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      </Tbl>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </Tbl>
      </body>
    </html>
  )
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <tr>
      <td style={{ padding: '24px 28px 0' }}>
        <h2 style={{ margin: 0, fontFamily: HFONT, fontSize: 16, fontWeight: 800, color: C.ink }}>{title}</h2>
        {subtitle ? <p style={{ margin: '2px 0 0', fontSize: 12, color: C.muted }}>{subtitle}</p> : null}
        <Spacer h={12} />
        {children}
      </td>
    </tr>
  )
}

export function DeltaPill({ current, reference, label }: { current: number; reference: number | null | undefined; label: string }) {
  const pct = variationPct(current, reference)
  if (pct === null) return null
  const up = pct >= 0
  return (
    <span>
      <span style={{
        display: 'inline-block', background: up ? C.sageMist : C.dangerSoft, color: up ? C.sage : C.danger,
        fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      }}>
        {up ? '▲' : '▼'} {formatSignedPct(pct)}
      </span>
      <span style={{ fontSize: 12, color: C.muted }}> {label}</span>
    </span>
  )
}

export type HeroDelta = { current: number; reference: number | null; label: string }

export function Hero({ label, amount, deltas, note }: { label: string; amount: string; deltas: HeroDelta[]; note?: ReactNode }) {
  const visible = deltas.filter(d => variationPct(d.current, d.reference) !== null)
  return (
    <tr>
      <td style={{ padding: '24px 28px 0' }}>
        <p style={labelStyle}>{label}</p>
        <p style={{ margin: '4px 0 10px', fontFamily: HFONT, fontSize: 40, fontWeight: 800, color: C.terra, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{amount}</p>
        {visible.map(d => (
          <p key={d.label} style={{ margin: '0 0 6px' }}>
            <DeltaPill current={d.current} reference={d.reference} label={d.label} />
          </p>
        ))}
        {note ? <p style={{ margin: '6px 0 0', fontSize: 12, color: C.muted }}>{note}</p> : null}
      </td>
    </tr>
  )
}

export type Kpi = { label: string; value: string; extra?: ReactNode }

export function KpiTiles({ tiles }: { tiles: Kpi[] }) {
  const width = `${Math.floor(100 / tiles.length)}%`
  return (
    <Tbl>
      <tr>
        {tiles.map((tile, i) => (
          <td key={tile.label} width={width} style={{ paddingLeft: i === 0 ? 0 : 8, verticalAlign: 'top' }}>
            <Tbl style={{ background: C.well, borderRadius: 12 }}>
              <tr>
                <td style={{ padding: 14 }}>
                  <p style={{ ...labelStyle, fontSize: 11, letterSpacing: 0.6 }}>{tile.label}</p>
                  <p style={{ margin: '6px 0', fontFamily: HFONT, fontSize: 20, fontWeight: 800, color: C.ink, whiteSpace: 'nowrap' }}>{tile.value}</p>
                  {tile.extra ? <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: C.muted }}>{tile.extra}</p> : null}
                </td>
              </tr>
            </Tbl>
          </td>
        ))}
      </tr>
    </Tbl>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <p style={{ margin: '10px 0 0' }}>
      {items.map(item => (
        <span key={item.label} style={{ display: 'inline-block', marginRight: 14, fontSize: 12, color: C.muted }}>
          <Swatch color={item.color} />&nbsp;{item.label}
        </span>
      ))}
    </p>
  )
}

export function StackedBar({ shares, currency }: { shares: PaymentShare[]; currency: string }) {
  const total = shares.reduce((sum, share) => sum + share.amount, 0)
  return (
    <>
      <Tbl style={{ borderRadius: 6, overflow: 'hidden' }}>
        <tr>
          {shares.map(share => (
            <td key={share.method} width={`${((share.amount / total) * 100).toFixed(1)}%`}
              style={{ background: PAYMENT_COLORS[share.method], height: 18, fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
          ))}
        </tr>
      </Tbl>
      <Tbl style={{ marginTop: 10, fontSize: 13, color: C.muted }}>
        {shares.map(share => (
          <tr key={share.method}>
            <td style={rowCell}><Swatch color={PAYMENT_COLORS[share.method]} />&nbsp; {PAYMENT_LABELS[share.method]}</td>
            <td style={{ ...rowCell, textAlign: 'right', fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' }}>{formatMoney(share.amount, currency)}</td>
            <td style={{ ...rowCell, textAlign: 'right', width: 52 }}>{share.pct}&nbsp;%</td>
          </tr>
        ))}
      </Tbl>
    </>
  )
}

function VerticalBar({ value, max, maxHeight, color, width }: { value: number; max: number; maxHeight: number; color: string; width?: number }) {
  if (value <= 0) return null
  const height = Math.max(2, Math.round((value / max) * maxHeight))
  return (
    <table cellPadding={0} cellSpacing={0} role="presentation" width={width ? undefined : '100%'}>
      <tbody>
        <tr>
          <td style={{ width, height, background: color, fontSize: 0, lineHeight: 0, borderRadius: '2px 2px 0 0' }}>&nbsp;</td>
        </tr>
      </tbody>
    </table>
  )
}

export function PairedHourBars({
  today, yesterday, todayLabel, yesterdayLabel, currency,
}: { today: number[]; yesterday: number[]; todayLabel: string; yesterdayLabel: string; currency: string }) {
  const active = today.map((value, hour) => (value > 0 || yesterday[hour] > 0 ? hour : -1)).filter(hour => hour >= 0)
  const from = Math.min(...active)
  const to = Math.max(...active)
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const max = Math.max(1, ...hours.map(h => Math.max(today[h], yesterday[h])))
  const peak = hours.reduce((best, h) => (today[h] > today[best] ? h : best), hours[0])
  const H = 96
  return (
    <>
      <Tbl style={{ borderBottom: `1px solid ${C.border}` }}>
        <tr style={{ height: H }}>
          {hours.map(h => (
            <td key={h} style={{ padding: '0 2px', verticalAlign: 'bottom' }}>
              <table cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: '0 auto' }}>
                <tbody>
                  <tr>
                    <td style={{ verticalAlign: 'bottom' }}><VerticalBar value={yesterday[h]} max={max} maxHeight={H} color={C.border} width={9} /></td>
                    <td style={{ width: 2, fontSize: 0 }}>&nbsp;</td>
                    <td style={{ verticalAlign: 'bottom' }}><VerticalBar value={today[h]} max={max} maxHeight={H} color={C.terra} width={9} /></td>
                  </tr>
                </tbody>
              </table>
            </td>
          ))}
        </tr>
      </Tbl>
      <Tbl>
        <tr>
          {hours.map(h => (
            <td key={h} style={{ paddingTop: 4, fontSize: 10, color: C.muted, textAlign: 'center' }}>{h}h</td>
          ))}
        </tr>
      </Tbl>
      <Legend items={[{ label: todayLabel, color: C.terra }, { label: yesterdayLabel, color: C.border }]} />
      <p style={{ margin: '8px 0 0', fontSize: 13, color: C.muted }}>
        Heure de pointe : <Strong>{`${peak}h–${peak + 1}h`}</Strong> ({formatMoney(today[peak], currency)}).
      </p>
    </>
  )
}

export function DayBars({ days }: { days: DayTotal[] }) {
  const max = Math.max(1, ...days.map(d => d.amount))
  const best = days.reduce((top, d) => (d.amount > top.amount ? d : top), days[0])
  const labelled = new Set([1, 5, 10, 15, 20, 25, days.length])
  const H = 110
  return (
    <>
      <Tbl style={{ borderBottom: `1px solid ${C.border}`, tableLayout: 'fixed' }}>
        <tr style={{ height: H }}>
          {days.map(d => {
            const color = d.day === best.day && best.amount > 0 ? C.sage : d.weekday >= 5 ? C.terra : C.terraLight
            return (
              <td key={d.day} style={{ padding: '0 1px', verticalAlign: 'bottom' }}>
                <VerticalBar value={d.amount} max={max} maxHeight={H} color={color} />
              </td>
            )
          })}
        </tr>
      </Tbl>
      <Tbl style={{ tableLayout: 'fixed' }}>
        <tr>
          {days.map(d => (
            <td key={d.day} style={{ paddingTop: 4, fontSize: 10, color: C.muted, textAlign: 'center' }}>
              {labelled.has(d.day) ? d.day : ' '}
            </td>
          ))}
        </tr>
      </Tbl>
      <Legend items={[
        { label: 'Semaine', color: C.terraLight },
        { label: 'Week-end', color: C.terra },
        { label: 'Meilleur jour', color: C.sage },
      ]} />
    </>
  )
}

const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function HorizontalBar({ pct, color, height }: { pct: number; color: string; height: number }) {
  return (
    <Tbl>
      <tr>
        <td width={`${pct}%`} style={{ background: color, height, fontSize: 0, lineHeight: 0, borderRadius: 3 }}>&nbsp;</td>
        <td style={{ fontSize: 0 }}>&nbsp;</td>
      </tr>
    </Tbl>
  )
}

export function WeekdayBars({ averages, currency }: { averages: (number | null)[]; currency: string }) {
  const max = Math.max(1, ...averages.map(a => a ?? 0))
  return (
    <Tbl>
      {averages.map((avg, i) => (avg === null ? null : (
        <tr key={WEEKDAY_SHORT[i]}>
          <td style={{ width: 36, padding: '4px 0', fontSize: 12, color: C.muted, fontWeight: 700 }}>{WEEKDAY_SHORT[i]}</td>
          <td style={{ padding: '4px 0' }}>
            <HorizontalBar pct={Math.max(2, Math.round((avg / max) * 100))} color={i >= 5 ? C.terra : C.terraLight} height={16} />
          </td>
          <td style={{ width: 110, padding: '4px 0 4px 10px', fontSize: 12, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', textAlign: 'right' }}>
            {formatMoney(avg, currency)}
          </td>
        </tr>
      )))}
    </Tbl>
  )
}

export function RankedList({ items, currency }: { items: RankedProduct[]; currency: string }) {
  const max = Math.max(1, ...items.map(item => item.amount))
  return (
    <Tbl>
      {items.map((item, index) => (
        <tr key={item.name}>
          <td style={{ width: 22, padding: '7px 0', fontWeight: 800, color: C.terra, fontSize: 13, verticalAlign: 'top' }}>{index + 1}</td>
          <td style={{ padding: '7px 0', fontSize: 13, color: C.ink }}>
            <strong>{item.name}</strong>{' '}
            <span style={{ color: C.muted, fontSize: 12 }}>{`· ${formatNumber(item.quantity)} vendu${item.quantity > 1 ? 's' : ''}`}</span>
            <div style={{ marginTop: 4 }}>
              <HorizontalBar pct={Math.max(2, Math.round((item.amount / max) * 100))} color={C.terraLight} height={6} />
            </div>
          </td>
          <td style={{ padding: '7px 0 7px 12px', fontSize: 13, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', textAlign: 'right', verticalAlign: 'top' }}>
            {formatMoney(item.amount, currency)}
          </td>
        </tr>
      ))}
    </Tbl>
  )
}

export function Callout({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <Tbl style={{ marginBottom: 8 }}>
      <tr>
        <td style={{ background: C.pending, borderRadius: 10, padding: '12px 14px', fontSize: 13, color: C.pendingInk, lineHeight: 1.5 }}>
          {icon}&nbsp; {children}
        </td>
      </tr>
    </Tbl>
  )
}

export function InfoBox({ children, accent }: { children: ReactNode; accent?: string }) {
  return (
    <Tbl style={{ background: C.well, borderRadius: 12, borderLeft: accent ? `4px solid ${accent}` : undefined }}>
      <tr>
        <td style={{ padding: '14px 16px', fontSize: 13, color: C.muted, lineHeight: 1.7 }}>{children}</td>
      </tr>
    </Tbl>
  )
}

export function DetailRows({ rows }: { rows: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <Tbl style={{ fontSize: 13, color: C.muted }}>
      {rows.map((row, i) => (
        <tr key={i}>
          <td style={rowCell}>{row.label}</td>
          <td style={{ ...rowCell, textAlign: 'right', color: C.ink, fontWeight: 700 }}>{row.value}</td>
        </tr>
      ))}
    </Tbl>
  )
}
```

- [ ] **Step 6 : Écrire la fixture quotidienne**

```ts
// src/lib/reports/emails/fixtures.ts
import type { DailyReportData } from '../types'

const hours = (values: Record<number, number>) => Array.from({ length: 24 }, (_, h) => values[h] ?? 0)

/** Données fictives de la maquette validée (samedi 14 novembre 2026). */
export const dailyFixture: DailyReportData = {
  orgName: 'Pâtisserie Démo',
  currency: 'FCFA',
  reportDate: new Date('2026-11-14T20:14:00Z'),
  appUrl: 'https://patiss-app.example',
  totalRevenue: 487_000,
  comparisons: { yesterday: 312_000, lastWeek: 452_000, lastWeekDate: new Date('2026-11-07T20:14:00Z') },
  sales: { count: 94, revenue: 487_000, countYesterday: 71, revenueYesterday: 312_000 },
  expenses: { total: 62_000, count: 3 },
  hourly: {
    today: hours({ 7: 18_000, 8: 42_000, 9: 51_000, 10: 47_000, 11: 38_000, 12: 29_000, 13: 22_000, 14: 19_000, 15: 27_000, 16: 44_000, 17: 61_000, 18: 52_000, 19: 37_000 }),
    yesterday: hours({ 7: 12_000, 8: 28_000, 9: 34_000, 10: 30_000, 11: 26_000, 12: 22_000, 13: 18_000, 14: 15_000, 15: 19_000, 16: 29_000, 17: 37_000, 18: 26_000, 19: 16_000 }),
  },
  payments: [
    { method: 'Espèces', amount: 214_000, pct: 44 },
    { method: 'Wave', amount: 146_250, pct: 30 },
    { method: 'Orange Money', amount: 87_750, pct: 18 },
    { method: 'MTN MOMO', amount: 29_250, pct: 6 },
    { method: 'Moov Money', amount: 9_750, pct: 2 },
  ],
  topProducts: [
    { name: 'Forêt-Noire (entier)', quantity: 7, amount: 105_000 },
    { name: 'Croissant au beurre', quantity: 86, amount: 43_000 },
    { name: 'Éclair au chocolat', quantity: 42, amount: 42_000 },
  ],
  tomorrow: { count: 6, firstPickupAt: '2026-11-15T09:30:00.000Z', remaining: 78_000 },
  stockAlerts: [
    { name: 'Beurre doux', current: 2, threshold: 5, unit: 'kg' },
    { name: 'Crème liquide', current: 1.5, threshold: 3, unit: 'L' },
  ],
  pendingTotal: 134_500,
  breakdown: { ventesDirectes: 340_500, acomptes: 96_500, soldes: 50_000 },
  caisse: {
    openerName: 'Awa', openerRole: 'Vendeur', openedAt: '2026-11-14T07:02:00.000Z',
    closerName: 'Koffi', closerRole: 'Gérant', closedAt: '2026-11-14T20:14:00.000Z',
  },
  team: [
    { name: 'Awa', role: 'Vendeur', orders: 12, imports: 0 },
    { name: 'Koffi', role: 'Gérant', orders: 5, imports: 2 },
  ],
}
```

- [ ] **Step 7 : Écrire les tests du gabarit quotidien (en échec)**

React échappe l'apostrophe (`&#x27;`) : les assertions évitent les textes qui en contiennent. React peut aussi insérer `<!-- -->` entre deux nœuds texte adjacents : tout texte vérifié par un test est produit par une seule chaîne (template literal) dans le JSX.

```tsx
// src/lib/reports/emails/DailyReportEmail.test.tsx
import { describe, expect, it } from 'vitest'
import { dailyPreheader, dailySubject } from './DailyReportEmail'
import { dailyFixture } from './fixtures'
import { renderDailyReportEmail } from './render'

describe('DailyReportEmail', () => {
  it('affiche le total, les deux comparaisons et les blocs principaux', async () => {
    const html = await renderDailyReportEmail(dailyFixture)
    expect(html).toContain('487 000')
    expect(html).toContain('+56 %')
    expect(html).toContain('+8 %')
    expect(html).toContain('vs samedi dernier')
    expect(html).toContain('Panier moyen')
    expect(html).toContain('Heure de pointe')
    expect(html).toContain('17h–18h')
    expect(html).toContain('Modes de règlement')
    expect(html).toContain('MTN MoMo')
    expect(html).toContain('Forêt-Noire (entier)')
    expect(html).toContain('6 commandes')
    expect(html).toContain('09h30')
    expect(html).toContain('Beurre doux 2 kg (seuil 5 kg)')
    expect(html).toContain('Koffi 5 (+2 imports)')
    expect(html).toContain('https://patiss-app.example')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
  })

  it('échappe les noms saisis par les utilisateurs', async () => {
    const html = await renderDailyReportEmail({
      ...dailyFixture,
      topProducts: [{ name: '<b>Gâteau</b>', quantity: 1, amount: 1000 }],
    })
    expect(html).toContain('&lt;b&gt;Gâteau')
    expect(html).not.toContain('<b>Gâteau')
  })

  it('masque les blocs optionnels sans données sans planter', async () => {
    const html = await renderDailyReportEmail({
      ...dailyFixture,
      totalRevenue: 0,
      comparisons: null,
      sales: null,
      hourly: null,
      payments: [],
      topProducts: null,
      tomorrow: null,
      stockAlerts: [],
      pendingTotal: 0,
      appUrl: null,
    })
    expect(html).not.toContain('Heure de pointe')
    expect(html).not.toContain('Modes de règlement')
    expect(html).not.toContain('Top 3')
    expect(html).not.toContain('Points d')
    expect(html).not.toContain('Ouvrir le tableau de bord')
    expect(html).toContain('Détails de la caisse')
  })

  it('annonce l’absence de retrait demain', async () => {
    const html = await renderDailyReportEmail({ ...dailyFixture, tomorrow: { count: 0, firstPickupAt: null, remaining: 0 } })
    expect(html).toContain('Aucun retrait prévu demain.')
  })

  it('compose le préheader et l’objet', () => {
    expect(dailyPreheader(dailyFixture)).toBe('487 000 FCFA encaissés, +56 % vs hier, +8 % vs samedi dernier')
    expect(dailySubject(dailyFixture)).toBe('📊 Rapport de journée — Pâtisserie Démo — Samedi 14 novembre 2026')
  })
})
```

- [ ] **Step 8 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/reports/emails/DailyReportEmail.test.tsx`
Expected : FAIL, modules `./DailyReportEmail` et `./render` introuvables.

- [ ] **Step 9 : Implémenter le gabarit quotidien**

```tsx
// src/lib/reports/emails/DailyReportEmail.tsx
import { variationPct } from '../report-math'
import type { DailyReportData } from '../types'
import {
  C, Callout, DeltaPill, DetailRows, EmailShell, Hero, InfoBox, KpiTiles,
  PairedHourBars, RankedList, Section, StackedBar, Strong, type Kpi,
} from './components'
import { formatLongDate, formatMoney, formatNumber, formatQty, formatShortDate, formatSignedPct, formatTime, formatWeekday } from './format'

const DAY_MS = 86_400_000

export function dailyPreheader(d: DailyReportData): string {
  const parts = [`${formatMoney(d.totalRevenue, d.currency)} encaissés`]
  const vsYesterday = variationPct(d.totalRevenue, d.comparisons?.yesterday)
  if (vsYesterday !== null) parts.push(`${formatSignedPct(vsYesterday)} vs hier`)
  const vsLastWeek = variationPct(d.totalRevenue, d.comparisons?.lastWeek)
  if (vsLastWeek !== null && d.comparisons) parts.push(`${formatSignedPct(vsLastWeek)} vs ${formatWeekday(d.comparisons.lastWeekDate)} dernier`)
  return parts.join(', ')
}

export function dailySubject(d: DailyReportData): string {
  return `📊 Rapport de journée — ${d.orgName} — ${formatLongDate(d.reportDate)}`
}

export function DailyReportEmail({ data: d }: { data: DailyReportData }) {
  const c = d.currency
  const yesterdayDate = new Date(d.reportDate.getTime() - DAY_MS)
  const sales = d.sales
  const basket = sales && sales.count > 0 ? sales.revenue / sales.count : null
  const basketYesterday = sales && sales.countYesterday > 0 ? sales.revenueYesterday / sales.countYesterday : null
  const net = d.totalRevenue - d.expenses.total
  const hourly = d.hourly && d.hourly.today.some(v => v > 0) ? d.hourly : null
  const hasAttention = d.stockAlerts.length > 0 || d.pendingTotal > 0

  const tiles: Kpi[] = []
  if (sales) {
    tiles.push({ label: 'Ventes', value: formatNumber(sales.count), extra: <DeltaPill current={sales.count} reference={sales.countYesterday} label="vs hier" /> })
  }
  if (basket !== null) {
    tiles.push({ label: 'Panier moyen', value: formatMoney(basket, c), extra: <DeltaPill current={basket} reference={basketYesterday} label="vs hier" /> })
  }
  tiles.push({
    label: 'Solde net',
    value: formatMoney(net, c),
    extra: `CA − dépenses (${formatMoney(d.expenses.total, c)}, ${d.expenses.count} achat${d.expenses.count > 1 ? 's' : ''})`,
  })

  return (
    <EmailShell orgName={d.orgName} title="Rapport de journée" subtitle={formatLongDate(d.reportDate)}
      preheader={dailyPreheader(d)} currency={c} appUrl={d.appUrl}>
      <Hero
        label="Total encaissé aujourd'hui"
        amount={formatMoney(d.totalRevenue, c)}
        deltas={d.comparisons ? [
          { current: d.totalRevenue, reference: d.comparisons.yesterday, label: `vs hier, ${formatWeekday(yesterdayDate)} (${formatMoney(d.comparisons.yesterday, c)})` },
          { current: d.totalRevenue, reference: d.comparisons.lastWeek, label: `vs ${formatWeekday(d.comparisons.lastWeekDate)} dernier, ${formatShortDate(d.comparisons.lastWeekDate)} (${formatMoney(d.comparisons.lastWeek, c)})` },
        ] : []}
      />

      <Section title="L'essentiel"><KpiTiles tiles={tiles} /></Section>

      {hourly ? (
        <Section title="CA heure par heure" subtitle="Aujourd'hui comparé à hier">
          <PairedHourBars today={hourly.today} yesterday={hourly.yesterday} todayLabel="Aujourd'hui"
            yesterdayLabel={`Hier (${formatWeekday(yesterdayDate)})`} currency={c} />
        </Section>
      ) : null}

      {d.payments.length > 0 ? (
        <Section title="Modes de règlement"><StackedBar shares={d.payments} currency={c} /></Section>
      ) : null}

      {d.topProducts && d.topProducts.length > 0 ? (
        <Section title="Top 3 du jour"><RankedList items={d.topProducts} currency={c} /></Section>
      ) : null}

      {d.tomorrow ? (
        <Section title="À préparer pour demain">
          <InfoBox>
            {d.tomorrow.count === 0 ? 'Aucun retrait prévu demain.' : (
              <>
                <strong style={{ fontSize: 18, color: C.ink }}>{`${d.tomorrow.count} commande${d.tomorrow.count > 1 ? 's' : ''}`}</strong> à retirer demain
                <br />
                {d.tomorrow.firstPickupAt ? <>Premier retrait à <Strong>{formatTime(d.tomorrow.firstPickupAt)}</Strong> · </> : null}
                Reste à encaisser : <Strong>{formatMoney(d.tomorrow.remaining, c)}</Strong>
              </>
            )}
          </InfoBox>
        </Section>
      ) : null}

      {hasAttention ? (
        <Section title="Points d'attention">
          {d.stockAlerts.length > 0 ? (
            <Callout icon="⚠️">
              <strong>Stock bas :</strong>{' '}
              {d.stockAlerts.map(a => `${a.name} ${formatQty(a.current)} ${a.unit} (seuil ${formatQty(a.threshold)} ${a.unit})`).join(' · ')}
            </Callout>
          ) : null}
          {d.pendingTotal > 0 ? (
            <Callout icon="⏳"><strong>Soldes dus</strong> sur les commandes en cours : {formatMoney(d.pendingTotal, c)}</Callout>
          ) : null}
        </Section>
      ) : null}

      <Section title="Détails de la caisse">
        <DetailRows rows={[
          { label: 'Ventes directes', value: formatMoney(d.breakdown.ventesDirectes, c) },
          { label: 'Acomptes sur commandes', value: formatMoney(d.breakdown.acomptes, c) },
          { label: 'Soldes de commandes', value: formatMoney(d.breakdown.soldes, c) },
          { label: <>Caisse ouverte par <Strong>{d.caisse.openerName}</Strong> ({d.caisse.openerRole})</>, value: formatTime(d.caisse.openedAt) },
          { label: <>Caisse fermée par <Strong>{d.caisse.closerName}</Strong> ({d.caisse.closerRole})</>, value: formatTime(d.caisse.closedAt) },
          {
            label: "Saisies de commandes par l'équipe",
            value: d.team.length === 0 ? 'Aucune' : d.team
              .map(t => `${t.name} ${t.orders}${t.imports > 0 ? ` (+${t.imports} import${t.imports > 1 ? 's' : ''})` : ''}`)
              .join(' · '),
          },
        ]} />
      </Section>
    </EmailShell>
  )
}
```

- [ ] **Step 10 : Implémenter le rendu**

```tsx
// src/lib/reports/emails/render.tsx
import { render } from '@react-email/render'
import type { DailyReportData } from '../types'
import { DailyReportEmail } from './DailyReportEmail'

export function renderDailyReportEmail(data: DailyReportData): Promise<string> {
  return render(<DailyReportEmail data={data} />)
}
```

- [ ] **Step 11 : Lancer les tests**

Run : `npx vitest run src/lib/reports/emails`
Expected : PASS (format + gabarit quotidien).

- [ ] **Step 12 : Vérifier les types et le lint**

Run : `npx tsc --noEmit -p tsconfig.json && npx eslint src/lib/reports`
Expected : aucune erreur dans `src/lib/reports`. Les erreurs préexistantes ailleurs dans le dépôt ne sont pas à corriger ici, mais à signaler.

- [ ] **Step 13 : Commit**

```bash
git add src/lib/reports/emails
git commit -m "feat(rapports): briques visuelles et gabarit de l'e-mail quotidien"
```

---

### Task 6 : Gabarit mensuel

**Files :**
- Create : `src/lib/reports/emails/MonthlyReportEmail.tsx`
- Modify : `src/lib/reports/emails/render.tsx` (ajout de `renderMonthlyReportEmail`)
- Modify : `src/lib/reports/emails/fixtures.ts` (ajout de `monthlyFixture`)
- Test : `src/lib/reports/emails/MonthlyReportEmail.test.tsx`

**Interfaces :**
- Consumes : composants et formats (Task 5) ; `shiftMonth`, `variationPct`, `weekdayAverages` (Task 3) ; `monthName`, `monthLabel` (Task 4)
- Produces : `MonthlyReportEmail({ data }: { data: MonthlyReportData })`, `monthlyPreheader(d)`, `monthlySubject(d)`, `renderMonthlyReportEmail(data: MonthlyReportData): Promise<string>`, `monthlyFixture: MonthlyReportData`

- [ ] **Step 1 : Ajouter la fixture mensuelle à `fixtures.ts`**

Ajouter en tête du fichier `import { weekdayAverages } from '../report-math'` et remplacer `import type { DailyReportData } from '../types'` par `import type { DailyReportData, DayTotal, MonthlyReportData } from '../types'`. Puis ajouter à la fin :

```ts
// Octobre 2026 : le 1er est un jeudi (0 = lundi → jeudi = 3).
const BASE_BY_WEEKDAY = [238, 262, 281, 290, 331, 497, 423]
const WIGGLE = [7, -12, 15, -4, 9, -18, 3, 11, -7, 21, -9, 5, -15, 13, 2, -11, 17, -6, 8, -3, 25, -14, 6, -8, 12, -5, 19, -10, 4, 31, 14]
const OCTOBER: DayTotal[] = WIGGLE.map((wiggle, i) => {
  const weekday = (3 + i) % 7
  return { day: i + 1, weekday, amount: (BASE_BY_WEEKDAY[weekday] + wiggle) * 1000 }
})
const OCTOBER_REVENUE = OCTOBER.reduce((sum, d) => sum + d.amount, 0)

/** Données fictives de la maquette validée (octobre 2026). */
export const monthlyFixture: MonthlyReportData = {
  orgName: 'Pâtisserie Démo',
  currency: 'FCFA',
  appUrl: 'https://patiss-app.example',
  month: '2026-10',
  revenue: OCTOBER_REVENUE,
  historicalRevenue: 320_000,
  revenuePrev: 8_915_000,
  revenueLastYear: 9_120_000,
  sales: { count: 2_104, countPrev: 1_967 },
  orders: { count: 148, countPrev: 131 },
  expenses: { total: 1_860_000, totalPrev: 1_740_000 },
  days: OCTOBER,
  openDays: 31,
  weekdayAverages: weekdayAverages(OCTOBER),
  payments: [
    { method: 'Espèces', amount: 4_518_000, pct: 43 },
    { method: 'Wave', amount: 3_257_000, pct: 31 },
    { method: 'Orange Money', amount: 1_786_000, pct: 17 },
    { method: 'MTN MOMO', amount: 630_000, pct: 6 },
    { method: 'Moov Money', amount: 315_000, pct: 3 },
  ],
  topProducts: [
    { name: 'Forêt-Noire (entier)', quantity: 142, amount: 2_130_000 },
    { name: 'Fraisier (entier)', quantity: 96, amount: 1_632_000 },
    { name: 'Croissant au beurre', quantity: 1_840, amount: 920_000 },
    { name: 'Éclair au chocolat', quantity: 812, amount: 812_000 },
    { name: 'Number cake', quantity: 21, amount: 735_000 },
    { name: 'Pain au chocolat', quantity: 1_210, amount: 726_000 },
    { name: 'Tarte citron meringuée', quantity: 58, amount: 580_000 },
    { name: 'Mille-feuille', quantity: 402, amount: 482_400 },
    { name: 'Macarons (boîte de 12)', quantity: 61, amount: 427_000 },
    { name: 'Paris-Brest', quantity: 47, amount: 376_000 },
  ],
  flopProducts: [
    { name: 'Tarte Tatin (entière)', quantity: 1, amount: 12_000 },
    { name: 'Opéra (part)', quantity: 6, amount: 9_000 },
    { name: 'Chausson aux pommes', quantity: 9, amount: 6_300 },
  ],
  lowSellerCount: 3,
  customers: {
    newCount: 37,
    returningCount: 64,
    top: [
      { name: 'Mme Kouassi', orders: 6, amount: 214_000 },
      { name: 'Hôtel Ivoire Lagune', orders: 4, amount: 186_000 },
      { name: 'M. Traoré', orders: 5, amount: 142_500 },
      { name: 'Mme Bamba', orders: 3, amount: 98_000 },
      { name: 'École Les Lauriers', orders: 2, amount: 91_000 },
    ],
  },
  insights: [
    'Le CA progresse de +18 % par rapport à septembre, porté par Forêt-Noire (entier).',
    'Le solde net (CA − dépenses) progresse de +21 % par rapport à septembre.',
    '3 produits se vendent à moins de 10 exemplaires par mois : à revoir.',
  ],
}
```

- [ ] **Step 2 : Écrire les tests (en échec)**

```tsx
// src/lib/reports/emails/MonthlyReportEmail.test.tsx
import { describe, expect, it } from 'vitest'
import { monthlyPreheader, monthlySubject } from './MonthlyReportEmail'
import { monthlyFixture } from './fixtures'
import { renderMonthlyReportEmail } from './render'

describe('MonthlyReportEmail', () => {
  it('affiche le CA, les comparaisons et tous les blocs', async () => {
    const html = await renderMonthlyReportEmail(monthlyFixture)
    expect(html).toContain('Récapitulatif du mois')
    expect(html).toContain('Octobre 2026 · 31 jours')
    expect(html).toContain('vs septembre')
    expect(html).toContain('vs octobre 2025')
    expect(html).toContain('saisis a posteriori')
    expect(html).toContain('En bref')
    expect(html).toContain('porté par Forêt-Noire (entier)')
    expect(html).toContain('CA jour par jour')
    expect(html).toContain('Meilleur jour')
    expect(html).toContain('Quels jours portent la boutique')
    expect(html).toContain('Top 10 produits')
    expect(html).toContain('Ventes les plus faibles')
    expect(html).toContain('Mme Kouassi')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
  })

  it('masque la part historique, le flop et le bloc En bref quand ils sont vides', async () => {
    const html = await renderMonthlyReportEmail({ ...monthlyFixture, historicalRevenue: 0, flopProducts: [], insights: [] })
    expect(html).not.toContain('saisis a posteriori')
    expect(html).not.toContain('Ventes les plus faibles')
    expect(html).not.toContain('En bref')
  })

  it('affiche un tiret à la place des pastilles sans mois de référence', async () => {
    const html = await renderMonthlyReportEmail({
      ...monthlyFixture,
      revenuePrev: 0,
      revenueLastYear: 0,
      sales: { count: 10, countPrev: 0 },
      orders: { count: 3, countPrev: 0 },
      expenses: { total: 1000, totalPrev: 0 },
    })
    expect(html).not.toContain('vs septembre (')
    expect(html).toContain('—')
  })

  it('compose le préheader et l’objet', () => {
    expect(monthlyPreheader(monthlyFixture)).toMatch(/^10 \d{3} \d{3} FCFA en octobre, \+18 % vs septembre$/)
    expect(monthlySubject(monthlyFixture)).toBe('📈 Récap du mois — Pâtisserie Démo — Octobre 2026')
  })
})
```

- [ ] **Step 3 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/reports/emails/MonthlyReportEmail.test.tsx`
Expected : FAIL, module `./MonthlyReportEmail` introuvable.

- [ ] **Step 4 : Implémenter le gabarit mensuel**

```tsx
// src/lib/reports/emails/MonthlyReportEmail.tsx
import type { ReactNode } from 'react'
import { monthLabel, monthName } from '../report-insights'
import { shiftMonth, variationPct } from '../report-math'
import type { MonthlyReportData } from '../types'
import {
  C, DayBars, DeltaPill, DetailRows, EmailShell, Eyebrow, Hero, InfoBox, KpiTiles,
  RankedList, Section, Spacer, StackedBar, Strong, WeekdayBars,
} from './components'
import { capitalize, formatMoney, formatNumber, formatSignedPct } from './format'

const WEEKDAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

export function monthlyPreheader(d: MonthlyReportData): string {
  const base = `${formatMoney(d.revenue, d.currency)} en ${monthName(d.month)}`
  const pct = variationPct(d.revenue, d.revenuePrev)
  return pct === null ? base : `${base}, ${formatSignedPct(pct)} vs ${monthName(shiftMonth(d.month, -1))}`
}

export function monthlySubject(d: MonthlyReportData): string {
  return `📈 Récap du mois — ${d.orgName} — ${capitalize(monthLabel(d.month))}`
}

function weekdaySentence(d: MonthlyReportData): ReactNode {
  const open = d.weekdayAverages
    .map((avg, i) => ({ avg, i }))
    .filter((entry): entry is { avg: number; i: number } => entry.avg !== null && entry.avg > 0)
  if (open.length < 2 || d.revenue <= 0) return null
  const strongest = open.reduce((max, e) => (e.avg > max.avg ? e : max))
  const weakest = open.reduce((min, e) => (e.avg < min.avg ? e : min))
  const ratio = (strongest.avg / weakest.avg).toFixed(1).replace('.', ',')
  const weekendShare = Math.round((d.days.filter(day => day.weekday >= 5).reduce((s, day) => s + day.amount, 0) / d.revenue) * 100)
  return (
    <p style={{ margin: '8px 0 0', fontSize: 13, color: C.muted }}>
      {`Un ${WEEKDAY_NAMES[strongest.i]} rapporte `}<Strong>{`${ratio}×`}</Strong>{` plus qu'un ${WEEKDAY_NAMES[weakest.i]}. Le week-end pèse `}<Strong>{`${weekendShare}\u00a0%`}</Strong> du CA.
    </p>
  )
}

export function MonthlyReportEmail({ data: d }: { data: MonthlyReportData }) {
  const c = d.currency
  const previousKey = shiftMonth(d.month, -1)
  const lastYearKey = shiftMonth(d.month, -12)
  const vsPrevious = `vs ${monthName(previousKey)}`
  const best = d.days.reduce((top, day) => (day.amount > top.amount ? day : top), d.days[0])
  const average = d.openDays > 0 ? d.revenue / d.openDays : 0
  const basket = d.sales.count > 0 ? d.revenue / d.sales.count : null
  const basketPrev = d.sales.countPrev > 0 ? d.revenuePrev / d.sales.countPrev : null
  const net = d.revenue - d.expenses.total
  const netPrev = d.revenuePrev - d.expenses.totalPrev
  const pill = (current: number, reference: number | null): ReactNode =>
    variationPct(current, reference) === null ? '—' : <DeltaPill current={current} reference={reference} label={vsPrevious} />

  return (
    <EmailShell orgName={d.orgName} title="Récapitulatif du mois"
      subtitle={`${capitalize(monthLabel(d.month))} · ${d.openDays} jour${d.openDays > 1 ? 's' : ''} d'ouverture`}
      preheader={monthlyPreheader(d)} currency={c} appUrl={d.appUrl}>
      <Hero
        label={`CA de ${monthLabel(d.month)}`}
        amount={formatMoney(d.revenue, c)}
        deltas={[
          { current: d.revenue, reference: d.revenuePrev, label: `${vsPrevious} (${formatMoney(d.revenuePrev, c)})` },
          { current: d.revenue, reference: d.revenueLastYear, label: `vs ${monthLabel(lastYearKey)} (${formatMoney(d.revenueLastYear, c)})` },
        ]}
        note={d.historicalRevenue > 0 ? `dont ${formatMoney(d.historicalRevenue, c)} saisis a posteriori (commandes papier importées)` : undefined}
      />

      {d.insights.length > 0 ? (
        <Section title="En bref">
          <InfoBox accent={C.sage}>
            {d.insights.map(sentence => <span key={sentence}>• {sentence}<br /></span>)}
          </InfoBox>
        </Section>
      ) : null}

      <Section title="L'essentiel">
        <KpiTiles tiles={[
          { label: 'Ventes', value: formatNumber(d.sales.count), extra: pill(d.sales.count, d.sales.countPrev) },
          { label: 'Panier moyen', value: basket === null ? '—' : formatMoney(basket, c), extra: basket === null ? undefined : pill(basket, basketPrev) },
          { label: 'Commandes', value: formatNumber(d.orders.count), extra: pill(d.orders.count, d.orders.countPrev) },
        ]} />
        <Spacer h={8} />
        <KpiTiles tiles={[
          { label: 'Dépenses', value: formatMoney(d.expenses.total, c), extra: pill(d.expenses.total, d.expenses.totalPrev) },
          { label: 'Solde net', value: formatMoney(net, c), extra: pill(net, netPrev > 0 ? netPrev : null) },
        ]} />
      </Section>

      <Section title="CA jour par jour">
        <DayBars days={d.days} />
        {best && best.amount > 0 ? (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Meilleur jour : <Strong>{`${WEEKDAY_NAMES[best.weekday]} ${best.day} ${monthName(d.month)}`}</Strong> ({formatMoney(best.amount, c)})
            {' '}· Moyenne : <Strong>{formatMoney(average, c)}</Strong> par jour d&apos;ouverture
          </p>
        ) : null}
      </Section>

      <Section title="Quels jours portent la boutique ?" subtitle="CA moyen par jour d'ouverture">
        <WeekdayBars averages={d.weekdayAverages} currency={c} />
        {weekdaySentence(d)}
      </Section>

      {d.payments.length > 0 ? (
        <Section title="Modes de règlement"><StackedBar shares={d.payments} currency={c} /></Section>
      ) : null}

      {d.topProducts.length > 0 ? (
        <Section title="Top 10 produits" subtitle="Classés par CA, ventes en caisse">
          <RankedList items={d.topProducts} currency={c} />
          {d.flopProducts.length > 0 ? (
            <>
              <Eyebrow>Ventes les plus faibles</Eyebrow>
              <DetailRows rows={d.flopProducts.map(p => ({
                label: p.name,
                value: `${formatNumber(p.quantity)} vendu${p.quantity > 1 ? 's' : ''} · ${formatMoney(p.amount, c)}`,
              }))} />
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title="Commandes et clients">
        <KpiTiles tiles={[
          { label: 'Nouveaux clients', value: formatNumber(d.customers.newCount) },
          { label: 'Clients revenus', value: formatNumber(d.customers.returningCount), extra: '2 commandes ou plus' },
        ]} />
        {d.customers.top.length > 0 ? (
          <>
            <Eyebrow>Top 5 clients fidèles</Eyebrow>
            <DetailRows rows={d.customers.top.map(t => ({
              label: <Strong>{t.name}</Strong>,
              value: `${t.orders} commande${t.orders > 1 ? 's' : ''} · ${formatMoney(t.amount, c)}`,
            }))} />
          </>
        ) : null}
      </Section>
    </EmailShell>
  )
}
```

- [ ] **Step 5 : Ajouter le rendu mensuel à `render.tsx`**

Le fichier complet devient :

```tsx
// src/lib/reports/emails/render.tsx
import { render } from '@react-email/render'
import type { DailyReportData, MonthlyReportData } from '../types'
import { DailyReportEmail } from './DailyReportEmail'
import { MonthlyReportEmail } from './MonthlyReportEmail'

export function renderDailyReportEmail(data: DailyReportData): Promise<string> {
  return render(<DailyReportEmail data={data} />)
}

export function renderMonthlyReportEmail(data: MonthlyReportData): Promise<string> {
  return render(<MonthlyReportEmail data={data} />)
}
```

- [ ] **Step 6 : Lancer les tests**

Run : `npx vitest run src/lib/reports/emails`
Expected : PASS.

- [ ] **Step 7 : Générer les aperçus et les comparer aux maquettes**

Créer `scripts/render-report-previews.tsx` :

```tsx
// scripts/render-report-previews.tsx
// Génère des aperçus HTML des deux e-mails à partir des données fictives.
// Usage : npx -y tsx scripts/render-report-previews.tsx
import { mkdirSync, writeFileSync } from 'node:fs'
import { dailyFixture, monthlyFixture } from '../src/lib/reports/emails/fixtures'
import { renderDailyReportEmail, renderMonthlyReportEmail } from '../src/lib/reports/emails/render'

async function main() {
  const dir = 'docs/superpowers/mockups'
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/rendu-quotidien.html`, await renderDailyReportEmail(dailyFixture))
  writeFileSync(`${dir}/rendu-mensuel.html`, await renderMonthlyReportEmail(monthlyFixture))
  console.log('Aperçus écrits dans', dir)
}

main()
```

Run : `npx -y tsx scripts/render-report-previews.tsx`
Expected : `Aperçus écrits dans docs/superpowers/mockups`. Ouvrir `rendu-quotidien.html` et `rendu-mensuel.html` dans le navigateur, à 600 px puis à 375 px de large, et comparer à `email-quotidien.html` / `email-mensuel.html` : même ordre de blocs, mêmes couleurs, montants lisibles avec leurs espaces, aucun débordement horizontal.

- [ ] **Step 8 : Commit**

```bash
git add src/lib/reports/emails scripts/render-report-previews.tsx docs/superpowers/mockups/rendu-*.html
git commit -m "feat(rapports): gabarit du récap mensuel et script d'aperçu"
```

---

### Task 7 : Destinataire et chargement des données quotidiennes

**Files :**
- Create : `src/lib/reports/constants.ts`
- Create : `src/lib/reports/report-recipient.ts`
- Create : `src/lib/reports/daily-report-data.ts`
- Modify : `.env.example` (documenter `REPORT_DEV_EMAIL` et `NEXT_PUBLIC_APP_URL`)
- Test : `src/lib/reports/report-recipient.test.ts`, `src/lib/reports/daily-report-data.test.ts`

**Interfaces :**
- Consumes : `fetchAllRows` (Task 1) ; `rankProducts`, `sumForUtcDay`, `toPaymentShares` (Task 3) ; `hourlyBuckets`, `previousUtcDayKey`, `summarizeSales`, `utcDayKey`, `DashboardTransaction` (`dashboard-metrics.ts`) ; `CaisseMetrics` (`caisse-metrics.ts`)
- Produces :
  - `REPORT_FROM: string`, `reportAppUrl(): string | null`
  - `resolveReportRecipient(admin: SupabaseClient, orgId: string): Promise<string | null>`
  - `roleLabel(slug: string | null | undefined): string`
  - `type DailyReportContext = { orgId: string; orgName: string; currency: string; openedAt: string; openedBy: string | null; closedBy: string | null; now: Date; metrics: CaisseMetrics; alertItems: StockAlertRow[]; expenses: { totalDay: number; countDay: number } }`
  - `type StockAlertRow = { name: string; current_stock: number; alert_threshold: number; unit: string | null }`
  - `loadDailyReportData(admin: SupabaseClient, ctx: DailyReportContext): Promise<DailyReportData>`

Changement de comportement assumé : hors production, le destinataire vient uniquement de `REPORT_DEV_EMAIL`. L'adresse personnelle codée en dur dans `session-utils.ts` est retirée du code. Il faut définir `REPORT_DEV_EMAIL` dans `.env.local` et dans l'environnement Preview de Vercel.

- [ ] **Step 1 : Écrire les constantes**

```ts
// src/lib/reports/constants.ts
export const REPORT_FROM = "Pâtiss'App <onboarding@resend.dev>"

/** URL publique de l'application pour le lien « Ouvrir le tableau de bord » ; null = lien masqué. */
export function reportAppUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim()
  return url ? url : null
}
```

- [ ] **Step 2 : Écrire les tests du destinataire (en échec)**

```ts
// src/lib/reports/report-recipient.test.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { callsTo, createSupabaseFake, hasOp } from '@/test/supabase-fake'
import { resolveReportRecipient } from './report-recipient'

const manager = () => ({ data: { id: 'manager-1' }, error: null })

describe('resolveReportRecipient', () => {
  afterEach(() => vi.unstubAllEnvs())

  it("renvoie l'e-mail du gérant en production", async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    const fake = createSupabaseFake({ profiles: manager }, { userEmail: 'gerante@boutique.ci' })
    expect(await resolveReportRecipient(fake.client as unknown as SupabaseClient, 'org-1')).toBe('gerante@boutique.ci')
    const [call] = callsTo(fake.calls, 'profiles')
    expect(hasOp(call, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(hasOp(call, 'eq', ['role_slug', 'gerant'])).toBe(true)
    expect(hasOp(call, 'eq', ['is_active', true])).toBe(true)
  })

  it('renvoie REPORT_DEV_EMAIL hors production', async () => {
    vi.stubEnv('ENVIRONMENT', 'development')
    vi.stubEnv('REPORT_DEV_EMAIL', 'dev@test.local')
    const fake = createSupabaseFake({ profiles: manager })
    expect(await resolveReportRecipient(fake.client as unknown as SupabaseClient, 'org-1')).toBe('dev@test.local')
  })

  it('renvoie null sans REPORT_DEV_EMAIL hors production', async () => {
    vi.stubEnv('ENVIRONMENT', 'development')
    vi.stubEnv('REPORT_DEV_EMAIL', '')
    const fake = createSupabaseFake({ profiles: manager })
    expect(await resolveReportRecipient(fake.client as unknown as SupabaseClient, 'org-1')).toBeNull()
  })

  it('renvoie null sans gérant actif', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    const fake = createSupabaseFake({ profiles: () => ({ data: null, error: null }) })
    expect(await resolveReportRecipient(fake.client as unknown as SupabaseClient, 'org-1')).toBeNull()
  })

  it("renvoie null si le gérant n'a pas d'e-mail", async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    const fake = createSupabaseFake({ profiles: manager }, { userEmail: null })
    expect(await resolveReportRecipient(fake.client as unknown as SupabaseClient, 'org-1')).toBeNull()
  })
})
```

- [ ] **Step 3 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/reports/report-recipient.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 4 : Implémenter le destinataire**

```ts
// src/lib/reports/report-recipient.ts
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Destinataire des rapports d'une organisation : l'e-mail du gérant actif en production,
 * REPORT_DEV_EMAIL dans les autres environnements. null si aucun destinataire valable.
 */
export async function resolveReportRecipient(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data: manager } = await admin
    .from('profiles')
    .select('id')
    .eq('organization_id', orgId)
    .eq('role_slug', 'gerant')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!manager?.id) return null

  const { data } = await admin.auth.admin.getUserById(manager.id)
  const managerEmail = data?.user?.email ?? null
  if (!managerEmail) return null

  if (process.env.ENVIRONMENT === 'production') return managerEmail
  return process.env.REPORT_DEV_EMAIL?.trim() || null
}
```

- [ ] **Step 5 : Écrire les tests du chargeur quotidien (en échec)**

```ts
// src/lib/reports/daily-report-data.test.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { calculateCaisseMetrics } from '@/lib/domain/caisse-metrics'
import { callsTo, createSupabaseFake, hasOp, isSingle, type FakeCall } from '@/test/supabase-fake'
import { loadDailyReportData, roleLabel, type DailyReportContext } from './daily-report-data'

const NOW = new Date('2026-11-14T20:14:00Z')

const CTX: DailyReportContext = {
  orgId: 'org-1',
  orgName: 'Pâtisserie Démo',
  currency: 'FCFA',
  openedAt: '2026-11-14T07:02:00.000Z',
  openedBy: 'user-awa',
  closedBy: 'user-koffi',
  now: NOW,
  metrics: {
    ...calculateCaisseMetrics(
      [{ amount: 3000, payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE' }],
      []
    ),
  },
  alertItems: [{ name: 'Beurre doux', current_stock: 2, alert_threshold: 5, unit: 'kg' }],
  expenses: { totalDay: 500, countDay: 1 },
}

const TRANSACTIONS = [
  { amount: 1000, created_at: '2026-11-14T10:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE' },
  { amount: 2000, created_at: '2026-11-14T17:30:00Z', payment_method: 'Wave', payment_details: null, label_type: 'VENTE_DIRECTE' },
  { amount: 500, created_at: '2026-11-13T09:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE' },
  { amount: 700, created_at: '2026-11-07T12:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE' },
]

const isPickupQuery = (call: FakeCall) => call.ops.some(([op, args]) => op === 'gte' && args[0] === 'pickup_date')

function fakeWith(overrides: Record<string, (call: FakeCall) => { data: unknown; error: { message: string } | null }> = {}) {
  return createSupabaseFake({
    transactions: () => ({ data: TRANSACTIONS, error: null }),
    transaction_items: () => ({ data: [{ name: 'Forêt-Noire', quantity: 1, unit_price: 15000, subtotal: 15000 }], error: null }),
    orders: call => isPickupQuery(call)
      ? { data: [
          { pickup_date: '2026-11-15T09:30:00+00:00', total_amount: 20000, deposit_amount: 5000 },
          { pickup_date: '2026-11-15T14:00:00Z', total_amount: 10000, deposit_amount: 12000 },
        ], error: null }
      : { data: [
          { created_by: 'user-awa', is_historical: false, profiles: { full_name: 'Awa', role_slug: 'vendeur' } },
          { created_by: 'user-awa', is_historical: true, profiles: { full_name: 'Awa', role_slug: 'vendeur' } },
          { created_by: 'user-koffi', is_historical: false, profiles: [{ full_name: 'Koffi', role_slug: 'gerant' }] },
        ], error: null },
    profiles: call => isSingle(call)
      ? { data: hasOp(call, 'eq', ['id', 'user-awa']) ? { full_name: 'Awa', role_slug: 'vendeur' } : { full_name: 'Koffi', role_slug: 'gerant' }, error: null }
      : { data: [], error: null },
    ...overrides,
  })
}

describe('roleLabel', () => {
  it('traduit les rôles connus', () => {
    expect(roleLabel('gerant')).toBe('Gérant')
    expect(roleLabel('vendeur')).toBe('Vendeur')
    expect(roleLabel('patissier')).toBe('Pâtissier')
    expect(roleLabel(null)).toBe('Opérateur')
  })
})

describe('loadDailyReportData', () => {
  it('découpe aujourd’hui, hier et le même jour la semaine précédente', async () => {
    const fake = fakeWith()
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.comparisons).toEqual({ yesterday: 500, lastWeek: 700, lastWeekDate: new Date('2026-11-07T20:14:00Z') })
    expect(data.sales).toEqual({ count: 2, revenue: 3000, countYesterday: 1, revenueYesterday: 500 })
    expect(data.hourly?.today[10]).toBe(1000)
    expect(data.hourly?.today[17]).toBe(2000)
    expect(data.hourly?.yesterday[9]).toBe(500)
    expect(data.totalRevenue).toBe(3000)
    expect(data.payments).toEqual([{ method: 'Espèces', amount: 3000, pct: 100 }])
  })

  it('lit les transactions avec les bons filtres', async () => {
    const fake = fakeWith()
    await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    const [tx] = callsTo(fake.calls, 'transactions')
    expect(hasOp(tx, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(hasOp(tx, 'eq', ['is_historical', false])).toBe(true)
    expect(hasOp(tx, 'gte', ['created_at', '2026-11-07T00:00:00.000Z'])).toBe(true)
    expect(hasOp(tx, 'lte', ['created_at', NOW.toISOString()])).toBe(true)
  })

  it('filtre chaque requête sur l’organisation', async () => {
    const fake = fakeWith()
    await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    for (const call of [...callsTo(fake.calls, 'transactions'), ...callsTo(fake.calls, 'orders')]) {
      expect(hasOp(call, 'eq', ['organization_id', 'org-1'])).toBe(true)
    }
    for (const call of callsTo(fake.calls, 'transaction_items')) {
      expect(hasOp(call, 'eq', ['transactions.organization_id', 'org-1'])).toBe(true)
    }
  })

  it('résume les retraits de demain', async () => {
    const fake = fakeWith()
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.tomorrow).toEqual({ count: 2, firstPickupAt: '2026-11-15T09:30:00+00:00', remaining: 15000 })
    const pickup = callsTo(fake.calls, 'orders').find(isPickupQuery)!
    expect(hasOp(pickup, 'gte', ['pickup_date', '2026-11-15T00:00:00.000Z'])).toBe(true)
    expect(hasOp(pickup, 'lt', ['pickup_date', '2026-11-16T00:00:00.000Z'])).toBe(true)
    expect(hasOp(pickup, 'neq', ['status', 'cancelled'])).toBe(true)
  })

  it("masque l'heure du premier retrait quand elle vaut minuit", async () => {
    const fake = fakeWith({
      orders: call => isPickupQuery(call)
        ? { data: [{ pickup_date: '2026-11-15T00:00:00+00:00', total_amount: 1000, deposit_amount: 0 }], error: null }
        : { data: [], error: null },
    })
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.tomorrow?.firstPickupAt).toBeNull()
  })

  it('renseigne la caisse et l’activité de l’équipe', async () => {
    const fake = fakeWith()
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.caisse).toEqual({
      openerName: 'Awa', openerRole: 'Vendeur', openedAt: '2026-11-14T07:02:00.000Z',
      closerName: 'Koffi', closerRole: 'Gérant', closedAt: NOW.toISOString(),
    })
    expect(data.team).toEqual([
      { name: 'Awa', role: 'Vendeur', orders: 1, imports: 1 },
      { name: 'Koffi', role: 'Gérant', orders: 1, imports: 0 },
    ])
    expect(data.stockAlerts).toEqual([{ name: 'Beurre doux', current: 2, threshold: 5, unit: 'kg' }])
  })

  it('masque un bloc en erreur sans faire échouer le rapport', async () => {
    const fake = fakeWith({ transaction_items: () => ({ data: null, error: { message: 'timeout' } }) })
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.topProducts).toBeNull()
    expect(data.comparisons).not.toBeNull()
  })

  it('masque comparaisons, ventes et heures si les transactions sont illisibles', async () => {
    const fake = fakeWith({ transactions: () => ({ data: null, error: { message: 'timeout' } }) })
    const data = await loadDailyReportData(fake.client as unknown as SupabaseClient, CTX)
    expect(data.comparisons).toBeNull()
    expect(data.sales).toBeNull()
    expect(data.hourly).toBeNull()
    expect(data.totalRevenue).toBe(3000)
  })
})
```

- [ ] **Step 6 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/reports/daily-report-data.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 7 : Implémenter le chargeur quotidien**

```ts
// src/lib/reports/daily-report-data.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CaisseMetrics } from '@/lib/domain/caisse-metrics'
import {
  hourlyBuckets,
  previousUtcDayKey,
  summarizeSales,
  utcDayKey,
  type DashboardTransaction,
  type TransactionItemInput,
} from '@/lib/domain/dashboard-metrics'
import { reportAppUrl } from './constants'
import { fetchAllRows } from './fetch-all-rows'
import { rankProducts, sumForUtcDay, toPaymentShares } from './report-math'
import type { DailyReportData } from './types'

const DAY_MS = 86_400_000

export type StockAlertRow = { name: string; current_stock: number; alert_threshold: number; unit: string | null }

export type DailyReportContext = {
  orgId: string
  orgName: string
  currency: string
  openedAt: string
  openedBy: string | null
  closedBy: string | null
  now: Date
  metrics: CaisseMetrics
  alertItems: StockAlertRow[]
  expenses: { totalDay: number; countDay: number }
}

type ProfileSummary = { full_name: string | null; role_slug: string | null }
type TeamRow = { created_by: string | null; is_historical: boolean | null; profiles: ProfileSummary | ProfileSummary[] | null }
type PickupRow = { pickup_date: string | null; total_amount: number | null; deposit_amount: number | null }

export function roleLabel(slug: string | null | undefined): string {
  switch (slug) {
    case 'gerant': return 'Gérant'
    case 'vendeur': return 'Vendeur'
    case 'patissier': return 'Pâtissier'
    default: return slug || 'Opérateur'
  }
}

function dayStartIso(date: Date, offsetDays: number): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offsetDays)).toISOString()
}

/** Exécute un chargement optionnel : en cas d'erreur, le bloc correspondant sera masqué. */
async function optional<T>(label: string, orgId: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load()
  } catch {
    console.error(`[daily-report] bloc « ${label} » indisponible`, { orgId })
    return null
  }
}

async function loadTomorrow(admin: SupabaseClient, orgId: string, now: Date): Promise<DailyReportData['tomorrow']> {
  const { data, error } = await admin
    .from('orders')
    .select('pickup_date, total_amount, deposit_amount')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .gte('pickup_date', dayStartIso(now, 1))
    .lt('pickup_date', dayStartIso(now, 2))
    .order('pickup_date', { ascending: true })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as PickupRow[]
  const first = rows.find(row => row.pickup_date)?.pickup_date ?? null
  const firstDate = first ? new Date(first) : null
  const hasTime = firstDate !== null && (firstDate.getUTCHours() !== 0 || firstDate.getUTCMinutes() !== 0)
  return {
    count: rows.length,
    firstPickupAt: hasTime ? first : null,
    remaining: rows.reduce((sum, row) => sum + Math.max(0, (Number(row.total_amount) || 0) - (Number(row.deposit_amount) || 0)), 0),
  }
}

async function loadProfile(admin: SupabaseClient, id: string): Promise<{ name: string; role: string } | null> {
  const { data } = await admin.from('profiles').select('full_name, role_slug').eq('id', id).maybeSingle()
  if (!data) return null
  const profile = data as ProfileSummary
  return { name: profile.full_name || 'Utilisateur', role: roleLabel(profile.role_slug) }
}

async function loadPeople(admin: SupabaseClient, ctx: DailyReportContext) {
  const [opener, closer] = await Promise.all([
    ctx.openedBy ? loadProfile(admin, ctx.openedBy).catch(() => null) : Promise.resolve(null),
    ctx.closedBy ? loadProfile(admin, ctx.closedBy).catch(() => null) : Promise.resolve(null),
  ])
  return {
    openerName: opener?.name ?? 'Non spécifié',
    openerRole: opener?.role ?? 'Opérateur',
    closerName: closer?.name ?? (ctx.closedBy ? 'Utilisateur' : 'Automatique'),
    closerRole: closer?.role ?? (ctx.closedBy ? 'Opérateur' : 'Clôture planifiée'),
  }
}

async function loadTeam(admin: SupabaseClient, orgId: string, openedAt: string): Promise<DailyReportData['team']> {
  const rows = await fetchAllRows<TeamRow>((from, to) =>
    admin
      .from('orders')
      .select('created_by, is_historical, profiles!orders_created_by_fkey(full_name, role_slug)')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .gte('created_at', openedAt)
      .order('id', { ascending: true })
      .range(from, to))
  const byUser = new Map<string, DailyReportData['team'][number]>()
  for (const row of rows) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const key = row.created_by ?? 'inconnu'
    const entry = byUser.get(key) ?? { name: profile?.full_name || 'Utilisateur inconnu', role: roleLabel(profile?.role_slug), orders: 0, imports: 0 }
    if (row.is_historical) entry.imports += 1
    else entry.orders += 1
    byUser.set(key, entry)
  }
  return [...byUser.values()].sort((a, b) => b.orders + b.imports - (a.orders + a.imports))
}

export async function loadDailyReportData(admin: SupabaseClient, ctx: DailyReportContext): Promise<DailyReportData> {
  const { orgId, now } = ctx
  const nowIso = now.toISOString()
  const todayKey = utcDayKey(now)
  const yesterdayKey = previousUtcDayKey(now)
  const lastWeekDate = new Date(now.getTime() - 7 * DAY_MS)
  const lastWeekKey = utcDayKey(lastWeekDate)

  const [txs, items, tomorrow, people, team] = await Promise.all([
    optional('transactions', orgId, () => fetchAllRows<DashboardTransaction>((from, to) =>
      admin
        .from('transactions')
        .select('amount, created_at, payment_method, payment_details, label_type')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .eq('is_historical', false)
        .gte('created_at', dayStartIso(now, -7))
        .lte('created_at', nowIso)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to))),
    optional('top produits', orgId, () => fetchAllRows<TransactionItemInput>((from, to) =>
      admin
        .from('transaction_items')
        .select('name, quantity, unit_price, subtotal, transactions!inner(created_at, organization_id, deleted_at, is_historical)')
        .eq('transactions.organization_id', orgId)
        .is('transactions.deleted_at', null)
        .eq('transactions.is_historical', false)
        .gte('transactions.created_at', dayStartIso(now, 0))
        .lte('transactions.created_at', nowIso)
        .order('id', { ascending: true })
        .range(from, to))),
    optional('retraits de demain', orgId, () => loadTomorrow(admin, orgId, now)),
    loadPeople(admin, ctx),
    optional('équipe', orgId, () => loadTeam(admin, orgId, ctx.openedAt)),
  ])

  const onDay = (key: string) => (txs ?? []).filter(tx => tx.created_at !== null && utcDayKey(new Date(tx.created_at)) === key)
  const todaySales = summarizeSales(onDay(todayKey))
  const yesterdaySales = summarizeSales(onDay(yesterdayKey))

  return {
    orgName: ctx.orgName,
    currency: ctx.currency,
    reportDate: now,
    appUrl: reportAppUrl(),
    totalRevenue: ctx.metrics.totalRevenue,
    comparisons: txs ? { yesterday: sumForUtcDay(txs, yesterdayKey), lastWeek: sumForUtcDay(txs, lastWeekKey), lastWeekDate } : null,
    sales: txs ? {
      count: todaySales.count,
      revenue: todaySales.revenue,
      countYesterday: yesterdaySales.count,
      revenueYesterday: yesterdaySales.revenue,
    } : null,
    expenses: { total: ctx.expenses.totalDay, count: ctx.expenses.countDay },
    hourly: txs ? {
      today: hourlyBuckets(txs, todayKey).map(bucket => bucket.amount),
      yesterday: hourlyBuckets(txs, yesterdayKey).map(bucket => bucket.amount),
    } : null,
    payments: toPaymentShares(ctx.metrics.paymentBreakdown),
    topProducts: items ? rankProducts(items).slice(0, 3) : null,
    tomorrow,
    stockAlerts: ctx.alertItems.map(item => ({
      name: item.name,
      current: Number(item.current_stock) || 0,
      threshold: Number(item.alert_threshold) || 0,
      unit: item.unit ?? '',
    })),
    pendingTotal: ctx.metrics.totalPending,
    breakdown: {
      ventesDirectes: ctx.metrics.totalVentesDirectes,
      acomptes: ctx.metrics.totalAcomptes,
      soldes: ctx.metrics.totalSoldes,
    },
    caisse: { ...people, openedAt: ctx.openedAt, closedAt: nowIso },
    team: team ?? [],
  }
}
```

- [ ] **Step 8 : Documenter les variables dans `.env.example`**

Ajouter à la fin de `.env.example` :

```bash
# Rapports par e-mail
# Hors production, les rapports partent uniquement vers cette adresse (obligatoire pour tester).
REPORT_DEV_EMAIL=
# URL publique de l'application, pour le lien « Ouvrir le tableau de bord » des e-mails (facultatif).
NEXT_PUBLIC_APP_URL=
```

- [ ] **Step 9 : Lancer les tests**

Run : `npx vitest run src/lib/reports`
Expected : PASS.

- [ ] **Step 10 : Commit**

```bash
git add src/lib/reports/constants.ts src/lib/reports/report-recipient.ts src/lib/reports/report-recipient.test.ts src/lib/reports/daily-report-data.ts src/lib/reports/daily-report-data.test.ts .env.example
git commit -m "feat(rapports): destinataire et chargement des données quotidiennes"
```

---

### Task 8 : Brancher le nouvel e-mail dans la clôture

**Files :**
- Modify : `src/lib/actions/session-utils.ts` (imports ; remplacement de toute l'étape 5, de `// 5. ENVOI DU RAPPORT PAR EMAIL` jusqu'à la fin de la fonction)
- Modify : `src/lib/actions/session-utils.test.ts`

**Interfaces :**
- Consumes : `resolveReportRecipient`, `loadDailyReportData`, `REPORT_FROM` (Task 7) ; `renderDailyReportEmail` (Task 5) ; `dailySubject` (Task 5)
- Produces : `closeSingleSession` garde sa signature et son type de retour `SessionResult`. `emailSent` vaut `true` seulement si Resend est configuré et que l'envoi a réussi.

- [ ] **Step 1 : Réécrire le fichier de test (nouveaux cas en échec)**

```ts
// src/lib/actions/session-utils.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, createSupabaseFake, hasOp, isSingle } from '@/test/supabase-fake'

const state = vi.hoisted(() => {
  process.env.RESEND_API_KEY = 're_test_cle_factice_123'
  process.env.REPORT_DEV_EMAIL = 'dev@test.local'
  process.env.ENVIRONMENT = 'development'
  return {
    client: null as unknown,
    send: null as unknown as (...args: unknown[]) => Promise<{ data: unknown; error: { message: string } | null }>,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => state.client }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => state.send(...args) }
  },
}))

import { closeSingleSession, type SessionResult } from './session-utils'

const SESSION: SessionResult = {
  id: 'session-1',
  organization_id: 'org-1',
  opened_at: '2026-11-14T07:00:00.000Z',
  opened_by: null,
  organizations: { name: 'Pâtisserie Démo', currency_symbol: 'FCFA' },
}

const managerProfiles = () => createSupabaseFake({
  profiles: call => (isSingle(call)
    ? { data: { id: 'manager-1', full_name: 'Koffi', role_slug: 'gerant' }, error: null }
    : { data: [], error: null }),
})

describe('closeSingleSession : périmètre des encaissements (D1)', () => {
  let fake: ReturnType<typeof createSupabaseFake>

  beforeEach(() => {
    fake = managerProfiles()
    state.client = fake.client
    state.send = vi.fn(async () => ({ data: { id: 'email-1' }, error: null }))
  })

  it('exclut les transactions historiques et celles datées après la clôture', async () => {
    const result = await closeSingleSession('session-1', null, SESSION)
    expect(result.success).toBe(true)
    const [tx] = callsTo(fake.calls, 'transactions')
    expect(hasOp(tx, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(hasOp(tx, 'eq', ['is_historical', false])).toBe(true)
    expect(tx.ops.some(([op, args]) => op === 'lte' && args[0] === 'created_at')).toBe(true)
  })

  it('exclut les commandes historiques du calcul des soldes dus', async () => {
    await closeSingleSession('session-1', null, SESSION)
    const [orders] = callsTo(fake.calls, 'orders')
    expect(hasOp(orders, 'eq', ['organization_id', 'org-1'])).toBe(true)
    expect(hasOp(orders, 'eq', ['is_historical', false])).toBe(true)
  })
})

describe('closeSingleSession : e-mail de clôture', () => {
  let fake: ReturnType<typeof createSupabaseFake>

  beforeEach(() => {
    fake = managerProfiles()
    state.client = fake.client
    state.send = vi.fn(async () => ({ data: { id: 'email-1' }, error: null }))
  })

  it('envoie le nouveau rapport au destinataire résolu', async () => {
    const result = await closeSingleSession('session-1', null, SESSION)
    expect(result).toMatchObject({ success: true, emailSent: true, to: 'dev@test.local' })
    expect(state.send).toHaveBeenCalledTimes(1)
    const [payload] = (state.send as ReturnType<typeof vi.fn>).mock.calls[0] as [{ from: string; to: string[]; subject: string; html: string }]
    expect(payload.from).toBe("Pâtiss'App <onboarding@resend.dev>")
    expect(payload.to).toEqual(['dev@test.local'])
    expect(payload.subject).toMatch(/^📊 Rapport de journée — Pâtisserie Démo — /)
    expect(payload.html).toContain('Total encaiss')
    expect(payload.html).toContain('Détails de la caisse')
  })

  it("garde la session clôturée si l'envoi échoue", async () => {
    state.send = vi.fn(async () => { throw new Error('réseau') })
    const result = await closeSingleSession('session-1', null, SESSION)
    expect(result.success).toBe(true)
    expect(result.emailSent).toBe(false)
    const [update] = callsTo(fake.calls, 'sales_sessions')
    expect(hasOp(update, 'eq', ['status', 'open'])).toBe(true)
  })

  it("signale l'absence de destinataire sans échouer", async () => {
    fake = createSupabaseFake({ profiles: () => ({ data: null, error: null }) })
    state.client = fake.client
    const result = await closeSingleSession('session-1', null, SESSION)
    expect(result).toMatchObject({ success: true, emailSent: false, reason: 'No manager email found' })
    expect(state.send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/actions/session-utils.test.ts`
Expected : les tests D1 passent ; « envoie le nouveau rapport » échoue (objet `📊 [Rapport de Caisse]…`, `to` différent) et « garde la session clôturée » échoue (l'exception de `send` remonte).

- [ ] **Step 3 : Remplacer l'étape 5 de `closeSingleSession`**

Dans `src/lib/actions/session-utils.ts` :

1. Remplacer les imports en tête de fichier par :

```ts
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { calculateCaisseMetrics } from '@/lib/domain/caisse-metrics'
import { REPORT_FROM } from '@/lib/reports/constants'
import { loadDailyReportData } from '@/lib/reports/daily-report-data'
import { dailySubject } from '@/lib/reports/emails/DailyReportEmail'
import { renderDailyReportEmail } from '@/lib/reports/emails/render'
import { resolveReportRecipient } from '@/lib/reports/report-recipient'
```

2. Supprimer les types devenus inutiles `ProfileSummary` et `SessionOrderSummary` (garder `OrganizationSummary`, `SessionResult`, `getRelation`).

3. Supprimer tout le code depuis la ligne `// 5. ENVOI DU RAPPORT PAR EMAIL` jusqu'à l'accolade fermante de `closeSingleSession` (exclue), et le remplacer par :

```ts
    // 5. ENVOI DU RAPPORT PAR EMAIL
    // La session est déjà clôturée : aucune erreur ci-dessous ne doit remonter.
    const recipient = await resolveReportRecipient(supabaseAdmin, orgId).catch(() => null)
    if (!recipient) {
        return { sessionId, success: true, emailSent: false, reason: 'No manager email found' }
    }
    if (!resend) {
        return { sessionId, success: true, emailSent: false, reason: 'Resend non configuré', to: recipient }
    }

    try {
        const report = await loadDailyReportData(supabaseAdmin, {
            orgId,
            orgName: org?.name ?? 'Votre pâtisserie',
            currency: currency || 'FCFA',
            openedAt: sessionStart,
            openedBy: session.opened_by ?? null,
            closedBy,
            now: new Date(),
            metrics,
            alertItems,
            expenses: { totalDay: expensesSummary.totalDay, countDay: expensesSummary.countDay },
        })
        const html = await renderDailyReportEmail(report)
        const { error: emailError } = await resend.emails.send({
            from: REPORT_FROM,
            to: [recipient],
            subject: dailySubject(report),
            html,
        })
        return {
            sessionId,
            success: true,
            emailSent: !emailError,
            error: emailError?.message,
            to: recipient,
        }
    } catch {
        console.error('[daily-report] rendu ou envoi du rapport impossible', { orgId })
        return { sessionId, success: true, emailSent: false, error: 'Rapport non envoyé', to: recipient }
    }
```

- [ ] **Step 4 : Lancer les tests**

Run : `npx vitest run src/lib/actions/session-utils.test.ts`
Expected : PASS (5 tests).

- [ ] **Step 5 : Lancer la suite complète, le lint et les types**

Run : `npm run test && npx eslint src/lib && npx tsc --noEmit -p tsconfig.json`
Expected : PASS, sans nouvelle erreur de lint ni de types (`format` et `fr` de date-fns ne sont plus importés dans `session-utils.ts`).

- [ ] **Step 6 : Commit**

```bash
git add src/lib/actions/session-utils.ts src/lib/actions/session-utils.test.ts
git commit -m "feat(caisse): nouvel e-mail de clôture avec comparaisons et graphiques

Remplace le gabarit HTML en chaîne par le rendu React du rapport quotidien
(comparaisons J-1/J-7, ventes par heure, modes de règlement, top 3, retraits
de demain). Les noms sont désormais échappés, et une erreur de rendu ou
d'envoi n'affecte plus le résultat de la clôture."
```

---

### Task 9 : Chargement des données mensuelles

**Files :**
- Create : `src/lib/reports/monthly-report-data.ts`
- Test : `src/lib/reports/monthly-report-data.test.ts`

**Interfaces :**
- Consumes : `fetchAllRows` (Task 1) ; `monthBounds`, `shiftMonth`, `sumAmounts`, `dailyTotals`, `weekdayAverages`, `rankProducts`, `toPaymentShares`, `MonthBounds` (Task 3) ; `buildMonthlyInsights`, `InsightInput` (Task 4) ; `reportAppUrl` (Task 7) ; `calculateCaisseMetrics` ; `summarizeSales`
- Produces :
  - `type OrgSummary = { id: string; name: string | null; currency_symbol: string | null }`
  - `type OrderRow = { id: string; customer_id: string | null; customer_name: string | null; total_amount: number | null }`
  - `summarizeCustomers(orders: OrderRow[], newCount: number): MonthlyReportData['customers']`
  - `loadMonthlyReportData(admin: SupabaseClient, org: OrgSummary, monthKey: string): Promise<MonthlyReportData | null>` (null si aucune transaction dans le mois)

- [ ] **Step 1 : Écrire les tests (en échec)**

```ts
// src/lib/reports/monthly-report-data.test.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { callsTo, createSupabaseFake, hasOp, opArg, type FakeCall } from '@/test/supabase-fake'
import { loadMonthlyReportData, summarizeCustomers } from './monthly-report-data'

const ORG = { id: 'org-1', name: 'Pâtisserie Démo', currency_symbol: 'FCFA' }
const OCT = '2026-10-01T00:00:00.000Z'
const SEP = '2026-09-01T00:00:00.000Z'

const monthOf = (call: FakeCall, column: string) => opArg(call, 'gte', column)

const ITEMS = Array.from({ length: 14 }, (_, i) => ({ name: `Produit ${i + 1}`, quantity: i + 1, unit_price: 1000, subtotal: (i + 1) * 1000 }))

function fake(overrides: Record<string, (call: FakeCall) => { data: unknown; error: { message: string } | null; count?: number }> = {}) {
  return createSupabaseFake({
    transactions: call => {
      const start = monthOf(call, 'created_at')
      if (start === OCT) return { data: [
        { amount: 500_000, created_at: '2026-10-03T10:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE', is_historical: false },
        { amount: 200_000, created_at: '2026-10-05T10:00:00Z', payment_method: 'Wave', payment_details: null, label_type: 'VENTE_DIRECTE', is_historical: false },
        { amount: 100_000, created_at: '2026-10-06T10:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'SOLDE', is_historical: true },
      ], error: null }
      if (start === SEP) return { data: [
        { amount: 400_000, created_at: '2026-09-10T10:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE', is_historical: false },
      ], error: null }
      return { data: [], error: null }
    },
    transaction_items: () => ({ data: ITEMS, error: null }),
    expenses: call => ({ data: monthOf(call, 'created_at') === OCT ? [{ amount: 50_000 }] : [{ amount: 40_000 }], error: null }),
    orders: call => ({
      data: monthOf(call, 'created_at') === OCT ? [
        { id: 'o1', customer_id: 'c1', customer_name: 'Mme Kouassi', total_amount: 30_000 },
        { id: 'o2', customer_id: 'c1', customer_name: 'Mme Kouassi', total_amount: 20_000 },
        { id: 'o3', customer_id: 'c2', customer_name: 'M. Traoré', total_amount: 10_000 },
        { id: 'o4', customer_id: null, customer_name: 'Client Vitrine', total_amount: 5_000 },
      ] : [],
      error: null,
    }),
    customers: () => ({ data: null, error: null, count: 7 }),
    ...overrides,
  })
}

describe('summarizeCustomers', () => {
  it('compte les clients revenus et classe le top par montant', () => {
    const result = summarizeCustomers([
      { id: 'a', customer_id: 'c1', customer_name: 'A', total_amount: 10 },
      { id: 'b', customer_id: 'c1', customer_name: 'A', total_amount: 10 },
      { id: 'c', customer_id: 'c2', customer_name: 'B', total_amount: 50 },
      { id: 'd', customer_id: null, customer_name: 'Vitrine', total_amount: 99 },
    ], 3)
    expect(result).toEqual({
      newCount: 3,
      returningCount: 1,
      top: [{ name: 'B', orders: 1, amount: 50 }, { name: 'A', orders: 2, amount: 20 }],
    })
  })
})

describe('loadMonthlyReportData', () => {
  it('agrège le mois, historiques compris, et le compare au mois précédent', async () => {
    const f = fake()
    const data = await loadMonthlyReportData(f.client as unknown as SupabaseClient, ORG, '2026-10')
    expect(data).not.toBeNull()
    expect(data!.revenue).toBe(800_000)
    expect(data!.historicalRevenue).toBe(100_000)
    expect(data!.revenuePrev).toBe(400_000)
    expect(data!.revenueLastYear).toBe(0)
    expect(data!.sales).toEqual({ count: 3, countPrev: 1 })
    expect(data!.orders).toEqual({ count: 4, countPrev: 0 })
    expect(data!.expenses).toEqual({ total: 50_000, totalPrev: 40_000 })
    expect(data!.openDays).toBe(3)
    expect(data!.days[2]).toEqual({ day: 3, weekday: 5, amount: 500_000 })
    expect(data!.weekdayAverages).toEqual([200_000, 100_000, null, null, null, 500_000, null])
    expect(data!.payments.map(p => p.method)).toEqual(['Espèces', 'Wave'])
    expect(data!.customers.newCount).toBe(7)
    expect(data!.customers.returningCount).toBe(1)
    expect(data!.insights[0]).toBe('Le CA progresse de +100 % par rapport à septembre.')
  })

  it('classe le top 10 par CA et isole les 3 produits les moins vendus', async () => {
    const f = fake()
    const data = await loadMonthlyReportData(f.client as unknown as SupabaseClient, ORG, '2026-10')
    expect(data!.topProducts).toHaveLength(10)
    expect(data!.topProducts[0].name).toBe('Produit 14')
    expect(data!.flopProducts.map(p => p.name)).toEqual(['Produit 1', 'Produit 2', 'Produit 3'])
    expect(data!.lowSellerCount).toBe(9)
  })

  it("n'affiche pas de flop avec moins de 13 produits distincts", async () => {
    const f = fake({ transaction_items: () => ({ data: ITEMS.slice(0, 12), error: null }) })
    const data = await loadMonthlyReportData(f.client as unknown as SupabaseClient, ORG, '2026-10')
    expect(data!.flopProducts).toEqual([])
  })

  it('renvoie null sans aucune transaction dans le mois', async () => {
    const f = fake({ transactions: () => ({ data: [], error: null }) })
    expect(await loadMonthlyReportData(f.client as unknown as SupabaseClient, ORG, '2026-10')).toBeNull()
  })

  it('filtre chaque requête sur l’organisation et les bornes du mois', async () => {
    const f = fake()
    await loadMonthlyReportData(f.client as unknown as SupabaseClient, ORG, '2026-10')
    for (const table of ['transactions', 'expenses', 'orders', 'customers']) {
      for (const call of callsTo(f.calls, table)) {
        expect(hasOp(call, 'eq', ['organization_id', 'org-1'])).toBe(true)
      }
    }
    const [items] = callsTo(f.calls, 'transaction_items')
    expect(hasOp(items, 'eq', ['transactions.organization_id', 'org-1'])).toBe(true)
    const [tx] = callsTo(f.calls, 'transactions')
    expect(hasOp(tx, 'gte', ['created_at', OCT])).toBe(true)
    expect(hasOp(tx, 'lt', ['created_at', '2026-11-01T00:00:00.000Z'])).toBe(true)
    expect(tx.ops.some(([op, args]) => op === 'eq' && args[0] === 'is_historical')).toBe(false)
    const [orders] = callsTo(f.calls, 'orders')
    expect(hasOp(orders, 'neq', ['status', 'cancelled'])).toBe(true)
    const [expenses] = callsTo(f.calls, 'expenses')
    expect(hasOp(expenses, 'eq', ['is_cancelled', false])).toBe(true)
  })
})
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/reports/monthly-report-data.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 3 : Implémenter**

```ts
// src/lib/reports/monthly-report-data.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateCaisseMetrics } from '@/lib/domain/caisse-metrics'
import { summarizeSales, type DashboardTransaction, type TransactionItemInput } from '@/lib/domain/dashboard-metrics'
import { reportAppUrl } from './constants'
import { fetchAllRows } from './fetch-all-rows'
import { buildMonthlyInsights, type InsightInput } from './report-insights'
import {
  dailyTotals,
  monthBounds,
  rankProducts,
  shiftMonth,
  sumAmounts,
  toPaymentShares,
  weekdayAverages,
  type MonthBounds,
} from './report-math'
import type { MonthlyReportData } from './types'

export type OrgSummary = { id: string; name: string | null; currency_symbol: string | null }
export type OrderRow = { id: string; customer_id: string | null; customer_name: string | null; total_amount: number | null }
type TxRow = DashboardTransaction & { is_historical: boolean | null }

const TX_COLUMNS = 'amount, created_at, payment_method, payment_details, label_type, is_historical'

export function summarizeCustomers(orders: OrderRow[], newCount: number): MonthlyReportData['customers'] {
  const byCustomer = new Map<string, { name: string; orders: number; amount: number }>()
  for (const order of orders) {
    if (!order.customer_id) continue
    const entry = byCustomer.get(order.customer_id) ?? { name: order.customer_name?.trim() || 'Client', orders: 0, amount: 0 }
    entry.orders += 1
    entry.amount += Number(order.total_amount) || 0
    byCustomer.set(order.customer_id, entry)
  }
  const all = [...byCustomer.values()]
  return {
    newCount,
    returningCount: all.filter(customer => customer.orders >= 2).length,
    top: all.sort((a, b) => b.amount - a.amount).slice(0, 5),
  }
}

/**
 * Données du récap mensuel d'une organisation. Les transactions historiques (imports papier)
 * sont comprises : elles portent leur date réelle de paiement. null si aucune transaction.
 */
export async function loadMonthlyReportData(
  admin: SupabaseClient,
  org: OrgSummary,
  monthKey: string
): Promise<MonthlyReportData | null> {
  const month = monthBounds(monthKey)
  const previous = monthBounds(shiftMonth(monthKey, -1))
  const lastYear = monthBounds(shiftMonth(monthKey, -12))

  const transactions = <T>(bounds: MonthBounds, columns: string) => fetchAllRows<T>((from, to) =>
    admin
      .from('transactions')
      .select(columns)
      .eq('organization_id', org.id)
      .is('deleted_at', null)
      .gte('created_at', bounds.start)
      .lt('created_at', bounds.end)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to))

  const expenses = (bounds: MonthBounds) => fetchAllRows<{ amount: number | null }>((from, to) =>
    admin
      .from('expenses')
      .select('amount')
      .eq('organization_id', org.id)
      .eq('is_cancelled', false)
      .gte('created_at', bounds.start)
      .lt('created_at', bounds.end)
      .order('id', { ascending: true })
      .range(from, to))

  const orders = (bounds: MonthBounds) => fetchAllRows<OrderRow>((from, to) =>
    admin
      .from('orders')
      .select('id, customer_id, customer_name, total_amount')
      .eq('organization_id', org.id)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .gte('created_at', bounds.start)
      .lt('created_at', bounds.end)
      .order('id', { ascending: true })
      .range(from, to))

  const txs = await transactions<TxRow>(month, TX_COLUMNS)
  if (txs.length === 0) return null

  const [prevTxs, lastYearTxs, items, monthExpenses, prevExpenses, monthOrders, prevOrders, newCustomers] = await Promise.all([
    transactions<TxRow>(previous, TX_COLUMNS),
    transactions<{ amount: number | null }>(lastYear, 'amount'),
    fetchAllRows<TransactionItemInput>((from, to) =>
      admin
        .from('transaction_items')
        .select('name, quantity, unit_price, subtotal, transactions!inner(created_at, organization_id, deleted_at)')
        .eq('transactions.organization_id', org.id)
        .is('transactions.deleted_at', null)
        .gte('transactions.created_at', month.start)
        .lt('transactions.created_at', month.end)
        .order('id', { ascending: true })
        .range(from, to)),
    expenses(month),
    expenses(previous),
    orders(month),
    orders(previous),
    (async () => {
      const { count, error } = await admin
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id)
        .gte('created_at', month.start)
        .lt('created_at', month.end)
      if (error) throw new Error(error.message)
      return count ?? 0
    })(),
  ])

  const days = dailyTotals(txs, monthKey)
  const ranking = rankProducts(items)
  const base: InsightInput = {
    orgName: org.name ?? 'Votre pâtisserie',
    currency: org.currency_symbol || 'FCFA',
    appUrl: reportAppUrl(),
    month: monthKey,
    revenue: sumAmounts(txs),
    historicalRevenue: sumAmounts(txs.filter(tx => tx.is_historical === true)),
    revenuePrev: sumAmounts(prevTxs),
    revenueLastYear: sumAmounts(lastYearTxs),
    sales: { count: summarizeSales(txs).count, countPrev: summarizeSales(prevTxs).count },
    orders: { count: monthOrders.length, countPrev: prevOrders.length },
    expenses: { total: sumAmounts(monthExpenses), totalPrev: sumAmounts(prevExpenses) },
    days,
    openDays: days.filter(day => day.amount > 0).length,
    weekdayAverages: weekdayAverages(days),
    payments: toPaymentShares(calculateCaisseMetrics(txs, []).paymentBreakdown),
    topProducts: ranking.slice(0, 10),
    flopProducts: ranking.length >= 13
      ? [...ranking].sort((a, b) => a.quantity - b.quantity || a.amount - b.amount).slice(0, 3)
      : [],
    lowSellerCount: ranking.filter(product => product.quantity < 10).length,
    customers: summarizeCustomers(monthOrders, newCustomers),
  }
  return { ...base, insights: buildMonthlyInsights(base) }
}
```

- [ ] **Step 4 : Lancer les tests**

Run : `npx vitest run src/lib/reports/monthly-report-data.test.ts`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/reports/monthly-report-data.ts src/lib/reports/monthly-report-data.test.ts
git commit -m "feat(rapports): chargement paginé des données du récap mensuel"
```

---

### Task 10 : Envoi mensuel, route du cron et planification

**Files :**
- Create : `src/lib/reports/send-monthly-report.ts`
- Create : `src/app/api/cron/monthly-report/route.ts`
- Modify : `vercel.json`
- Test : `src/lib/reports/send-monthly-report.test.ts`, `src/app/api/cron/monthly-report/route.test.ts`

**Interfaces :**
- Consumes : `loadMonthlyReportData`, `OrgSummary` (Task 9) ; `resolveReportRecipient`, `REPORT_FROM` (Task 7) ; `renderMonthlyReportEmail`, `monthlySubject` (Task 6) ; `monthBounds`, `previousMonthKey` (Task 3)
- Produces :
  - `type MonthlyReportResult = { orgId: string; sent: boolean; reason?: 'no-activity' | 'no-recipient' | 'resend-not-configured' | 'send-failed' | 'error' }`
  - `type ReportMailer = { emails: { send: Resend['emails']['send'] } }`
  - `sendMonthlyReport(args: { admin: SupabaseClient; resend: ReportMailer | null; org: OrgSummary; monthKey: string; overrideRecipient: string | null }): Promise<MonthlyReportResult>`
  - `GET(request: Request): Promise<Response>` (route)

- [ ] **Step 1 : Écrire les tests de l'envoi (en échec)**

```ts
// src/lib/reports/send-monthly-report.test.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseFake, isSingle, opArg, type FakeCall } from '@/test/supabase-fake'
import { sendMonthlyReport, type ReportMailer } from './send-monthly-report'

const ORG = { id: 'org-1', name: 'Pâtisserie Démo', currency_symbol: 'FCFA' }

function activeOrgFake(withTransactions = true) {
  return createSupabaseFake({
    transactions: (call: FakeCall) => ({
      data: withTransactions && opArg(call, 'gte', 'created_at') === '2026-10-01T00:00:00.000Z'
        ? [{ amount: 1000, created_at: '2026-10-03T10:00:00Z', payment_method: 'Espèces', payment_details: null, label_type: 'VENTE_DIRECTE', is_historical: false }]
        : [],
      error: null,
    }),
    customers: () => ({ data: null, error: null, count: 0 }),
    profiles: call => (isSingle(call) ? { data: { id: 'manager-1' }, error: null } : { data: [], error: null }),
  })
}

describe('sendMonthlyReport', () => {
  let send: ReturnType<typeof vi.fn>
  let mailer: ReportMailer

  beforeEach(() => {
    vi.stubEnv('ENVIRONMENT', 'development')
    vi.stubEnv('REPORT_DEV_EMAIL', 'dev@test.local')
    send = vi.fn(async () => ({ data: { id: 'e1' }, error: null }))
    mailer = { emails: { send } } as unknown as ReportMailer
  })
  afterEach(() => vi.unstubAllEnvs())

  it("envoie le récap avec une clé d'idempotence par organisation et par mois", async () => {
    const fake = activeOrgFake()
    const result = await sendMonthlyReport({ admin: fake.client as unknown as SupabaseClient, resend: mailer, org: ORG, monthKey: '2026-10', overrideRecipient: null })
    expect(result).toEqual({ orgId: 'org-1', sent: true })
    const [payload, options] = send.mock.calls[0] as [{ to: string[]; subject: string; html: string }, { idempotencyKey: string }]
    expect(payload.to).toEqual(['dev@test.local'])
    expect(payload.subject).toBe('📈 Récap du mois — Pâtisserie Démo — Octobre 2026')
    expect(payload.html).toContain('Récapitulatif du mois')
    expect(options).toEqual({ idempotencyKey: 'monthly-org-1-2026-10' })
  })

  it("n'envoie rien sans activité dans le mois", async () => {
    const fake = activeOrgFake(false)
    const result = await sendMonthlyReport({ admin: fake.client as unknown as SupabaseClient, resend: mailer, org: ORG, monthKey: '2026-10', overrideRecipient: null })
    expect(result).toEqual({ orgId: 'org-1', sent: false, reason: 'no-activity' })
    expect(send).not.toHaveBeenCalled()
  })

  it("utilise l'adresse de test avec une clé d'idempotence distincte", async () => {
    const fake = activeOrgFake()
    await sendMonthlyReport({ admin: fake.client as unknown as SupabaseClient, resend: mailer, org: ORG, monthKey: '2026-10', overrideRecipient: 'test@test.local' })
    const [payload, options] = send.mock.calls[0] as [{ to: string[] }, { idempotencyKey: string }]
    expect(payload.to).toEqual(['test@test.local'])
    expect(options.idempotencyKey).toMatch(/^monthly-org-1-2026-10-test-\d+$/)
  })

  it("signale un échec d'envoi", async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: 'quota' } })
    const fake = activeOrgFake()
    const result = await sendMonthlyReport({ admin: fake.client as unknown as SupabaseClient, resend: mailer, org: ORG, monthKey: '2026-10', overrideRecipient: null })
    expect(result).toEqual({ orgId: 'org-1', sent: false, reason: 'send-failed' })
  })

  it('signale Resend non configuré', async () => {
    const fake = activeOrgFake()
    const result = await sendMonthlyReport({ admin: fake.client as unknown as SupabaseClient, resend: null, org: ORG, monthKey: '2026-10', overrideRecipient: null })
    expect(result).toEqual({ orgId: 'org-1', sent: false, reason: 'resend-not-configured' })
  })
})
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/lib/reports/send-monthly-report.test.ts`
Expected : FAIL, module introuvable.

- [ ] **Step 3 : Implémenter l'envoi**

```ts
// src/lib/reports/send-monthly-report.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Resend } from 'resend'
import { REPORT_FROM } from './constants'
import { monthlySubject } from './emails/MonthlyReportEmail'
import { renderMonthlyReportEmail } from './emails/render'
import { loadMonthlyReportData, type OrgSummary } from './monthly-report-data'
import { resolveReportRecipient } from './report-recipient'

export type MonthlyReportResult = {
  orgId: string
  sent: boolean
  reason?: 'no-activity' | 'no-recipient' | 'resend-not-configured' | 'send-failed' | 'error'
}

export type ReportMailer = { emails: { send: Resend['emails']['send'] } }

export async function sendMonthlyReport(args: {
  admin: SupabaseClient
  resend: ReportMailer | null
  org: OrgSummary
  monthKey: string
  overrideRecipient: string | null
}): Promise<MonthlyReportResult> {
  const { admin, resend, org, monthKey, overrideRecipient } = args

  const data = await loadMonthlyReportData(admin, org, monthKey)
  if (!data) return { orgId: org.id, sent: false, reason: 'no-activity' }

  const to = overrideRecipient ?? (await resolveReportRecipient(admin, org.id))
  if (!to) return { orgId: org.id, sent: false, reason: 'no-recipient' }
  if (!resend) return { orgId: org.id, sent: false, reason: 'resend-not-configured' }

  const html = await renderMonthlyReportEmail(data)
  // Resend ignore un second envoi avec la même clé pendant 24 h : pas de doublon si le cron se répète.
  const idempotencyKey = overrideRecipient
    ? `monthly-${org.id}-${monthKey}-test-${Date.now()}`
    : `monthly-${org.id}-${monthKey}`
  const { error } = await resend.emails.send(
    { from: REPORT_FROM, to: [to], subject: monthlySubject(data), html },
    { idempotencyKey }
  )
  if (error) return { orgId: org.id, sent: false, reason: 'send-failed' }
  return { orgId: org.id, sent: true }
}
```

- [ ] **Step 4 : Lancer les tests de l'envoi**

Run : `npx vitest run src/lib/reports/send-monthly-report.test.ts`
Expected : PASS.

- [ ] **Step 5 : Écrire les tests de la route (en échec)**

```ts
// src/app/api/cron/monthly-report/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const SECRET = 'secret-de-test-assez-long-123'
const call = (query = '', headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/cron/monthly-report${query}`, { headers }))

describe('GET /api/cron/monthly-report', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('refuse sans CRON_SECRET configuré', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await call()).status).toBe(500)
  })

  it('refuse sans le bon jeton', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    expect((await call()).status).toBe(401)
    expect((await call('', { authorization: 'Bearer mauvais' })).status).toBe(401)
  })

  it('refuse un mois mal formé', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    const response = await call('?month=2026-13', { authorization: `Bearer ${SECRET}` })
    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 6 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/app/api/cron/monthly-report/route.test.ts`
Expected : FAIL, module `./route` introuvable.

- [ ] **Step 7 : Implémenter la route**

```ts
// src/app/api/cron/monthly-report/route.ts
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { monthBounds, previousMonthKey } from '@/lib/reports/report-math'
import { sendMonthlyReport, type MonthlyReportResult } from '@/lib/reports/send-monthly-report'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Récap mensuel. Appelée par le cron Vercel (GET + Authorization: Bearer CRON_SECRET).
 * Paramètres facultatifs : ?month=AAAA-MM, ?org=<uuid>, en-tête X-Test-Email (hors production).
 */
export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return Response.json({ error: 'Config missing' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const monthParam = url.searchParams.get('month')
  let monthKey: string
  try {
    monthKey = monthParam ? monthBounds(monthParam).key : previousMonthKey(new Date())
  } catch {
    return Response.json({ error: 'Paramètre month invalide (format AAAA-MM)' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return Response.json({ error: 'Config missing' }, { status: 500 })

  const admin = createClient(supabaseUrl, serviceKey)
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const testRecipient = process.env.ENVIRONMENT === 'production' ? null : request.headers.get('x-test-email')

  let query = admin.from('organizations').select('id, name, currency_symbol')
  const orgFilter = url.searchParams.get('org')
  if (orgFilter) query = query.eq('id', orgFilter)
  const { data: orgs, error } = await query
  if (error) {
    console.error('[monthly-report] lecture des organisations impossible')
    return Response.json({ error: 'Lecture des organisations impossible' }, { status: 500 })
  }

  // Une organisation à la fois : ménage les quotas Supabase et Resend.
  const results: MonthlyReportResult[] = []
  for (const org of orgs ?? []) {
    try {
      results.push(await sendMonthlyReport({ admin, resend, org, monthKey, overrideRecipient: testRecipient }))
    } catch {
      console.error('[monthly-report] échec du récap', { orgId: org.id })
      results.push({ orgId: org.id, sent: false, reason: 'error' })
    }
  }

  return Response.json({ month: monthKey, results })
}
```

- [ ] **Step 8 : Planifier le cron dans `vercel.json`**

Le fichier complet devient :

```json
{
  "crons": [
    {
      "path": "/api/cron/close-session",
      "schedule": "0 21 * * *"
    },
    {
      "path": "/api/cron/monthly-report",
      "schedule": "0 6 1 * *"
    }
  ]
}
```

- [ ] **Step 9 : Lancer les tests**

Run : `npx vitest run src/lib/reports src/app/api/cron/monthly-report`
Expected : PASS.

- [ ] **Step 10 : Commit**

```bash
git add src/lib/reports/send-monthly-report.ts src/lib/reports/send-monthly-report.test.ts src/app/api/cron/monthly-report vercel.json
git commit -m "feat(rapports): récap mensuel envoyé le 1er du mois par cron

Route GET protégée par CRON_SECRET, une organisation à la fois, clé
d'idempotence Resend monthly-{organisation}-{AAAA-MM} contre les doublons."
```

---

### Task 11 : D2 : vérifier le cron de clôture automatique

**Files :**
- Modify (seulement si l'échec est confirmé) : `src/app/api/cron/close-session/route.ts`
- Test (idem) : `src/app/api/cron/close-session/route.test.ts`

- [ ] **Step 1 : Lire les journaux de la route sur 7 jours**

Avec le MCP Vercel (`get_runtime_logs` ou équivalent, filtré sur le chemin `/api/cron/close-session` et l'environnement production), ou en CLI :

```bash
vercel logs --environment production --since 7d | grep "/api/cron/close-session"
```

Relever le code HTTP des appels de 21h00 UTC.

- [ ] **Step 2 : Décider**
  - **Codes 405** (méthode non autorisée) ou aucune exécution réussie : passer aux Steps 3 à 6.
  - **Codes 200** : le cron fonctionne déjà. Noter le constat dans la description de la PR et sauter cette tâche.

- [ ] **Step 3 : Écrire le test (en échec)**

```ts
// src/app/api/cron/close-session/route.test.ts
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

describe('GET /api/cron/close-session', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('applique la même autorisation que POST', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-de-test-assez-long-123')
    const response = await GET(new NextRequest('http://localhost/api/cron/close-session'))
    expect(response.status).toBe(401)
  })
})
```

- [ ] **Step 4 : Lancer pour vérifier l'échec**

Run : `npx vitest run src/app/api/cron/close-session/route.test.ts`
Expected : FAIL, `GET` n'est pas exporté.

- [ ] **Step 5 : Ajouter le handler `GET`** à la fin de `src/app/api/cron/close-session/route.ts`

```ts
// Vercel appelle les crons en GET : on applique exactement la même logique que POST.
export async function GET(req: NextRequest): Promise<NextResponse> {
    return POST(req)
}
```

- [ ] **Step 6 : Lancer le test puis commit**

Run : `npx vitest run src/app/api/cron/close-session/route.test.ts`
Expected : PASS.

```bash
git add src/app/api/cron/close-session
git commit -m "fix(caisse): le cron de clôture automatique accepte GET

Vercel invoque les crons en GET ; la route n'exportait que POST et la clôture
de 21h échouait (405 constatés dans les journaux de production)."
```

---

### Task 12 : D3 : supprimer l'ancien rapport quotidien

**Files :**
- Delete : `src/app/api/cron/daily-report/route.ts`
- Delete : `supabase/functions/daily-report/` (dossier complet)

- [ ] **Step 1 : Vérifier qu'aucun appelant ne subsiste**

Run : `rg -n "daily-report" --glob '!docs/**' --glob '!node_modules/**' .`
Expected : seules les deux implémentations elles-mêmes apparaissent. Si un autre fichier les appelle, arrêter et le signaler.

- [ ] **Step 2 : Vérifier que la fonction Supabase n'est ni déployée ni planifiée**

Avec le MCP Supabase en lecture seule sur le projet de production : `list_edge_functions` (chercher `daily-report`) et `execute_sql` avec `select jobname, schedule, command from cron.job;` (chercher `daily-report`).
- Fonction absente et non planifiée : continuer.
- **Fonction déployée ou planifiée : ne rien supprimer côté Supabase.** Le signaler à l'utilisateur, qui décidera de la suppression du déploiement. Supprimer seulement les fichiers du dépôt.

- [ ] **Step 3 : Supprimer les fichiers**

```bash
git rm src/app/api/cron/daily-report/route.ts
git rm -r supabase/functions/daily-report
```

- [ ] **Step 4 : Vérifier la compilation**

Run : `npm run test && npx tsc --noEmit -p tsconfig.json`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git commit -m "chore(rapports): supprime l'ancien rapport quotidien inutilisé

Ni la route api/cron/daily-report ni la fonction Supabase daily-report
n'étaient appelées : le rapport part à la clôture de caisse."
```

---

### Task 13 : Vérification finale et PR

- [ ] **Step 1 : Contrôles automatiques**

```bash
npm run test
npm run lint
npm run build
```

Expected : les trois passent. Distinguer toute erreur préexistante (dette connue) des erreurs introduites par la branche, et les rapporter telles quelles.

- [ ] **Step 2 : Envoi réel du rapport quotidien (hors production)**

Avec `ENVIRONMENT` différent de `production` et `REPORT_DEV_EMAIL` défini dans `.env.local`, lancer l'application sur le projet Supabase de test (voir la mémoire « Supabase : prod, test, limites »), ouvrir puis clôturer une session de caisse, et vérifier la réception sur `REPORT_DEV_EMAIL`.

- [ ] **Step 3 : Envoi réel du récap mensuel (hors production)**

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" -H "X-Test-Email: $REPORT_DEV_EMAIL" "http://localhost:3000/api/cron/monthly-report?month=2026-10"
```

Expected : JSON `{"month":"2026-10","results":[…]}` avec `"sent":true` pour l'organisation de test qui a eu de l'activité.

- [ ] **Step 4 : Contrôle visuel**

Ouvrir les deux e-mails reçus dans Gmail web, Gmail mobile et Apple Mail, puis **après transfert** vers une autre adresse. Points à vérifier : ordre des blocs conforme aux maquettes, barres visibles sans « afficher les images », montants lisibles, aucune coupure horizontale sur mobile.

- [ ] **Step 5 : Variables d'environnement Vercel**

Vérifier que `REPORT_DEV_EMAIL` est défini pour Preview, et `NEXT_PUBLIC_APP_URL` pour Production (facultatif). Ne pas les créer sans l'accord de l'utilisateur.

- [ ] **Step 6 : Pousser et ouvrir la PR** (après accord de l'utilisateur)

```bash
git push -u origin feat/rapports-email
gh pr create --base main --title "Rapports par e-mail : clôture enrichie et récap mensuel" --body "$(cat <<'EOF'
## Résumé
- Nouvel e-mail de clôture : comparaisons J-1 / J-7, ventes par heure, modes de règlement, top 3, retraits de demain, points d'attention.
- Récap mensuel envoyé le 1er du mois à 6h (cron Vercel), avec clé d'idempotence Resend.
- Graphiques en HTML pur (tableaux) : lisibles sans images et après transfert.

## Zone argent (commit séparé)
- La clôture exclut désormais les transactions historiques et celles datées après la clôture. Aucun changement en usage normal.

## Autres changements
- D2 : cron close-session (voir le constat dans les journaux).
- D3 : suppression de l'ancien rapport daily-report inutilisé.
- Hors production, le destinataire vient uniquement de REPORT_DEV_EMAIL.

## Vérification
- npm run test / lint / build
- Envois réels sur l'environnement de test, contrôle dans Gmail, Apple Mail et après transfert.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
