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
