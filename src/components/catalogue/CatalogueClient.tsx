'use client'

import { useState } from 'react'
import { Search, Edit, Trash2, Loader2, Package } from 'lucide-react'
import { deleteProduct } from '@/lib/actions/products'
import { toast } from 'sonner'
import ProductModal from './ProductModal'

interface Product {
  id: string
  name: string
  category: string
  sellingPrice: number
  type: string
  trackStock: boolean
  currentStock?: number
}

interface CatalogueClientProps {
  products: Product[]
  currency: string
  availableIngredients: any[]
}

const CATEGORIES = ['Tous', 'Gâteaux', 'Viennoiseries', 'Petits fours', 'Boissons', 'Autres']

const CATEGORY_ICONS: Record<string, string> = {
  'Gâteaux': '🎂',
  'Viennoiseries': '🥐',
  'Petits fours': '🍪',
  'Boissons': '🧃',
  'Autres': '📦'
}

export default function CatalogueClient({ products, currency, availableIngredients }: CatalogueClientProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Tous')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [productToDelete, setProductToDelete] = useState<{id: string, name: string} | null>(null)

  const filteredProducts = (products || []).filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = activeCategory === 'Tous' || p.category === activeCategory
    return matchesSearch && matchesCategory
  })

  const handleDelete = async () => {
    if (!productToDelete) return
    
    const { id } = productToDelete
    setDeletingId(id)
    setProductToDelete(null)
    
    try {
      const res = await deleteProduct(id)
      if (res.success) {
        toast.success("Produit supprimé")
      } else {
        toast.error(res.error)
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Barre de recherche */}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, paddingLeft: '16px', display: 'flex', alignItems: 'center', pointerEvents: 'none', height: '100%' }}>
          <Search size={20} color="#9C8070" />
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

      {/* Filtres par catégories */}
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
        {CATEGORIES.map(cat => (
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
              border: activeCategory === cat ? 'none' : '1.5px solid var(--color-border)',
              background: activeCategory === cat ? 'var(--color-rose-dark)' : '#fff',
              color: activeCategory === cat ? '#fff' : 'var(--color-muted)',
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '20px'
        }}>
          {filteredProducts.map(product => {
            const isOutOfStock = product.trackStock && (product.currentStock === 0 || product.currentStock === undefined)
            const isDeleting = deletingId === product.id

            return (
              <div 
                key={product.id} 
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  padding: '24px',
                  position: 'relative',
                  opacity: isDeleting ? 0.5 : 1,
                  transition: 'all 0.2s'
                }}
              >
                {/* Actions (Edit / Delete) */}
                <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '4px' }}>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setEditingProduct(product)
                    }}
                    style={{ background: 'var(--color-cream)', border: 'none', width: '32px', height: '32px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-muted)' }}
                  >
                    <Edit size={16} />
                  </button>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setProductToDelete({ id: product.id, name: product.name })
                    }}
                    disabled={isDeleting}
                    style={{ background: '#FEF2F2', border: 'none', width: '32px', height: '32px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#D94F38' }}
                  >
                    {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>

                {/* Icône du produit */}
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '32px',
                  background: 'var(--color-blush)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.75rem',
                  marginBottom: '16px',
                  border: '1.5px solid var(--color-border)'
                }}>
                  {product.type === 'maison' ? CATEGORY_ICONS[product.category] || '🥐' : '📦'}
                </div>
                
                {/* Infos du produit */}
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)', margin: '0 0 4px' }}>{product.name}</h3>
                <p style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--color-rose-dark)', margin: '0 0 12px' }}>
                  {product.sellingPrice.toLocaleString('fr-FR')} {currency}
                </p>
                
                {/* Badge de Stock / Rupture */}
                {product.trackStock && (
                  <span style={{
                    background: isOutOfStock ? '#FEF3C7' : '#ECFDF5',
                    color: isOutOfStock ? '#92400E' : '#065F46',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '6px 14px',
                    borderRadius: '99px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    border: '1px solid',
                    borderColor: isOutOfStock ? '#FDE68A' : '#A7F3D0'
                  }}>
                    {isOutOfStock ? 'Rupture' : `${product.currentStock ?? 0} en stock`}
                  </span>
                )}
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
        productToEdit={editingProduct}
        onSuccess={() => {
          setEditingProduct(null)
          // router.refresh est géré par CatalogueHeader d'habitude, mais ici on est dans Client.
          // On pourrait passer router ici ou juste laisser le revalidatePath faire son taf.
          window.location.reload()
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
            <div style={{ width: '64px', height: '64px', borderRadius: '32px', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#D94F38' }}>
              <Trash2 size={32} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2D1B0E', marginBottom: '12px' }}>Supprimer le produit ?</h3>
            <p style={{ color: '#9C8070', marginBottom: '32px', lineHeight: 1.5 }}>
              Êtes-vous sûr de vouloir supprimer <strong>{productToDelete.name}</strong> ? Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setProductToDelete(null)}
                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1.5px solid #FDE8DB', background: 'white', color: '#9C8070', fontWeight: 700, cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button 
                onClick={handleDelete}
                style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#D94F38', color: 'white', fontWeight: 700, cursor: 'pointer' }}
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
