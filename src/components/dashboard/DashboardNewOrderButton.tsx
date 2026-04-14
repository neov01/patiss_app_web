'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import NewOrderModal from '@/components/orders/NewOrderModal'

interface Product { id: string; name: string; selling_price: number; current_stock: number | null }

interface Props {
    organizationId: string
    currency: string
    isFloating?: boolean
}

export default function DashboardNewOrderButton({ organizationId, currency, isFloating = false }: Props) {
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
            {isFloating && (
                <style>{`
                    @media (max-width: 900px) {
                        .responsive-fab-button {
                            position: fixed !important;
                            bottom: 85px !important;
                            right: 16px !important;
                            z-index: 100 !important;
                            border-radius: 99px !important;
                            height: 48px !important;
                            font-size: 0.95rem !important;
                            box-shadow: 0 6px 20px rgba(196,131,106,0.4) !important;
                            padding: 0 20px !important;
                        }
                    }
                `}</style>
            )}
            
            <button
                onClick={() => setOpen(true)}
                className={`btn-primary ${isFloating ? 'responsive-fab-button' : ''}`}
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
                    ? <Loader2 size={isFloating ? 20 : 16} className="animate-spin" />
                    : <Plus size={isFloating ? 20 : 16} strokeWidth={2.5} />
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
