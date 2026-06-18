'use server'

import { productSchema, ProductFormValues } from '@/lib/schemas/product'
import { revalidatePath } from 'next/cache'
import { AuthContextError, requireOpenSalesSession, requireRoleContext } from '@/lib/auth/organization-context'

const CATALOG_ROLES = ['gerant', 'super_admin']

async function requireCatalogMutationContext() {
  const context = await requireRoleContext(CATALOG_ROLES)
  await requireOpenSalesSession(context)
  return context
}

function getActionError(error: unknown) {
  if (error instanceof AuthContextError) return error.message
  return error instanceof Error ? error.message : 'Erreur inconnue'
}

export async function createProduct(data: ProductFormValues, imageUrl?: string | null) {
  try {
    const valid = productSchema.parse(data)
    const { supabase, organizationId } = await requireCatalogMutationContext()

    if (valid.id) {
      let newStock = valid.currentStock || 0

      if (valid.updateMode === 'increment') {
        const { data: existing } = await supabase
          .from('products')
          .select('current_stock')
          .eq('id', valid.id)
          .eq('organization_id', organizationId)
          .single()
        newStock = (existing?.current_stock || 0) + (valid.currentStock || 0)
      }

      const { error: pError } = await supabase.from('products').update({
        name: valid.name,
        category: valid.category,
        type: valid.type,
        selling_price: valid.sellingPrice,
        purchase_cost: valid.purchaseCost,
        track_stock: valid.trackStock,
        current_stock: newStock,
        ...(imageUrl !== undefined && { image_url: imageUrl })
      })
        .eq('id', valid.id)
        .eq('organization_id', organizationId)
        .select()
        .single()

      if (pError) throw new Error(pError.message)

      if (valid.type === 'maison') {
        const productId = valid.id
        await supabase.from('product_ingredients').delete().eq('product_id', valid.id)

        if (valid.composition && valid.composition.length > 0) {
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
      return { success: true, id: valid.id, message: 'Produit mis à jour !' }
    }

    const { data: product, error: pError } = await supabase.from('products').insert({
      organization_id: organizationId,
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

    if (valid.type === 'maison' && valid.composition && valid.composition.length > 0) {
      const ingredientsToInsert = valid.composition.map(item => ({
        product_id: product.id,
        ingredient_id: item.ingredientId,
        quantity: item.quantity
      }))

      const { error: iError } = await supabase.from('product_ingredients').insert(ingredientsToInsert)
      if (iError) throw new Error(iError.message)
    }

    revalidatePath('/catalogue')
    return { success: true, id: product.id, message: 'Produit ajouté au catalogue !' }
  } catch (error: unknown) {
    console.error('Action error:', error)
    return { success: false, error: getActionError(error) }
  }
}

export async function deleteProduct(id: string) {
  try {
    const { supabase, organizationId } = await requireCatalogMutationContext()

    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()

    if (!product) return { success: false, error: 'Produit introuvable ou hors organisation' }

    await supabase.from('product_ingredients').delete().eq('product_id', id)

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)
    if (error) throw new Error(error.message)

    revalidatePath('/catalogue')
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: getActionError(error) }
  }
}

export async function toggleProductActive(id: string, isActive: boolean) {
  try {
    const { supabase, organizationId } = await requireCatalogMutationContext()

    const { error } = await supabase
      .from('products')
      .update({ is_active: isActive })
      .eq('id', id)
      .eq('organization_id', organizationId)
    if (error) throw new Error(error.message)

    revalidatePath('/catalogue')
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: getActionError(error) }
  }
}
