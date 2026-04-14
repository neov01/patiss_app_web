'use server'

import { createClient } from '@/lib/supabase/server'
import { productSchema, ProductFormValues } from '@/lib/schemas/product'
import { revalidatePath } from 'next/cache'

export async function createProduct(data: ProductFormValues, imageUrl?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Non authentifié' }

  try {
    const valid = productSchema.parse(data)
    
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    const orgId = profile?.organization_id
    if (!orgId) return { success: false, error: 'Organisation non trouvée' }

    if (valid.id) {
      // UPDATE existing product
      let newStock = valid.currentStock || 0

      // Si le mode est "increment", on récupère d'abord le produit pour connaître son stock actuel
      if (valid.updateMode === 'increment') {
        const { data: existing } = await supabase.from('products').select('current_stock').eq('id', valid.id).single()
        newStock = (existing?.current_stock || 0) + (valid.currentStock || 0)
      }

      const { data: product, error: pError } = await supabase.from('products').update({
        name: valid.name,
        category: valid.category,
        type: valid.type,
        selling_price: valid.sellingPrice,
        purchase_cost: valid.purchaseCost,
        track_stock: valid.trackStock,
        current_stock: newStock,
        ...(imageUrl !== undefined && { image_url: imageUrl })
      }).eq('id', valid.id).select().single()

      if (pError) throw new Error(pError.message)

      // Update composition if provided (on remplace l'ancienne)
      if (valid.type === 'maison' && valid.id) {
        // Optionnel : On supprime l'ancienne composition d'abord
        await supabase.from('product_ingredients').delete().eq('product_id', valid.id)
        
        if (valid.composition && valid.composition.length > 0) {
          const productId = valid.id // narrowing
          const ingredientsToInsert = valid.composition.map(item => ({
            product_id: productId,
            ingredient_id: item.ingredientId,
            quantity: item.quantity
          }))
          const { error: iError } = await supabase.from('product_ingredients').insert(ingredientsToInsert)
          if (iError) throw new Error(iError.message)
        }
      }

      revalidatePath('/catalogue')
      return { success: true, id: valid.id, message: "Produit mis à jour !" }

    } else {
      // INSERT new product
      const { data: product, error: pError } = await supabase.from('products').insert({
        organization_id: orgId,
        name: valid.name,
        category: valid.category,
        type: valid.type,
        selling_price: valid.sellingPrice,
        purchase_cost: valid.purchaseCost,
        track_stock: valid.trackStock,
        current_stock: valid.currentStock,
        image_url: imageUrl || null
      }).select().single()

      if (pError) throw new Error(pError.message)

      // Insertion composition si 'maison'
      if (valid.type === 'maison' && valid.composition && valid.composition.length > 0) {
        const productId = product.id
        const ingredientsToInsert = valid.composition.map(item => ({
          product_id: productId,
          ingredient_id: item.ingredientId,
          quantity: item.quantity
        }))

        const { error: iError } = await supabase.from('product_ingredients').insert(ingredientsToInsert)
        if (iError) throw new Error(iError.message)
      }

      revalidatePath('/catalogue')
      return { success: true, id: product.id, message: "Produit ajouté au catalogue !" }
    }

  } catch (error: any) {
    console.error('Action error:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteProduct(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Non authentifié' }

  try {
    // Delete composition (on cascade normally but let's be explicit)
    await supabase.from('product_ingredients').delete().eq('product_id', id)
    
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw new Error(error.message)

    revalidatePath('/catalogue')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
