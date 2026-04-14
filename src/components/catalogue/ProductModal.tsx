'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { productSchema, ProductFormValues } from '@/lib/schemas/product'
import { createProduct } from '@/lib/actions/products'
import { Trash2, Loader2, X, Search, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import TouchInput from '@/components/ui/TouchInput'
import TouchSelect from '@/components/ui/TouchSelect'
import { compressImage } from '@/lib/utils/image-compression'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import ImageCropper from '@/components/ui/ImageCropper'

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
  const [searchQuery, setSearchQuery] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageToCrop, setImageToCrop] = useState<string | null>(null)

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
      // Pre-fill existing image preview
      if (productToEdit.image_url) setImagePreview(productToEdit.image_url)
    }
  }, [productToEdit, open, reset])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        setImageToCrop(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleCropComplete = (croppedBlob: Blob) => {
    const file = new File([croppedBlob], 'product-image.webp', { type: 'image/webp' })
    setImageFile(file)
    setImagePreview(URL.createObjectURL(croppedBlob))
    setImageToCrop(null)
  }

  const handleCropCancel = () => {
    setImageToCrop(null)
  }

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
      let finalImageUrl: string | null | undefined

      if (imageFile) {
        try {
          const compressed = await compressImage(imageFile, { maxWidth: 800, quality: 0.75 })
          const supabase = createSupabaseClient()
          const filePath = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
          const { error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(filePath, compressed, { contentType: 'image/webp', upsert: true })
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(filePath)
            finalImageUrl = urlData.publicUrl
          } else {
            toast.error('Upload de la photo échoué — produit enregistré sans image.')
          }
        } catch {
          // continue without image
        }
      } else if (imagePreview && productToEdit?.image_url) {
        // Keep existing image if no new file was selected
        finalImageUrl = productToEdit.image_url
      } else if (productToEdit?.image_url && !imagePreview) {
        // User explicitly removed the photo → clear it in DB
        finalImageUrl = null
      }

      const res = await createProduct(data, finalImageUrl)
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
          
          {/* Barre de Recherche Intelligente */}
          {!productToEdit && (
            <div style={{ marginBottom: '24px', position: 'relative' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-rose-dark)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                {productId ? 'Produit sélectionné' : 'Identification du produit'}
              </label>
              <div style={{ position: 'relative' }}>
                <input 
                  {...register('name')}
                  value={productId ? watch('name') : searchQuery}
                  onChange={(e) => {
                    const val = e.target.value
                    if (!productId) {
                      setSearchQuery(val)
                      setValue('name', val)
                    }
                  }}
                  placeholder="Nom du produit (existants ou nouveau...)"
                  readOnly={!!productId}
                  style={{ 
                    width: '100%', padding: '16px 16px 16px 44px', borderRadius: '16px', 
                    border: errors.name ? '1.5px solid #D94F38' : (productId ? '2px solid var(--color-rose-dark)' : '1.5px solid var(--color-border)'), 
                    background: productId ? '#FFF5F5' : 'var(--color-cream)', fontSize: '1rem', fontWeight: 700, outline: 'none',
                    transition: 'all 0.2s'
                  }} 
                />
                {productId ? (
                   <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.2rem' }}>💎</div>
                ) : (
                  <Search size={20} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-rose-dark)' }} />
                )}
                
                {productId && (
                  <button 
                    type="button" 
                    onClick={() => {
                        reset({ id: undefined, name: '', currentStock: 0, type: 'maison', trackStock: false, sellingPrice: 0 })
                        setSearchQuery('')
                    }}
                    style={{ 
                      position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                      fontSize: '0.7rem', color: 'var(--color-rose-dark)', border: 'none', background: 'white', 
                      cursor: 'pointer', fontWeight: 800, padding: '4px 8px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    ANNULER
                  </button>
                )}
              </div>
              
              {/* Résultats de recherche instantanés */}
              {!productId && filteredExisting.length > 0 && (
                <div style={{ 
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: '4px',
                  border: '1.px solid var(--color-border)', borderRadius: '16px', background: '#fff', 
                  boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', animation: 'fadeInDown 0.2s ease'
                }}>
                  <div style={{ padding: '8px 16px', background: '#F9FAFB', borderBottom: '1px solid #f0f0f0', fontSize: '0.65rem', fontWeight: 800, color: 'var(--color-muted)' }}>PRODUITS EXISTANTS</div>
                  {filteredExisting.map(p => (
                    <div 
                      key={p.id} 
                      onClick={() => selectExistingProduct(p)}
                      style={{ padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={(e: any) => e.currentTarget.style.background = 'var(--color-cream)'}
                      onMouseLeave={(e: any) => e.currentTarget.style.background = '#fff'}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{p.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{p.category}</div>
                      </div>
                      <div style={{ background: 'var(--color-rose-dark)', color: 'white', padding: '4px 10px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 900 }}>SÉLECTIONNER</div>
                    </div>
                  ))}
                </div>
              )}

              {errors.name && <span style={{ fontSize: '0.7rem', color: '#D94F38', fontWeight: 600, marginTop: '4px', display: 'block' }}>{errors.name.message}</span>}
            </div>
          )}

          <form id="product-form" onSubmit={handleSubmit(handleFormSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Si on est en mode édition, on affiche juste le nom en lecture seule stylisé */}
            {productToEdit && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Identification</label>
                <input 
                  {...register('name')} 
                  readOnly
                  style={{ 
                    width: '100%', padding: '16px', borderRadius: '16px', border: '1.5px solid var(--color-border)', 
                    background: '#F3F4F6', fontSize: '1rem', fontWeight: 700, outline: 'none' 
                  }} 
                />
              </div>
            )}

            {/* Category Select */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Catégorie de vente</label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <TouchSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: 'Gâteaux', label: '🎂 Gâteaux' },
                      { value: 'Viennoiseries', label: '🥐 Viennoiseries' },
                      { value: 'Petits fours', label: '🍪 Petits fours' },
                      { value: 'Boissons', label: '🧃 Boissons' },
                      { value: 'Autres', label: '📦 Autres' },
                    ]}
                    title="Catégorie de vente"
                    placeholder="Sélectionner une catégorie..."
                    style={{ 
                      background: (productId && !productToEdit) ? '#F3F4F6' : 'var(--color-cream)',
                    }}
                  />
                )}
              />
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

            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Prix de vente</label>
              <Controller
                control={control}
                name="sellingPrice"
                render={({ field }) => (
                  <TouchInput
                    value={field.value?.toString() || '0'}
                    onChange={(val) => field.onChange(parseFloat(val) || 0)}
                    allowDecimal={true}
                    title="Prix de vente"
                    placeholder="0.00"
                    style={{ 
                        background: (productId && !productToEdit) ? '#F3F4F6' : 'var(--color-cream)',
                        fontSize: '1.5rem',
                        fontWeight: 900
                    }}
                  />
                )}
              />
              {errors.sellingPrice && <span style={{ fontSize: '0.7rem', color: '#D94F38', fontWeight: 600, marginTop: '4px', display: 'block' }}>{errors.sellingPrice.message}</span>}
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
                  <Controller
                    control={control}
                    name="currentStock"
                    render={({ field }) => (
                      <TouchInput
                        value={field.value?.toString() || '0'}
                        onChange={(val) => field.onChange(parseFloat(val) || 0)}
                        allowDecimal={true}
                        title="Stock actuel"
                        placeholder="0.0"
                      />
                    )}
                  />
                  {errors.currentStock && <span style={{ fontSize: '0.7rem', color: '#D94F38', fontWeight: 600 }}>{errors.currentStock.message}</span>}
                  {productId && !productToEdit && <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)', fontWeight: 500, margin: 0 }}>Cette quantité sera ajoutée au stock existant dans le catalogue.</p>}
                </div>
              )}
            </div>

            {/* === PHOTO DU PRODUIT === */}
            {(!productId || productToEdit) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                  Photo du produit (optionnel)
                </label>
                <label style={{ cursor: 'pointer', display: 'block' }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                  {imagePreview ? (
                    <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', aspectRatio: '4/3' }}>
                      <img 
                        src={imagePreview} 
                        alt="Prévisualisation" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{
                        position: 'absolute', bottom: '10px', right: '10px',
                        background: 'rgba(0,0,0,0.55)', color: 'white',
                        borderRadius: '10px', padding: '5px 12px',
                        fontSize: '0.72rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: '5px'
                      }}>
                        <ImageIcon size={13} /> Changer la photo
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      border: '2px dashed var(--color-border)',
                      borderRadius: '16px',
                      padding: '28px 16px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                      background: 'var(--color-cream)',
                      color: 'var(--color-muted)',
                      transition: 'all 0.2s'
                    }}>
                      <ImageIcon size={32} style={{ opacity: 0.4 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Ajouter une photo du produit</span>
                      <span style={{ fontSize: '0.7rem' }}>JPG, PNG, WebP — Sera compressée automatiquement</span>
                    </div>
                  )}
                </label>
                {imagePreview && (
                  <button type="button" onClick={() => { setImageFile(null); setImagePreview(null) }}
                    style={{ alignSelf: 'flex-start', fontSize: '0.7rem', color: '#D94F38', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 800 }}>
                    Supprimer la photo
                  </button>
                )}
              </div>
            )}

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
                      <Controller
                        control={control}
                        name={`composition.${index}.quantity`}
                        render={({ field }) => (
                          <TouchInput
                            value={field.value?.toString() || '0'}
                            onChange={(val) => field.onChange(parseFloat(val) || 0)}
                            allowDecimal={true}
                            title="Quantité ingrédient"
                            placeholder="Gr"
                            style={{ width: '100px' }}
                          />
                        )}
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
      {/* Image Cropper */}
      {imageToCrop && (
        <ImageCropper
          image={imageToCrop}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          aspect={4/3}
        />
      )}
    </div>,
    document.body
  )
}
