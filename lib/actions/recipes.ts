'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createRecipe(formData: {
    name: string
    sale_price: number
    description?: string
    image_url?: string
    ingredients: { ingredient_id: string; quantity_required: number }[]
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Non authentifié' }

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    if (!profile?.organization_id) return { error: 'Organisation introuvable' }

    const { data: recipe, error } = await supabase.from('recipes').insert({
        organization_id: profile.organization_id,
        name: formData.name,
        sale_price: formData.sale_price,
        description: formData.description,
        image_url: formData.image_url,
    }).select().single()

    if (error) return { error: error.message }

    if (formData.ingredients.length > 0) {
        await supabase.from('recipe_ingredients').insert(
            formData.ingredients.map(i => ({ recipe_id: recipe.id, ...i }))
        )
    }

    revalidatePath('/recettes')
    return { data: recipe }
}

export async function updateRecipe(recipeId: string, formData: {
    name: string
    sale_price: number
    description?: string
    image_url?: string
    ingredients: { ingredient_id: string; quantity_required: number }[]
}) {
    const supabase = await createClient()

    const { error } = await supabase.from('recipes').update({
        name: formData.name,
        sale_price: formData.sale_price,
        description: formData.description,
        image_url: formData.image_url,
    }).eq('id', recipeId)

    if (error) return { error: error.message }

    // Recréer les ingrédients
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId)
    if (formData.ingredients.length > 0) {
        await supabase.from('recipe_ingredients').insert(
            formData.ingredients.map(i => ({ recipe_id: recipeId, ...i }))
        )
    }

    revalidatePath('/recettes')
    return { success: true }
}

export async function deleteRecipe(recipeId: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('recipes').delete().eq('id', recipeId)
    if (error) return { error: error.message }
    revalidatePath('/recettes')
    return { success: true }
}
