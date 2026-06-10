'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { productSchema, ProductFormValues } from '@/lib/schemas/product'
import { createProduct } from '@/lib/actions/products'
import { Trash2, Loader2, X, Search, Image as ImageIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
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
  productToEdit?: {
    id?: string
    name?: string
    category?: string
    type?: string
    sellingPrice?: number
    purchaseCost?: number
    trackStock?: boolean
    currentStock?: number
    composition?: Array<{ ingredientId: string; quantity: number }>
    image_url?: string | null
  }
  onSuccess?: () => void
}

export default function ProductModal({ open, onClose, availableIngredients, existingProducts = [], productToEdit, onSuccess }: ProductModalProps) {
  const queryClient = useQueryClient()
  const [isMounted, setIsMounted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageToCrop, setImageToCrop] = useState<string | null>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // Les valeurs venant de la DB sont des strings — on caste vers le type enum attendu
        category: productToEdit.category as ProductFormValues['category'],
        type: productToEdit.type as ProductFormValues['type'],
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
        queryClient.invalidateQueries({ queryKey: ['catalog'] })
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

  const isStockOnly = !!productId && !productToEdit
  const locked = isStockOnly // champs verrouillés en mode stock uniquement

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(45,27,14,0.45)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      <div style={{
        position: 'relative', zIndex: 101, width: '100%', maxWidth: '520px',
        background: 'var(--color-lift)', borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'scaleIn 0.25s ease'
      }}>

        {/* Header compact */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1.5px solid var(--color-border)',
        }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
            {productToEdit ? 'Modifier le produit' : (productId ? 'Mettre à jour le stock' : 'Nouveau produit')}
          </h2>
          <button onClick={onClose} className="btn-ghost" style={{ minHeight: '36px', padding: '0 10px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Corps défilant */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* Recherche intelligente (mode création) */}
          {!productToEdit && (
            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <label className="label">{productId ? 'Produit sélectionné' : 'Nom du produit'}</label>
              <div style={{ position: 'relative' }}>
                <input
                  {...register('name')}
                  value={productId ? watch('name') : searchQuery}
                  onChange={(e) => {
                    if (!productId) { setSearchQuery(e.target.value); setValue('name', e.target.value) }
                  }}
                  placeholder="Nom du produit (existant ou nouveau…)"
                  readOnly={!!productId}
                  className={`input ${errors.name ? 'has-error' : ''}`}
                  style={{
                    paddingLeft: '40px',
                    borderColor: errors.name ? 'var(--color-error)' : productId ? 'var(--color-primary)' : undefined,
                    background: productId ? '#FDF8F3' : undefined,
                    fontWeight: productId ? 700 : undefined,
                  }}
                />
                {productId
                  ? <span style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '1rem' }}>💎</span>
                  : <Search size={16} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                }
                {productId && (
                  <button type="button"
                    onClick={() => { reset({ id: undefined, name: '', currentStock: 0, type: 'maison', trackStock: false, sellingPrice: 0 }); setSearchQuery('') }}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.68rem', color: 'var(--color-primary)', border: 'none', background: 'white', cursor: 'pointer', fontWeight: 800, padding: '3px 8px', borderRadius: '8px' }}
                  >
                    ANNULER
                  </button>
                )}
              </div>
              {!productId && filteredExisting.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: '4px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: '#fff', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
                  <div style={{ padding: '6px 12px', background: 'var(--color-cream, #F5EEE4)', borderBottom: '1px solid var(--color-border)', fontSize: '0.65rem', fontWeight: 800, color: 'var(--color-muted)' }}>PRODUITS EXISTANTS</div>
                  {filteredExisting.map(p => (
                    <div key={p.id} onClick={() => selectExistingProduct(p)}
                      style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={(e: any) => e.currentTarget.style.background = '#FDF8F3'}
                      onMouseLeave={(e: any) => e.currentTarget.style.background = '#fff'}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{p.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{p.category}</div>
                      </div>
                      <div style={{ background: 'var(--color-primary)', color: 'white', padding: '3px 10px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 800 }}>CHOISIR</div>
                    </div>
                  ))}
                </div>
              )}
              {errors.name && <span style={{ fontSize: '0.72rem', color: 'var(--color-error)', fontWeight: 600, marginTop: '4px', display: 'block' }}>{errors.name.message}</span>}
            </div>
          )}

          <form 
            id="product-form" 
            onSubmit={handleSubmit(
              handleFormSubmit,
              (errs) => {
                console.warn('Form validation errors:', errs)
                toast.error("Veuillez remplir correctement tous les champs obligatoires.")
              }
            )} 
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >

            {/* Nom en lecture seule (mode édition) */}
            {productToEdit && (
              <div>
                <label className="label">Nom</label>
                <input {...register('name')} readOnly className="input" style={{ background: '#F3F4F6', fontWeight: 700 }} />
              </div>
            )}

            {/* Catégorie + Type en grille 2 colonnes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className="label">Catégorie</label>
                <Controller control={control} name="category"
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
                      placeholder="Catégorie…"
                      style={{ background: locked ? '#F3F4F6' : undefined }}
                      hasError={!!errors.category}
                    />
                  )}
                />
                {errors.category && <span style={{ fontSize: '0.72rem', color: 'var(--color-error)', fontWeight: 600 }}>{errors.category.message}</span>}
              </div>

              <div>
                <label className="label">Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', height: '44px' }}>
                  {[
                    { val: 'maison', emoji: '👨‍🍳', label: 'Maison' },
                    { val: 'revente', emoji: '📦', label: 'Revente' },
                  ].map(({ val, emoji, label }) => (
                    <button key={val} type="button" disabled={locked}
                      onClick={() => setValue('type', val as any)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        borderRadius: 'var(--radius-sm)', border: '1.5px solid',
                        borderColor: type === val ? 'var(--color-primary)' : 'var(--color-border)',
                        background: type === val ? '#FDE8E0' : locked ? '#F3F4F6' : 'var(--color-lift)',
                        cursor: locked ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem', fontWeight: 700, height: '100%',
                        color: type === val ? 'var(--color-primary)' : 'var(--color-muted)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span>{emoji}</span>{label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Prix de vente + Suivi stock sur la même ligne */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
              <div>
                <label className="label">Prix de vente (FCFA)</label>
                <Controller control={control} name="sellingPrice"
                  render={({ field }) => (
                    <TouchInput
                      value={field.value?.toString() || '0'}
                      onChange={(val) => field.onChange(parseFloat(val) || 0)}
                      allowDecimal={true}
                      title="Prix de vente"
                      placeholder="0"
                      style={{ background: locked ? '#F3F4F6' : undefined, fontSize: '1.1rem', fontWeight: 800 }}
                      hasError={!!errors.sellingPrice}
                    />
                  )}
                />
                {errors.sellingPrice && <span style={{ fontSize: '0.72rem', color: 'var(--color-error)', fontWeight: 600, marginTop: '2px', display: 'block' }}>{errors.sellingPrice.message}</span>}
              </div>

              {/* Toggle stock compact */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', paddingBottom: '2px' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Stock</span>
                <button type="button" disabled={locked}
                  onClick={() => setValue('trackStock', !trackStock)}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px',
                    background: trackStock ? 'var(--color-primary)' : '#D1D5DB',
                    position: 'relative', border: 'none', cursor: locked ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <div style={{ position: 'absolute', top: '2px', left: trackStock ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '10px', background: '#fff', transition: 'left 0.2s' }} />
                </button>
              </div>
            </div>

            {/* Coût d'achat (pour les produits de revente) */}
            {type === 'revente' && (
              <div>
                <label className="label">Coût d'achat (FCFA)</label>
                <Controller control={control} name="purchaseCost"
                  render={({ field }) => (
                    <TouchInput
                      value={field.value?.toString() || '0'}
                      onChange={(val) => field.onChange(parseFloat(val) || 0)}
                      allowDecimal={true}
                      title="Coût d'achat"
                      placeholder="0"
                      style={{ background: locked ? '#F3F4F6' : undefined }}
                      hasError={!!errors.purchaseCost}
                    />
                  )}
                />
                {errors.purchaseCost && <span style={{ fontSize: '0.72rem', color: 'var(--color-error)', fontWeight: 600, marginTop: '2px', display: 'block' }}>{errors.purchaseCost.message}</span>}
              </div>
            )}

            {/* Quantité en stock */}
            {trackStock && (
              <div>
                <label className="label">
                  {productToEdit ? 'Stock actuel (réajustement)' : isStockOnly ? 'Quantité additionnelle' : 'Stock initial'}
                </label>
                <Controller control={control} name="currentStock"
                  render={({ field }) => (
                    <TouchInput
                      value={field.value?.toString() || '0'}
                      onChange={(val) => field.onChange(parseFloat(val) || 0)}
                      allowDecimal={true}
                      title="Stock"
                      placeholder="0"
                      hasError={!!errors.currentStock}
                    />
                  )}
                />
                {isStockOnly && <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', margin: '4px 0 0' }}>Sera ajouté au stock existant.</p>}
                {errors.currentStock && <span style={{ fontSize: '0.72rem', color: 'var(--color-error)', fontWeight: 600 }}>{errors.currentStock.message}</span>}
              </div>
            )}

            {/* Photo du produit (compact) */}
            {(!isStockOnly) && (
              <div>
                <label className="label">Photo <span style={{ fontWeight: 400, color: 'var(--color-muted)', fontSize: '0.78rem' }}>(optionnel)</span></label>
                <label style={{ cursor: 'pointer', display: 'block' }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                  {imagePreview ? (
                    <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', height: '120px' }}>
                      <img src={imagePreview} alt="Prévisualisation" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.55)', color: 'white', borderRadius: '8px', padding: '4px 10px', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ImageIcon size={12} /> Changer
                      </div>
                    </div>
                  ) : (
                    <div style={{ border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-well, #F5EEE4)', color: 'var(--color-muted)', transition: 'all 0.2s' }}>
                      <ImageIcon size={22} style={{ opacity: 0.4, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>Ajouter une photo</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>JPG, PNG, WebP — compressée auto</div>
                      </div>
                    </div>
                  )}
                </label>
                {imagePreview && (
                  <button type="button" onClick={() => { setImageFile(null); setImagePreview(null) }}
                    style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--color-error)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700 }}>
                    Supprimer la photo
                  </button>
                )}
              </div>
            )}

            {/* Composition ingrédients (Fait Maison, compact) */}
            {(!isStockOnly) && type === 'maison' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--color-well, #F5EEE4)', padding: '12px', borderRadius: 'var(--radius-md)', border: `1.5px solid ${errors.composition ? 'var(--color-error)' : 'var(--color-border)'}` }}>
                <label className="label" style={{ margin: 0 }}>Composition <span style={{ fontWeight: 400, color: 'var(--color-muted)', fontSize: '0.78rem' }}>(optionnel)</span></label>
                {fields.map((field, index) => (
                  <div key={field.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <select {...register(`composition.${index}.ingredientId`)} className={`input ${errors.composition?.[index]?.ingredientId ? 'has-error' : ''}`} style={{ flex: 1, padding: '10px 12px', fontSize: '0.82rem' }}>
                      <option value="">Choisir…</option>
                      {availableIngredients.map(ing => (
                        <option key={ing.id} value={ing.id}>{ing.name}</option>
                      ))}
                    </select>
                    <Controller control={control} name={`composition.${index}.quantity`}
                      render={({ field }) => (
                        <TouchInput
                          value={field.value?.toString() || '0'}
                          onChange={(val) => field.onChange(parseFloat(val) || 0)}
                          allowDecimal={true}
                          title="Qté (g)"
                          placeholder="Gr"
                          style={{ width: '90px' }}
                          hasError={!!errors.composition?.[index]?.quantity}
                        />
                      )}
                    />
                    <button type="button" onClick={() => remove(index)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', padding: '6px', flexShrink: 0 }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => append({ ingredientId: '', quantity: 0 })}
                  style={{ width: '100%', padding: '10px', border: '1.5px dashed var(--color-primary)', background: 'none', color: 'var(--color-primary)', fontWeight: 700, borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.78rem' }}
                >
                  + Ajouter un ingrédient
                </button>
                {errors.composition && <span style={{ fontSize: '0.72rem', color: 'var(--color-error)', fontWeight: 600 }}>{errors.composition.message}</span>}
              </div>
            )}
          </form>
        </div>

        {/* Footer compact */}
        <div style={{ padding: '12px 20px', borderTop: '1.5px solid var(--color-border)', display: 'flex', gap: '10px' }}>
          <button onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>Annuler</button>
          <button type="submit" form="product-form" disabled={isSubmitting} className="btn-primary" style={{ flex: 2 }}>
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSubmitting ? 'Enregistrement…' : isStockOnly ? 'Mettre à jour le stock' : productToEdit ? 'Enregistrer' : 'Ajouter au catalogue'}
          </button>
        </div>
      </div>

      {imageToCrop && (
        <ImageCropper image={imageToCrop} onCropComplete={handleCropComplete} onCancel={handleCropCancel} aspect={4/3} />
      )}
    </div>,
    document.body
  )
}
