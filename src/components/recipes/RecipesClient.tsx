'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { BookOpen, Plus, X, Loader2, Edit2, Trash2, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react'
import TouchInput from '@/components/ui/TouchInput'
import { createRecipe, updateRecipe, deleteRecipe } from '@/lib/actions/recipes'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'

interface Ingredient { id: string; name: string; unit: string; cost_per_unit: number }
interface RecipeIngredientRow { ingredient_id: string; quantity_required: number; ingredients: { name: string; unit: string; cost_per_unit: number } | null }
interface Recipe {
    id: string; name: string; sale_price: number; description: string | null; image_url: string | null
    recipe_ingredients: RecipeIngredientRow[]
}

const EMPTY_FORM = { name: '', sale_price: 0, description: '' }

function calcFoodCost(ri: RecipeIngredientRow[]) {
    return ri.reduce((s, r) => s + r.quantity_required * (r.ingredients?.cost_per_unit ?? 0), 0)
}

function RecipeModal({ mode, recipe, ingredients, onClose }: { mode: 'create' | 'edit'; recipe?: Recipe; ingredients: Ingredient[]; onClose?: () => void }) {
    const [isPending, start] = useTransition()
    const [form, setForm] = useState(
        mode === 'edit' && recipe
            ? { name: recipe.name, sale_price: recipe.sale_price, description: recipe.description ?? '' }
            : EMPTY_FORM
    )
    const [lines, setLines] = useState<{ ingredient_id: string; quantity_required: number }[]>(
        mode === 'edit' && recipe ? recipe.recipe_ingredients.map(r => ({ ingredient_id: r.ingredient_id, quantity_required: r.quantity_required })) : []
    )
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(recipe?.image_url ?? null)

    function addLine() { setLines(l => [...l, { ingredient_id: '', quantity_required: 0.1 }]) }
    function removeLine(i: number) { setLines(l => l.filter((_, idx) => idx !== i)) }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        start(async () => {
            let imageUrl = currentImageUrl ?? undefined

            if (imageFile) {
                try {
                    const supabase = createSupabaseClient()
                    const ext = imageFile.name.split('.').pop() || 'jpg'
                    const filePath = `recipes/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

                    const { error: uploadError } = await supabase.storage.from('recipe-images').upload(filePath, imageFile)
                    if (!uploadError) {
                        const { data } = supabase.storage.from('recipe-images').getPublicUrl(filePath)
                        imageUrl = data.publicUrl
                        setCurrentImageUrl(imageUrl ?? null)
                    } else {
                        toast.error('Upload de la photo recette impossible. La recette sera enregistrée sans image.')
                    }
                } catch {
                    toast.error('Erreur de connexion au stockage. La recette sera enregistrée sans image.')
                }
            }

            const payload = { ...form, image_url: imageUrl, ingredients: lines.filter(l => l.ingredient_id) }
            const result = mode === 'create' ? await createRecipe(payload) : await updateRecipe(recipe!.id, payload)
            if ('error' in result && result.error) { toast.error(result.error); return }
            toast.success(mode === 'create' ? 'Recette créée !' : 'Recette mise à jour !')
            onClose?.()
        })
    }

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                    <label className="label">Nom de la recette *</label>
                    <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: Fraisier 6 parts" required />
                </div>
                <div>
                    <label className="label">Prix de vente *</label>
                    <TouchInput
                        value={form.sale_price.toString()}
                        onChange={val => setForm(f => ({ ...f, sale_price: parseFloat(val) || 0 }))}
                        allowDecimal={true}
                        placeholder="0.00"
                        title="Prix de vente"
                    />
                </div>
            </div>
            <div>
                <label className="label">Description</label>
                <textarea className="input" value={form.description} rows={2}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Notes de recette optionnelles…" style={{ resize: 'vertical', height: 'auto', paddingTop: '10px' }} />
            </div>

            {/* Image recette */}
            <div>
                <label className="label">Photo de la recette (optionnel)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <label className="btn-secondary" style={{ cursor: 'pointer', minHeight: '36px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <ImageIcon size={16} />
                        <span>Choisir une image</span>
                        <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={e => setImageFile(e.target.files?.[0] ?? null)}
                        />
                    </label>
                    {imageFile && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                            {imageFile.name}
                        </span>
                    )}
                    {!imageFile && currentImageUrl && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                            Image existante
                        </span>
                    )}
                </div>
            </div>

            {/* Ingrédients */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="label" style={{ margin: 0 }}>Composition</label>
                    <button type="button" onClick={addLine} className="btn-ghost" style={{ minHeight: '30px', padding: '0 10px', fontSize: '0.8rem' }}>
                        <Plus size={14} /> Ajouter
                    </button>
                </div>
                {lines.map((line, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 36px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                        <select className="input" value={line.ingredient_id} onChange={e => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ingredient_id: e.target.value } : l))}>
                            <option value="">Choisir un ingrédient</option>
                            {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}
                        </select>
                        <TouchInput
                            value={line.quantity_required.toString()}
                            onChange={val => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, quantity_required: parseFloat(val) || 0 } : l))}
                            allowDecimal={true}
                            placeholder="0.000"
                            title="Quantité requise"
                        />
                        <button type="button" onClick={() => removeLine(i)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 8px', color: '#D94F38' }}><X size={14} /></button>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
                {onClose && <button type="button" onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>Annuler</button>}
                <button type="submit" className="btn-primary" disabled={isPending} style={{ flex: 1 }}>
                    {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                    {isPending ? 'Enregistrement…' : 'Enregistrer'}
                </button>
            </div>
        </form>
    )
}

export default function RecipesClient({ recipes, ingredients, currency }: { recipes: Recipe[]; ingredients: Ingredient[]; currency: string }) {
    const [showCreate, setShowCreate] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [isPending, start] = useTransition()

    async function handleDelete(id: string) {
        if (!confirm('Supprimer cette recette ?')) return
        start(async () => {
            const result = await deleteRecipe(id)
            if ('error' in result && result.error) toast.error(result.error)
            else toast.success('Recette supprimée')
        })
    }

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus size={16} /> Nouvelle recette</button>
            </div>

            {recipes.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-muted)' }}>
                    <BookOpen size={40} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600 }}>Aucune recette pour l&apos;instant</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {recipes.map(recipe => {
                        const foodCost = calcFoodCost(recipe.recipe_ingredients)
                        const margin = recipe.sale_price - foodCost
                        const marginPct = recipe.sale_price > 0 ? ((margin / recipe.sale_price) * 100).toFixed(0) : '0'
                        const marginColor = margin > 0 ? '#4C9E6A' : '#D94F38'
                        const expanded = expandedId === recipe.id
                        const editing = editId === recipe.id

                        return (
                            <div key={recipe.id} className="card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}>{recipe.name}</div>
                                        {recipe.description && <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '8px' }}>{recipe.description}</div>}
                                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                                            <span style={{ fontWeight: 600 }}>Vente : {recipe.sale_price.toLocaleString('fr-FR')} {currency}</span>
                                            <span style={{ color: 'var(--color-muted)' }}>Food-Cost : {foodCost.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} {currency}</span>
                                            <span style={{ fontWeight: 700, color: marginColor }}>Marge : {margin.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} {currency} ({marginPct}%)</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                                        <button onClick={() => setExpandedId(expanded ? null : recipe.id)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 10px' }}>
                                            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                        <button onClick={() => setEditId(editing ? null : recipe.id)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 10px' }}><Edit2 size={16} /></button>
                                        <button onClick={() => handleDelete(recipe.id)} className="btn-ghost" disabled={isPending} style={{ color: '#D94F38', minHeight: '36px', padding: '0 10px' }}><Trash2 size={16} /></button>
                                    </div>
                                </div>

                                {/* Composition */}
                                {expanded && !editing && recipe.recipe_ingredients.length > 0 && (
                                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                                        <table style={{ width: '100%' }}>
                                            <thead><tr style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                                                <th style={{ textAlign: 'left', paddingBottom: '6px' }}>Ingrédient</th>
                                                <th style={{ textAlign: 'right', paddingBottom: '6px' }}>Quantité</th>
                                                <th style={{ textAlign: 'right', paddingBottom: '6px' }}>Coût</th>
                                            </tr></thead>
                                            <tbody>{recipe.recipe_ingredients.map(ri => (
                                                <tr key={ri.ingredient_id} style={{ fontSize: '0.85rem', borderTop: '1px solid var(--color-border)' }}>
                                                    <td style={{ padding: '6px 0' }}>{ri.ingredients?.name ?? '—'}</td>
                                                    <td style={{ textAlign: 'right', padding: '6px 0' }}>{ri.quantity_required} {ri.ingredients?.unit}</td>
                                                    <td style={{ textAlign: 'right', padding: '6px 0', color: 'var(--color-muted)' }}>
                                                        {(ri.quantity_required * (ri.ingredients?.cost_per_unit ?? 0)).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} {currency}
                                                    </td>
                                                </tr>
                                            ))}</tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Edit form */}
                                {editing && (
                                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                                        <RecipeModal mode="edit" recipe={recipe} ingredients={ingredients} onClose={() => setEditId(null)} />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modal Création */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Nouvelle recette</h2>
                            <button onClick={() => setShowCreate(false)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 10px' }}><X size={18} /></button>
                        </div>
                        <RecipeModal mode="create" ingredients={ingredients} onClose={() => setShowCreate(false)} />
                    </div>
                </div>
            )}
        </>
    )
}
