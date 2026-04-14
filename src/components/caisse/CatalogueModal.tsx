'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Search, Box, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useOffline } from '@/components/providers/OfflineProvider'
import { getCachedProducts } from '@/lib/offline/db'

type Product = {
    id: string
    name: string
    selling_price: number
    current_stock: number | null
    category: string | null
}

const CATEGORIES = ['Tous', 'Gâteaux', 'Viennoiseries', 'Petits fours', 'Boissons', 'Autres']

export default function CatalogueModal({
    open,
    onClose,
    onAddToCart,
    organizationId,
    currency
}: {
    open: boolean
    onClose: () => void
    onAddToCart: (r: any) => void
    organizationId: string
    currency: string
}) {
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')
    const [activeCat, setActiveCat] = useState('Tous')
    const inputRef = useRef<HTMLInputElement>(null)

    const { isOffline, refreshProductCache } = useOffline()

    // Load
    useEffect(() => {
        if (!open) return
        
        async function fetchCatalogue() {
            setLoading(true)
            
            if (isOffline) {
                // MODE OFFLINE : lire le cache IndexedDB
                try {
                    const cached = await getCachedProducts()
                    setProducts(cached.map(p => ({
                        id: p.id,
                        name: p.name,
                        selling_price: p.selling_price,
                        current_stock: p.current_stock,
                        category: p.category
                    })))
                } catch (err) {
                    console.error('[Offline] Erreur lecture cache produits:', err)
                    setProducts([])
                }
            } else {
                // MODE ONLINE : Supabase
                const supabase = createClient()
                const { data, error } = await supabase.from('products')
                    .select('id, name, selling_price, current_stock, category')
                    .eq('organization_id', organizationId)
                    .order('name')
                
                if (error) {
                    console.error('[Online] Erreur fetch catalogue:', error)
                    setProducts([])
                } else {
                    const productsList = data || []
                    setProducts(productsList)
                    
                    // Mettre à jour le cache local pour le futur mode hors-ligne
                    if (productsList.length > 0) {
                        refreshProductCache(productsList.map(p => ({
                            id: p.id,
                            name: p.name,
                            selling_price: p.selling_price,
                            current_stock: p.current_stock,
                            category: p.category
                        })))
                    }
                }
            }
            
            setLoading(false)
        }
        fetchCatalogue()

        // Focus input
        setTimeout(() => inputRef.current?.focus(), 100)
    }, [open, organizationId, isOffline, refreshProductCache])

    // Keyboard escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (open && e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [open, onClose])

    if (!open) return null

    // Filter
    const filtered = products.filter(r => {
        const matchesCat = activeCat === 'Tous' || r.category === activeCat
        const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase())
        return matchesCat && matchesSearch
    })

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div 
                style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(45,27,14,0.6)', backdropFilter: 'blur(4px)' }} 
                onClick={onClose} 
            />
            
            <div className="animate-scale-in" style={{
                position: 'relative', width: '100%', maxWidth: '800px', height: '80vh',
                background: '#FDF8F3', borderRadius: '24px', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(45,27,14,0.15)'
            }}>
                {/* HEADER */}
                <div style={{ padding: '20px 24px', background: 'white', borderBottom: '1px solid #FDE8DB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2D1B0E', margin: 0 }}>Catalogue Produits</h2>
                    <button onClick={onClose} style={{ border: 'none', background: '#FEF3EC', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#D97757' }}>
                        <X size={18} />
                    </button>
                </div>

                {/* SEARCH & FILTERS */}
                <div style={{ padding: '20px 24px', background: 'white', borderBottom: '1px solid #FDE8DB' }}>
                    <div style={{ position: 'relative', marginBottom: '16px' }}>
                        <Search size={18} color="#9C8070" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Rechercher un produit (croissant, tarte...)"
                            className="input"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ paddingLeft: '44px', height: '48px', fontSize: '1rem', background: '#FDF8F3', border: 'none' }}
                        />
                    </div>
                    
                    {/* Pills Catégories */}
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
                        {CATEGORIES.map(cat => (
                            <button key={cat} onClick={() => setActiveCat(cat)}
                                style={{
                                    padding: '8px 16px', borderRadius: '99px', fontSize: '0.85rem', fontWeight: 600,
                                    whiteSpace: 'nowrap', border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
                                    background: activeCat === cat ? '#C4836A' : 'transparent',
                                    color: activeCat === cat ? 'white' : '#9C8070',
                                    borderColor: activeCat === cat ? '#C4836A' : '#E5E7EB'
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
                            <Loader2 size={32} color="#C4836A" className="animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#9C8070', padding: '40px 0' }}>
                            <Box size={40} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                            <p style={{ fontWeight: 600 }}>Aucun produit trouvé</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
                            {filtered.map(product => {
                                const isOutOfStock = product.current_stock === 0
                                return (
                                    <button 
                                        key={product.id} 
                                        disabled={isOutOfStock}
                                        onClick={() => { onAddToCart(product); toast.success(`${product.name} ajouté`) }}
                                        style={{
                                            background: 'white', padding: '16px', borderRadius: '16px', border: isOutOfStock ? '1px solid #FECACA' : '1px solid #E5E7EB',
                                            textAlign: 'center', cursor: isOutOfStock ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.02)', transition: 'transform 0.1s, box-shadow 0.1s',
                                            position: 'relative',
                                            minHeight: '130px',
                                            opacity: isOutOfStock ? 0.6 : 1,
                                            filter: isOutOfStock ? 'grayscale(0.3)' : 'none'
                                        }}
                                        className={isOutOfStock ? '' : "card-clickable"}
                                    >
                                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: isOutOfStock ? '#FEF2F2' : '#FEF3EC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                                            <Box size={22} color={isOutOfStock ? '#DC2626' : "#D97757"} />
                                        </div>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: isOutOfStock ? '#9C8070' : '#2D1B0E', marginBottom: '4px', lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {product.name}
                                        </div>
                                        <div style={{ fontWeight: 800, color: isOutOfStock ? '#9C8070' : '#C4836A', fontSize: '1rem', marginTop: 'auto' }}>
                                            {Number(product.selling_price).toLocaleString('fr-FR')} {currency}
                                        </div>

                                        {/* Indicateur de stock ultra-visible */}
                                        <div style={{
                                            position: 'absolute', 
                                            top: '8px', 
                                            right: '8px',
                                            padding: isOutOfStock ? '6px 12px' : '4px 10px',
                                            borderRadius: '99px',
                                            background: isOutOfStock ? '#DC2626' : ((product.current_stock || 0) < 5 ? '#F59E0B' : '#10B981'),
                                            color: 'white',
                                            fontSize: isOutOfStock ? '0.7rem' : '0.8rem',
                                            fontWeight: 900,
                                            boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                                            zIndex: 10,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            border: '2px solid #fff',
                                            pointerEvents: 'none'
                                        }}>
                                            {isOutOfStock ? 'ÉPUISÉ' : product.current_stock}
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
