'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import ProductPlate from '@/components/ui/ProductPlate'
import { Search, Edit, Trash2, Loader2, Package, Archive, RotateCcw } from 'lucide-react'
import { deleteProduct, toggleProductActive } from '@/lib/actions/products'
import { toast } from 'sonner'
import ProductModal from './ProductModal'
import { PRODUCT_CATEGORIES } from '@/lib/constants/catalogue'
import { useProductFilter } from '@/hooks/useProductFilter'
import { useQueryClient } from '@tanstack/react-query'

// Seuil d'alerte visuelle « stock bas » sur les tuiles du catalogue.
const LOW_STOCK_THRESHOLD = 5

export interface CatalogueProduct {
  id: string
  name: string
  category: string
  sellingPrice: number
  purchaseCost?: number
  type: string
  trackStock: boolean
  currentStock?: number
  image_url?: string | null
  is_active?: boolean
  composition?: Array<{ ingredientId: string; quantity: number }>
}

interface Ingredient {
  id: string
  name: string
  unit: string
  cost_per_unit: number
}

interface CatalogueClientProps {
  products: CatalogueProduct[]
  currency: string
  availableIngredients: Ingredient[]
}

export default function CatalogueClient({ products, currency, availableIngredients }: CatalogueClientProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<CatalogueProduct | null>(null)
  const [productToDelete, setProductToDelete] = useState<{id: string, name: string} | null>(null)

  const displayedProducts = useMemo(() => {
    return (products ?? []).filter(p => viewMode === 'active' ? p.is_active !== false : p.is_active === false)
  }, [products, viewMode])

  const { search, setSearch, activeCategory, setActiveCategory, filtered: filteredProducts } =
    useProductFilter(displayedProducts)

  const handleDelete = async () => {
    if (!productToDelete) return
    
    const { id } = productToDelete
    setDeletingId(id)
    setProductToDelete(null)
    
    try {
      const res = await deleteProduct(id)
      if (res.success) {
        toast.success("Produit supprimé définitivement")
        queryClient.invalidateQueries({ queryKey: ['catalog'] })
        router.refresh()
      } else {
        toast.error(res.error)
      }
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleActive = async (id: string, newActive: boolean) => {
    setArchivingId(id)
    try {
      const res = await toggleProductActive(id, newActive)
      if (res.success) {
        toast.success(newActive ? "Produit restauré" : "Produit archivé")
        queryClient.invalidateQueries({ queryKey: ['catalog'] })
        router.refresh()
      } else {
        toast.error(res.error)
      }
    } finally {
      setArchivingId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Barre de recherche et toggle de vue */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, paddingLeft: '16px', display: 'flex', alignItems: 'center', pointerEvents: 'none', height: '100%' }}>
            <Search size={20} color="var(--color-muted)" />
          </div>
          <input
            type="text"
            placeholder="Rechercher un produit (croissant, tarte...)"
            style={{
              width: '100%',
              padding: '16px 16px 16px 48px',
              borderRadius: '9999px',
              border: '1.5px solid var(--color-border)',
              background: 'var(--color-cream)',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: 'var(--color-text)',
              outline: 'none',
            }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Sélecteur de vue (Actifs / Archivés) */}
        <div style={{ 
          display: 'flex', 
          background: 'var(--color-well, var(--color-well))', 
          padding: '4px', 
          borderRadius: '9999px', 
          border: '1.5px solid var(--color-border)',
          alignSelf: 'stretch',
          alignItems: 'center'
        }}>
          <button
            type="button"
            onClick={() => setViewMode('active')}
            style={{
              padding: '10px 24px',
              borderRadius: '9999px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: viewMode === 'active' ? 'var(--color-rose-dark, var(--color-rose-dark))' : 'transparent',
              color: viewMode === 'active' ? '#fff' : 'var(--color-muted, var(--color-muted))',
              transition: 'all 0.2s',
              boxShadow: viewMode === 'active' ? '0 4px 12px rgba(196,131,106,0.3)' : 'none',
            }}
          >
            Actifs
          </button>
          <button
            type="button"
            onClick={() => setViewMode('archived')}
            style={{
              padding: '10px 24px',
              borderRadius: '9999px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: viewMode === 'archived' ? 'var(--color-rose-dark, var(--color-rose-dark))' : 'transparent',
              color: viewMode === 'archived' ? '#fff' : 'var(--color-muted, var(--color-muted))',
              transition: 'all 0.2s',
              boxShadow: viewMode === 'archived' ? '0 4px 12px rgba(196,131,106,0.3)' : 'none',
            }}
          >
            Archivés
          </button>
        </div>
      </div>

      {/* Filtres par catégories */}
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', paddingLeft: '2px' }}>
        {PRODUCT_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              whiteSpace: 'nowrap',
              padding: '10px 24px',
              borderRadius: '9999px',
              fontSize: '0.85rem',
              fontWeight: 700,
              transition: 'all 0.2s',
              cursor: 'pointer',
              border: activeCategory === cat ? 'none' : '1.5px solid var(--color-border, var(--color-border))',
              background: activeCategory === cat ? 'var(--color-rose-dark, var(--color-rose-dark))' : '#fff',
              color: activeCategory === cat ? '#fff' : 'var(--color-muted, var(--color-muted))',
              boxShadow: activeCategory === cat ? '0 4px 12px rgba(196,131,106,0.3)' : 'none',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grille de cartes */}
      {filteredProducts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 24px',
          color: 'var(--color-muted)',
          background: 'var(--color-cream)',
          borderRadius: 'var(--radius-xl)',
          border: '1.5px dashed var(--color-border)',
          fontWeight: 600
        }}>
          <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          Aucun produit ne correspond à votre recherche.
        </div>
      ) : (
        <div className="product-grid">
          {filteredProducts.map(product => {
            const isOutOfStock = product.trackStock && (product.currentStock === 0 || product.currentStock === undefined)
            const isLowStock = product.trackStock && !isOutOfStock && (product.currentStock ?? 0) <= LOW_STOCK_THRESHOLD
            const isDeleting = deletingId === product.id
            const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation() }

            return (
              <div
                key={product.id}
                className="product-tile is-static"
                style={{ opacity: isDeleting ? 0.5 : 1 }}
              >
                <ProductPlate name={product.name} imageUrl={product.image_url} category={product.category}>
                  {/* Actions (Modifier / Archiver / Restaurer / Supprimer) */}
                  <div className="product-tile-actions">
                    {viewMode === 'active' ? (
                      <>
                        <button
                          type="button"
                          className="product-tile-action"
                          onClick={(e) => { stop(e); setEditingProduct(product) }}
                          title="Modifier"
                          aria-label={`Modifier ${product.name}`}
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          type="button"
                          className="product-tile-action"
                          onClick={async (e) => { stop(e); await handleToggleActive(product.id, false) }}
                          disabled={archivingId === product.id}
                          title="Archiver"
                          aria-label={`Archiver ${product.name}`}
                        >
                          {archivingId === product.id ? <Loader2 size={18} className="animate-spin" /> : <Archive size={18} />}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="product-tile-action is-ok"
                          onClick={async (e) => { stop(e); await handleToggleActive(product.id, true) }}
                          disabled={archivingId === product.id}
                          title="Restaurer"
                          aria-label={`Restaurer ${product.name}`}
                        >
                          {archivingId === product.id ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
                        </button>
                        <button
                          type="button"
                          className="product-tile-action is-danger"
                          onClick={(e) => { stop(e); setProductToDelete({ id: product.id, name: product.name }) }}
                          disabled={isDeleting}
                          title="Supprimer définitivement"
                          aria-label={`Supprimer définitivement ${product.name}`}
                        >
                          {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                        </button>
                      </>
                    )}
                  </div>
                </ProductPlate>

                <div className="product-tile-body">
                  <span className="product-tile-name">{product.name}</span>
                  {product.trackStock && (
                    <span className={`product-tile-stock ${isOutOfStock ? 'is-out' : isLowStock ? 'is-low' : 'is-ok'}`}>
                      {isOutOfStock ? 'Rupture' : isLowStock ? `Stock bas · ${product.currentStock}` : `${product.currentStock ?? 0} en stock`}
                    </span>
                  )}
                  <span className="product-tile-price is-money">
                    {Number(product.sellingPrice).toLocaleString('fr-FR')}
                    <span className="product-tile-cur">{currency}</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal d'édition */}
      <ProductModal 
        open={!!editingProduct}
        onClose={() => setEditingProduct(null)}
        availableIngredients={availableIngredients}
        productToEdit={editingProduct ?? undefined}
        onSuccess={() => {
          setEditingProduct(null)
          router.refresh()
        }}
      />
      {/* Modal de Confirmation de Suppression */}
      {productToDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div 
            style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(45,27,14,0.6)', backdropFilter: 'blur(4px)' }} 
            onClick={() => setProductToDelete(null)}
          />
          <div className="animate-scale-in" style={{
            position: 'relative', width: '100%', maxWidth: '400px', background: 'white', 
            borderRadius: '24px', padding: '32px', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(45,27,14,0.15)'
          }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '32px', background: 'var(--color-badge-danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--color-error)' }}>
              <Trash2 size={32} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)', marginBottom: '12px' }}>Supprimer le produit ?</h3>
            <p style={{ color: 'var(--color-muted)', marginBottom: '32px', lineHeight: 1.5 }}>
              Êtes-vous sûr de vouloir supprimer <strong>{productToDelete.name}</strong> ? Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setProductToDelete(null)}
                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1.5px solid var(--color-caisse-border)', background: 'white', color: 'var(--color-muted)', fontWeight: 700, cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button 
                onClick={handleDelete}
                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: 'var(--color-error)', color: 'white', fontWeight: 700, cursor: 'pointer' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
