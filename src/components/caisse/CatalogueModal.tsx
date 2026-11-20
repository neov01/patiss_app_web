'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { X, Search, Package, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PRODUCT_CATEGORIES } from '@/lib/constants/catalogue'
import { useProductFilter } from '@/hooks/useProductFilter'
import { cacheProducts, getCachedProducts } from '@/lib/offline/db'
import ProductPlate from '@/components/ui/ProductPlate'

type Product = {
    id: string
    name: string
    selling_price: number
    current_stock: number | null
    category: string | null
    image_url?: string | null
}

export default function CatalogueModal({
    open,
    onClose,
    onAddToCart,
    organizationId,
    currency,
    initialProducts = []
}: {
    open: boolean
    onClose: () => void
    onAddToCart: (r: Product) => void
    organizationId: string
    currency: string
    initialProducts?: Product[]
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const { data: rawProducts = initialProducts, isLoading: loading } = useQuery({
        queryKey: ['catalog', organizationId],
        queryFn: async () => {
            // 1. Lire d'abord depuis IndexedDB pour avoir un fallback immédiat
            let cached: Product[] = []
            try {
                const localProducts = await getCachedProducts()
                if (localProducts && localProducts.length > 0) {
                    cached = localProducts.map(p => ({
                        id: p.id,
                        name: p.name,
                        selling_price: Number(p.selling_price),
                        current_stock: p.current_stock,
                        category: p.category || '',
                        image_url: p.image_url ?? null,
                    }))
                }
            } catch (localErr) {
                console.error("[Catalogue] Échec de lecture initiale du cache local:", localErr)
            }

            // 2. Requête en ligne
            const supabase = createClient()
            try {
                const { data, error } = await supabase.from('products')
                    .select('id, name, selling_price, current_stock, category, image_url')
                    .eq('organization_id', organizationId)
                    .eq('is_active', true)
                    .order('name')
                
                if (error) throw error

                // On met à jour le cache local IndexedDB complet
                if (data && data.length > 0) {
                    const productsToCache = data.map(p => ({
                        id: p.id,
                        name: p.name,
                        selling_price: Number(p.selling_price),
                        current_stock: p.current_stock,
                        category: p.category || '',
                        image_url: p.image_url ?? null,
                    }))
                    await cacheProducts(productsToCache, true)
                    return productsToCache
                }

                // Si la requête réussit mais est vide, et qu'on a du cache local, on utilise le cache
                if (cached.length > 0) {
                    return cached
                }

                return []
            } catch (err) {
                console.error("[Catalogue] Erreur en ligne, tentative via cache local:", err)
                if (cached.length > 0) {
                    return cached
                }
                throw err
            }
        },
        enabled: open && !!organizationId,
        staleTime: 1000 * 60 * 5, // 5 minutes fresh
        placeholderData: initialProducts.length > 0 ? initialProducts : undefined
    })

    const showSpinner = loading && rawProducts.length === 0

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
                background: 'var(--color-cream, var(--color-caisse-bg))', borderRadius: '24px', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(45,27,14,0.15)'
            }}>
                {/* HEADER */}
                <div style={{ padding: '20px 24px', background: 'white', borderBottom: '1px solid var(--color-border, var(--color-caisse-border))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 id="catalogue-modal-title" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text, var(--color-text))', margin: 0 }}>Catalogue Produits</h2>
                    <button
                        onClick={onClose}
                        aria-label="Fermer le catalogue"
                        style={{ border: 'none', background: 'var(--color-blush, var(--color-well))', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-rose-dark, var(--color-rose-dark))' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* SEARCH & FILTERS */}
                <div style={{ padding: '16px 24px', background: 'white', borderBottom: '1px solid var(--color-border, var(--color-caisse-border))' }}>
                    {/* Barre de recherche — même style que la page */}
                    <div style={{ position: 'relative', marginBottom: '14px' }}>
                        <Search size={18} color="var(--color-muted)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
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
                                border: '1.5px solid var(--color-border, var(--color-caisse-border))',
                                background: 'var(--color-cream, var(--color-caisse-bg))',
                                fontSize: '0.95rem',
                                fontWeight: 600,
                                color: 'var(--color-text, var(--color-text))',
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
                                    border: activeCat === cat ? 'none' : '1.5px solid var(--color-border, var(--color-border))',
                                    background: activeCat === cat ? 'var(--color-rose-dark, var(--color-rose-dark))' : '#fff',
                                    color: activeCat === cat ? '#fff' : 'var(--color-muted, var(--color-muted))',
                                    boxShadow: activeCat === cat ? '0 4px 12px rgba(196,131,106,0.3)' : 'none',
                                }}>
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* GRID */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    {showSpinner ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Loader2 size={32} color="var(--color-rose-dark, var(--color-rose-dark))" className="animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--color-muted, var(--color-muted))', padding: '60px 0' }}>
                            <Package size={40} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                            <p style={{ fontWeight: 600 }}>Aucun produit trouvé</p>
                        </div>
                    ) : (
                        <div className="product-grid">
                            {filtered.map(product => {
                                const isOutOfStock = product.current_stock === 0
                                return (
                                    <button
                                        key={product.id}
                                        type="button"
                                        disabled={isOutOfStock}
                                        onClick={() => { onAddToCart(product); toast.success(`${product.name} ajouté`) }}
                                        className={`product-tile${isOutOfStock ? ' is-out' : ''}`}
                                        aria-label={`Ajouter ${product.name} au panier, ${Number(product.selling_price).toLocaleString('fr-FR')} ${currency}`}
                                    >
                                        <ProductPlate name={product.name} imageUrl={product.image_url} category={product.category} />
                                        <div className="product-tile-body">
                                            <span className="product-tile-name">{product.name}</span>
                                            {product.current_stock !== null && (
                                                <span className={`product-tile-stock${isOutOfStock ? '' : ' is-ok'}`}>
                                                    {isOutOfStock ? 'Rupture' : `${product.current_stock} en stock`}
                                                </span>
                                            )}
                                            <span className="product-tile-price">
                                                {Number(product.selling_price).toLocaleString('fr-FR')}
                                                <span className="product-tile-cur">{currency}</span>
                                            </span>
                                        </div>
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
