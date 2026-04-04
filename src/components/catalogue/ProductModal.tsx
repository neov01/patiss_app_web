'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { productSchema, ProductFormValues } from '@/lib/schemas/product'
import { createProduct } from '@/lib/actions/products'
import { Trash2, Calculator, Loader2, X, Search } from 'lucide-react'
import { toast } from 'sonner'

interface ProductModalProps {
  open: boolean
  onClose: () => void
  availableIngredients: Array<{
    id: string
    name: string
    unit: string
    selling_price?: number
    price_per_kg?: number
  }>
  existingProducts?: Array<{
    id: string
    name: string
    category: string
    type: string
    selling_price: number
    purchase_cost?: number
    track_stock: boolean
    current_stock: number
  }>
  productToEdit?: any
  onSuccess?: () => void
}

export default function ProductModal({ open, onClose, availableIngredients, existingProducts = [], productToEdit, onSuccess }: ProductModalProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDigicode, setShowDigicode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const { register, control, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema) as any,
    defaultValues: { type: 'maison', trackStock: false, sellingPrice: 0, composition: [], updateMode: 'increment' }
  })

  // Pre-fill if editing
  useEffect(() => {
    if (productToEdit && open) {
      reset({
        id: productToEdit.id,
        name: productToEdit.name,
        category: productToEdit.category,
        type: productToEdit.type,
        sellingPrice: productToEdit.sellingPrice,
        purchaseCost: productToEdit.purchaseCost,
        trackStock: productToEdit.trackStock,
        currentStock: productToEdit.currentStock,
        composition: productToEdit.composition || [],
        updateMode: 'set'
      })
    }
  }, [productToEdit, open, reset])

  const { fields, append, remove } = useFieldArray({ control, name: "composition" })
  const [type, sellingPrice, purchaseCost, composition, trackStock, productId] = useWatch({
    control, name: ['type', 'sellingPrice', 'purchaseCost', 'composition', 'trackStock', 'id']
  })

  const foodCost = useMemo(() => {
    if (type !== 'maison' || !composition) return 0
    return composition.reduce((sum: number, line: any) => {
      const ing = availableIngredients.find(i => i.id === line.ingredientId)
      return sum + (line.quantity && ing?.price_per_kg ? (line.quantity / 1000) * ing.price_per_kg : 0)
    }, 0)
  }, [type, composition, availableIngredients])

  const cost = type === 'revente' ? (purchaseCost ?? 0) : foodCost
  const marge = (sellingPrice ?? 0) - cost
  const rentabilite = sellingPrice > 0 ? (marge / sellingPrice) * 100 : 0

  const handleDigit = (n: number) => setValue('sellingPrice', (sellingPrice || 0) * 10 + n)
  const handleBackspace = () => setValue('sellingPrice', Math.floor((sellingPrice || 0) / 10))

  const filteredExisting = useMemo(() => {
    if (searchQuery.length < 2) return []
    return existingProducts.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 5)
  }, [searchQuery, existingProducts])

  const selectExistingProduct = (p: any) => {
    reset({
      id: p.id,
      name: p.name,
      category: p.category as any,
      type: p.type as any,
      sellingPrice: p.selling_price,
      purchaseCost: p.purchase_cost,
      trackStock: p.track_stock,
      currentStock: 0, // Reset for addition
      composition: [],
      updateMode: 'increment'
    })
    setSearchQuery('')
    toast.info(`Produit "${p.name}" sélectionné pour mise à jour du stock`)
  }

  const handleFormSubmit = async (data: ProductFormValues) => {
    setIsSubmitting(true)
    try {
      const res = await createProduct(data)
      if (res.success) { 
        toast.success(res.message || "Opération réussie !"); 
        onSuccess?.(); 
        onClose(); 
      } else {
        toast.error(res.error)
      }
    } finally { 
      setIsSubmitting(false) 
    }
  }

  if (!open || !isMounted) return null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div 
        style={{ position: 'absolute', inset: 0, background: 'rgba(45,27,14,0.4)', backdropFilter: 'blur(8px)' }} 
        onClick={onClose} 
      />
      
      <div style={{ 
        position: 'relative', 
        zIndex: 101, 
        width: '100%', 
        maxWidth: '640px', 
        backgroundColor: '#fff', 
        borderRadius: '32px', 
        boxShadow: 'var(--shadow-lg)',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'scaleIn 0.3s ease'
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: '24px', 
          borderBottom: '1.5px solid var(--color-border)',
          background: '#fff'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--color-text)', margin: 0, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
            {productToEdit ? 'Modifier le produit' : (productId ? 'Mettre à jour le stock' : 'Nouveau Produit')}
          </h2>
          <button 
            onClick={onClose} 
            style={{ border: 'none', background: 'var(--color-cream)', width: '36px', height: '36px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={20} color="var(--color-text)" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          
          {/* Recherche de produit existant */}
          {!productId && !productToEdit && (
            <div style={{ marginBottom: '24px', borderBottom: '1px dashed var(--color-border)', paddingBottom: '24px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-rose-dark)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Rechercher dans le catalogue</label>
              <div style={{ position: 'relative' }}>
                <input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ex: Croissant..."
                  style={{ 
                    width: '100%', padding: '12px 12px 12px 40px', borderRadius: '12px', border: '1.5px solid var(--color-rose-dark)', 
                    background: '#FFF5F5', fontSize: '0.9rem', fontWeight: 700, outline: 'none' 
                  }} 
                />
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-rose-dark)' }} />
              </div>
              
              {filteredExisting.length > 0 && (
                <div style={{ marginTop: '8px', border: '1px solid var(--color-border)', borderRadius: '12px', background: '#fff', overflow: 'hidden' }}>
                  {filteredExisting.map(p => (
                    <div 
                      key={p.id} 
                      onClick={() => selectExistingProduct(p)}
                      style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={(e: any) => e.currentTarget.style.background = 'var(--color-cream)'}
                      onMouseLeave={(e: any) => e.currentTarget.style.background = '#fff'}
                    >
                      <span style={{ fontWeight: 700 }}>{p.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{p.category}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <form id="product-form" onSubmit={handleSubmit(handleFormSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Nom */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Identification</label>
              <input 
                {...register('name')} 
                placeholder="Nom du produit (ex: Croissant Pur Beurre)" 
                readOnly={!!productId && !productToEdit}
                style={{ 
                  width: '100%', padding: '16px', borderRadius: '16px', border: errors.name ? '1.5px solid #D94F38' : '1.5px solid var(--color-border)', 
                  background: (productId && !productToEdit) ? '#F3F4F6' : 'var(--color-cream)', fontSize: '1rem', fontWeight: 700, outline: 'none' 
                }} 
              />
              {errors.name && <span style={{ fontSize: '0.7rem', color: '#D94F38', fontWeight: 600 }}>{errors.name.message}</span>}
              {productId && !productToEdit && <button type="button" onClick={() => reset({ id: undefined, name: '', currentStock: 0 })} style={{ alignSelf: 'flex-start', fontSize: '0.7rem', color: 'var(--color-rose-dark)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 800 }}>Changer de produit / Nouveau</button>}
            </div>

            {/* Category Select */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Catégorie de vente</label>
              <select 
                {...register('category')} 
                disabled={!!productId && !productToEdit}
                style={{ 
                  width: '100%', padding: '16px', borderRadius: '16px', border: '1.5px solid var(--color-border)', 
                  background: (productId && !productToEdit) ? '#F3F4F6' : 'var(--color-cream)', fontSize: '0.95rem', fontWeight: 700, outline: 'none' 
                }}
              >
                <option value="">Sélectionner une catégorie...</option>
                <option value="Gâteaux">🎂 Gâteaux</option>
                <option value="Viennoiseries">🥐 Viennoiseries</option>
                <option value="Petits fours">🍪 Petits fours</option>
                <option value="Boissons">🧃 Boissons</option>
                <option value="Autres">📦 Autres</option>
              </select>
              {errors.category && <span style={{ fontSize: '0.7rem', color: '#D94F38', fontWeight: 600 }}>{errors.category.message}</span>}
            </div>

            {/* Type de Production */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Type de produit</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button 
                  type="button" 
                  disabled={!!productId && !productToEdit}
                  onClick={() => setValue('type', 'maison')}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px',
                    borderRadius: '16px', border: type === 'maison' ? '2px solid var(--color-rose-dark)' : '1.5px solid var(--color-border)',
                    background: type === 'maison' ? 'var(--color-blush)' : ((productId && !productToEdit) ? '#F3F4F6' : '#fff'), cursor: (productId && !productToEdit) ? 'not-allowed' : 'pointer'
                  }}
                >
                  <span style={{ fontSize: '1.75rem' }}>👨‍🍳</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>Fait Maison</span>
                </button>
                <button 
                  type="button" 
                  disabled={!!productId && !productToEdit}
                  onClick={() => setValue('type', 'revente')}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px',
                    borderRadius: '16px', border: type === 'revente' ? '2px solid var(--color-rose-dark)' : '1.5px solid var(--color-border)',
                    background: type === 'revente' ? 'var(--color-blush)' : ((productId && !productToEdit) ? '#F3F4F6' : '#fff'), cursor: (productId && !productToEdit) ? 'not-allowed' : 'pointer'
                  }}
                >
                  <span style={{ fontSize: '1.75rem' }}>📦</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>Achat-Revente</span>
                </button>
              </div>
            </div>

            {/* Prix de Vente */}
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Prix de vente</label>
              <div style={{ position: 'relative' }}>
                <input 
                  readOnly 
                  value={sellingPrice || ''} 
                  placeholder="0"
                  onClick={() => (!productId || productToEdit) && setShowDigicode(!showDigicode)}
                  style={{ 
                    width: '100%', padding: '20px 20px 20px 52px', borderRadius: '16px', border: errors.sellingPrice ? '1.5px solid #D94F38' : '1.5px solid var(--color-border)', 
                    background: (productId && !productToEdit) ? '#F3F4F6' : 'var(--color-cream)', fontSize: '1.75rem', fontWeight: 900, textAlign: 'right', cursor: (productId && !productToEdit) ? 'default' : 'pointer' 
                  }} 
                />
                <Calculator size={24} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-rose-dark)' }} />
              </div>
              {errors.sellingPrice && <span style={{ fontSize: '0.7rem', color: '#D94F38', fontWeight: 600, marginTop: '4px', display: 'block' }}>{errors.sellingPrice.message}</span>}
              
              {(!productId || productToEdit) && showDigicode && (
                <div style={{ marginTop: '12px', background: '#F3F4F6', padding: '12px', borderRadius: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[1,2,3,4,5,6,7,8,9,0].map(n => (
                    <button key={n} type="button" onClick={() => handleDigit(n)} style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: 'none', fontSize: '1.15rem', fontWeight: 800 }}>{n}</button>
                  ))}
                  <button type="button" onClick={handleBackspace} style={{ background: '#FEE2E2', color: '#D94F38', padding: '16px', borderRadius: '12px', border: 'none', fontSize: '1.15rem', fontWeight: 800 }}>⌫</button>
                  <button type="button" onClick={() => setShowDigicode(false)} style={{ background: 'var(--color-rose-dark)', color: '#fff', padding: '16px', borderRadius: '12px', border: 'none', fontSize: '1rem', fontWeight: 800 }}>OK</button>
                </div>
              )}
            </div>

            {/* Suivi Stock et Quantité */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '16px', 
                borderRadius: '16px', 
                border: '1.5px solid var(--color-border)', 
                background: (productId && !productToEdit) ? '#F3F4F6' : 'var(--color-cream)' 
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800 }}>{productId ? 'Suivi des stocks activé' : 'Suivre les stocks'}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Gère l&apos;affichage Rupture à la caisse</div>
                </div>
                <button 
                  type="button" 
                  disabled={!!productId && !productToEdit}
                  onClick={() => setValue('trackStock', !trackStock)}
                  style={{ 
                    width: '48px', height: '24px', borderRadius: '12px', 
                    background: trackStock ? 'var(--color-rose-dark)' : '#D1D5DB',
                    position: 'relative', border: 'none', cursor: (productId && !productToEdit) ? 'not-allowed' : 'pointer', transition: 'all 0.2s'
                  }}
                >
                  <div style={{ 
                    position: 'absolute', top: '2px', left: trackStock ? '26px' : '2px',
                    width: '20px', height: '20px', borderRadius: '10px', background: '#fff', transition: 'all 0.2s'
                  }} />
                </button>
              </div>

              {trackStock && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                    {productToEdit ? 'Stock Actuel (Réajustement)' : (productId ? 'Quantité Additionnelle Produite' : 'Quantité en stock initial / Fait Maison')}
                  </label>
                  <input 
                    type="number" 
                    {...register('currentStock', { valueAsNumber: true })} 
                    placeholder="0" 
                    style={{ 
                      width: '100%', padding: '16px', borderRadius: '16px', border: errors.currentStock ? '1.5px solid #D94F38' : '1.5px solid var(--color-border)', 
                      background: 'var(--color-cream)', fontSize: '1rem', fontWeight: 700, outline: 'none' 
                    }} 
                  />
                  {errors.currentStock && <span style={{ fontSize: '0.7rem', color: '#D94F38', fontWeight: 600 }}>{errors.currentStock.message}</span>}
                  {productId && !productToEdit && <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)', fontWeight: 500, margin: 0 }}>Cette quantité sera ajoutée au stock existant dans le catalogue.</p>}
                </div>
              )}
            </div>

            {/* Fait Maison : Ingrédients (Optionnel) */}
            {(!productId || productToEdit) && type === 'maison' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#F9FAFB', padding: '16px', borderRadius: '20px', border: errors.composition ? '1.5px solid #D94F38' : '1.5px solid var(--color-border)' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Composition (Ingrédients) - Optionnel</label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {fields.map((field, index) => (
                    <div key={field.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select 
                        {...register(`composition.${index}.ingredientId`)}
                        style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1.5px solid var(--color-border)', fontSize: '0.85rem', fontWeight: 700 }}
                      >
                        <option value="">Choisir...</option>
                        {availableIngredients.map(ing => (
                          <option key={ing.id} value={ing.id}>{ing.name}</option>
                        ))}
                      </select>
                      <input 
                        type="number" 
                        {...register(`composition.${index}.quantity`, { valueAsNumber: true })} 
                        placeholder="Gr" 
                        style={{ width: '80px', padding: '12px', borderRadius: '12px', border: '1.5px solid var(--color-border)', textAlign: 'center', fontWeight: 700 }}
                      />
                      <button 
                        type="button" 
                        onClick={() => remove(index)}
                        style={{ background: 'none', border: 'none', color: '#D94F38', cursor: 'pointer', padding: '8px' }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>

                <button 
                  type="button" 
                  onClick={() => append({ ingredientId: '', quantity: 0 })}
                  style={{ 
                    width: '100%', padding: '12px', border: '2px dashed var(--color-rose-dark)', 
                    background: 'none', color: 'var(--color-rose-dark)', fontWeight: 800, borderRadius: '12px', cursor: 'pointer', fontSize: '0.75rem' 
                  }}
                >
                  + AJOUTER UN INGRÉDIENT
                </button>
                {errors.composition && <span style={{ fontSize: '0.7rem', color: '#D94F38', fontWeight: 600 }}>{errors.composition.message}</span>}
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div style={{ padding: '24px', borderTop: '1.5px solid var(--color-border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <button onClick={onClose} style={{ padding: '16px', background: 'none', border: 'none', fontWeight: 800, color: 'var(--color-muted)', cursor: 'pointer' }}>ANNULER</button>
          <button 
            type="submit" 
            form="product-form"
            disabled={isSubmitting}
            className="btn-primary"
            style={{ width: '100%', fontSize: '0.9rem', fontWeight: 900 }}
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : (productId ? (productToEdit ? 'ENREGISTRER LES MODIFICATIONS' : 'METTRE À JOUR LE STOCK') : 'ENREGISTRER AU CATALOGUE')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
