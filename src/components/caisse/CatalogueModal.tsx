'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { X, Search, Package, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useOffline } from '@/components/providers/OfflineProvider'
import { PRODUCT_CATEGORIES, CATEGORY_ICONS } from '@/lib/constants/catalogue'
import { useProductFilter } from '@/hooks/useProductFilter'

type Product = {
    id: string
    name: string
    selling_price: number
    current_stock: number | null
    category: string | null
}

export default function CatalogueModal({
    open,
    onClose,
    onAddToCart,
    organizationId,
    currency
}: {
    open: boolean
    onClose: () => void
    onAddToCart: (r: Product) => void
    organizationId: string
    currency: string
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const { isOffline } = useOffline()

    const { data: rawProducts = [], isLoading: loading } = useQuery({
        queryKey: ['catalog', organizationId],
        queryFn: async () => {
            const supabase = createClient()
            const { data, error } = await supabase.from('products')
                .select('id, name, selling_price, current_stock, category')
                .eq('organization_id', organizationId)
                .eq('is_active', true)
                .order('name')
            if (error) throw error
            return data || []
        },
        enabled: open && !!organizationId,
        staleTime: Infinity,
    })

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 100)
    }, [open])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (open && e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [open, onClose])

    const { search, setSearch, activeCategory: activeCat, setActiveCategory: setActiveCat, filtered } =
        useProductFilter(rawProducts)

    if (!open) return null

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalogue-modal-title"
            style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <div
                aria-hidden="true"
                style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(45,27,14,0.6)', backdropFilter: 'blur(4px)' }}
                onClick={onClose}
            />

            <div className="animate-scale-in" onClick={e => e.stopPropagation()} style={{
                position: 'relative', width: '100%', maxWidth: '800px', height: '80vh',
                background: 'var(--color-cream, #FDF8F3)', borderRadius: '24px', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(45,27,14,0.15)'
            }}>
                {/* HEADER */}
                <div style={{ padding: '20px 24px', background: 'white', borderBottom: '1px solid var(--color-border, #FDE8DB)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 id="catalogue-modal-title" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text, #2D1B0E)', margin: 0 }}>Catalogue Produits</h2>
                    <button
                        onClick={onClose}
                        aria-label="Fermer le catalogue"
                        style={{ border: 'none', background: 'var(--color-blush, #FEF3EC)', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-rose-dark, #C4836A)' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* SEARCH & FILTERS */}
                <div style={{ padding: '16px 24px', background: 'white', borderBottom: '1px solid var(--color-border, #FDE8DB)' }}>
                    {/* Barre de recherche — même style que la page */}
                    <div style={{ position: 'relative', marginBottom: '14px' }}>
                        <Search size={18} color="#9C8070" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <input
                            ref={inputRef}
                            type="search"
                            aria-label="Rechercher un produit"
                            placeholder="Rechercher un produit (croissant, tarte...)"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px 16px 12px 48px',
                                borderRadius: '9999px',
                                border: '1.5px solid var(--color-border, #FDE8DB)',
                                background: 'var(--color-cream, #FDF8F3)',
                                fontSize: '0.95rem',
                                fontWeight: 600,
                                color: 'var(--color-text, #2D1B0E)',
                                outline: 'none',
                            }}
                        />
                    </div>

                    {/* Pills catégories — même style que la page */}
                    <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', paddingLeft: '2px', scrollbarWidth: 'none' }}>
                        {PRODUCT_CATEGORIES.map(cat => (
                            <button key={cat} onClick={() => setActiveCat(cat)}
                                style={{
                                    whiteSpace: 'nowrap',
                                    padding: '8px 20px',
                                    borderRadius: '9999px',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    transition: 'all 0.2s',
                                    cursor: 'pointer',
                                    border: activeCat === cat ? 'none' : '1.5px solid var(--color-border, #E5E7EB)',
                                    background: activeCat === cat ? 'var(--color-rose-dark, #C4836A)' : '#fff',
                                    color: activeCat === cat ? '#fff' : 'var(--color-muted, #9C8070)',
                                    boxShadow: activeCat === cat ? '0 4px 12px rgba(196,131,106,0.3)' : 'none',
                                }}>
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* GRID */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    {loading ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Loader2 size={32} color="var(--color-rose-dark, #C4836A)" className="animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--color-muted, #9C8070)', padding: '60px 0' }}>
                            <Package size={40} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                            <p style={{ fontWeight: 600 }}>Aucun produit trouvé</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
                            {filtered.map(product => {
                                const isOutOfStock = product.current_stock === 0
                                return (
                                    <button
                                        key={product.id}
                                        disabled={isOutOfStock}
                                        onClick={() => { onAddToCart(product); toast.success(`${product.name} ajouté`) }}
                                        className={isOutOfStock ? '' : 'card-clickable'}
                                        style={{
                                            background: 'white',
                                            padding: '20px 16px 16px',
                                            borderRadius: '16px',
                                            border: isOutOfStock ? '1.5px solid #FECACA' : '1.5px solid var(--color-border, #E5E7EB)',
                                            textAlign: 'center',
                                            cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                            transition: 'transform 0.1s, box-shadow 0.1s',
                                            opacity: isOutOfStock ? 0.65 : 1,
                                        }}
                                    >
                                        {/* Icône produit */}
                                        <div style={{
                                            width: '56px', height: '56px', borderRadius: '28px',
                                            background: isOutOfStock ? '#FEF2F2' : 'var(--color-blush, #FEF3EC)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '1.5rem', marginBottom: '12px',
                                            border: '2px solid var(--color-border, #FDE8DB)'
                                        }}>
                                            {CATEGORY_ICONS[product.category ?? ''] ?? '📦'}
                                        </div>

                                        {/* Nom */}
                                        <div style={{
                                            fontWeight: 700, fontSize: '0.88rem',
                                            color: isOutOfStock ? '#9C8070' : 'var(--color-text, #2D1B0E)',
                                            marginBottom: '6px', lineHeight: 1.2,
                                            display: '-webkit-box', WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical', overflow: 'hidden'
                                        }}>
                                            {product.name}
                                        </div>

                                        {/* Prix */}
                                        <div style={{
                                            fontWeight: 900, fontSize: '1rem',
                                            color: isOutOfStock ? '#9C8070' : 'var(--color-rose-dark, #C4836A)',
                                            marginBottom: '10px', marginTop: 'auto'
                                        }}>
                                            {Number(product.selling_price).toLocaleString('fr-FR')} {currency}
                                        </div>

                                        {/* Badge stock — même style pill que la page */}
                                        <span style={{
                                            background: isOutOfStock ? '#FEF3C7' : '#ECFDF5',
                                            color: isOutOfStock ? '#92400E' : '#065F46',
                                            fontSize: '0.72rem',
                                            fontWeight: 800,
                                            padding: '4px 12px',
                                            borderRadius: '99px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
                                            border: '1px solid',
                                            borderColor: isOutOfStock ? '#FDE68A' : '#A7F3D0',
                                        }}>
                                            {isOutOfStock ? 'Rupture' : `${product.current_stock} en stock`}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
