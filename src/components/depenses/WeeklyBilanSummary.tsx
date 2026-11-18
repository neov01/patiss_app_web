'use client'

import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-react'
import type { WeeklyBilanPreview } from '@/lib/schemas/expenses'

interface Props {
  preview: WeeklyBilanPreview
  currency: string
}

const formatMoney = (val: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(val)

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * Chiffres du bilan hebdomadaire de la régie (fonds fixe) :
 * reste de l'enveloppe, recharge à prélever dans le tiroir, estimation à remettre.
 * Partagé par la clôture de caisse du dimanche et l'écran Dépenses.
 */
export default function WeeklyBilanSummary({ preview, currency }: Props) {
  const shortfall = Math.max(0, preview.recharge - preview.netWeekCash)

  return (
    <div className="space-y-3 text-left">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[color:var(--color-primary)]">
        <Wallet className="w-4 h-4" />
        <span>
          Bilan de la semaine du {formatDay(preview.startDate)} au {formatDay(preview.endDate)}
        </span>
      </div>

      <div className="rounded-2xl border border-[rgba(131,116,107,0.2)] bg-[var(--color-caisse-bg)] divide-y divide-[rgba(131,116,107,0.12)]">
        <Row label="Reste dans l'enveloppe" value={`${formatMoney(preview.currentBalance)} ${currency}`} />
        <div className="flex items-baseline justify-between gap-3 px-4 py-3">
          <span className="text-sm font-bold text-[color:var(--color-text)]">
            Recharge à prendre dans le tiroir
            <span className="block text-[11px] font-medium text-[color:var(--color-muted)]">
              pour remettre l&apos;enveloppe à {formatMoney(preview.budget)} {currency}
            </span>
          </span>
          <span className="text-xl font-black text-[color:var(--color-primary)] font-display whitespace-nowrap">
            {formatMoney(preview.recharge)} {currency}
          </span>
        </div>
        <Row
          label="Espèces de la semaine (estimation)"
          value={`${formatMoney(preview.netWeekCash)} ${currency}`}
        />
        <Row
          label="À remettre à la gérante (estimation)"
          value={`${formatMoney(preview.toRemit)} ${currency}`}
          strong
        />
      </div>

      {preview.isCashSufficient ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--color-secondary)]">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Les espèces de la semaine couvrent la recharge.
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-xs font-semibold text-[color:var(--color-error)]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Attention : il manque environ {formatMoney(shortfall)} {currency} d&apos;espèces pour couvrir la recharge.
        </p>
      )}

      <p className="text-[11px] text-[color:var(--color-muted)]">
        La recharge sera enregistrée comme une <strong>sortie de caisse</strong> dans la journée en cours.
      </p>
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <span className="text-xs text-[color:var(--color-muted)]">{label}</span>
      <span className={`text-sm whitespace-nowrap ${strong ? 'font-black text-[color:var(--color-text)]' : 'font-bold text-[color:var(--color-text)]'}`}>
        {value}
      </span>
    </div>
  )
}
