'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import NewOrderModal from '@/components/orders/NewOrderModal'

interface Product { id: string; name: string; selling_price: number }

interface Props {
    organizationId: string
    currency: string
}

export default function DashboardNewOrderButton({ organizationId, currency }: Props) {
    const [open, setOpen] = useState(false)
    const [products, setProducts] = useState<Product[]>([])
    const [loadingProducts, setLoadingProducts] = useState(false)

    // Fetch products when the modal opens for the first time
    useEffect(() => {
        if (!open || products.length > 0) return
        setLoadingProducts(true)
        fetch(`/api/products?orgId=${organizationId}`)
            .then(r => r.json())
            .then(data => { if (data.products) setProducts(data.products) })
            .catch(() => {/* silent */ })
            .finally(() => setLoadingProducts(false))
    }, [open, organizationId, products.length])

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="btn-primary"
                style={{
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    padding: '0 20px',
                    height: '44px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    letterSpacing: '0.02em',
                    boxShadow: '0 4px 14px rgba(196,131,106,0.35)',
                }}
            >
                {loadingProducts
                    ? <Loader2 size={16} className="animate-spin" />
                    : <Plus size={16} strokeWidth={2.5} />
                }
                Nouvelle commande
            </button>

            <NewOrderModal
                open={open}
                onClose={() => setOpen(false)}
                products={products}
                currency={currency}
            />
        </>
    )
}
