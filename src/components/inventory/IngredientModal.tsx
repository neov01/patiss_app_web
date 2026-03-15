'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Edit2, X, Loader2, Image as ImageIcon } from 'lucide-react'
import TouchInput from '@/components/ui/TouchInput'
import { createIngredient, updateIngredient } from '@/lib/actions/inventory'
import type { Ingredient } from '@/types/supabase'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'

interface Props {
    mode: 'create' | 'edit'
    ingredient?: Ingredient
}

export default function IngredientModal({ mode, ingredient }: Props) {
    const [open, setOpen] = useState(false)
    const [isPending, start] = useTransition()
    const [form, setForm] = useState({
        name: ingredient?.name ?? '',
        unit: ingredient?.unit ?? 'kg',
        cost_per_unit: ingredient?.cost_per_unit ?? 0,
        alert_threshold: ingredient?.alert_threshold ?? 5,
    })
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(ingredient?.image_url ?? null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        start(async () => {
            let imageUrl = currentImageUrl ?? null

            if (imageFile) {
                try {
                    const supabase = createSupabaseClient()
                    const ext = imageFile.name.split('.').pop() || 'jpg'
                    const filePath = `ingredients/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

                    const { error: uploadError } = await supabase.storage.from('ingredient-images').upload(filePath, imageFile)
                    if (!uploadError) {
                        const { data } = supabase.storage.from('ingredient-images').getPublicUrl(filePath)
                        imageUrl = data.publicUrl ?? null
                        setCurrentImageUrl(imageUrl)
                    } else {
                        toast.error('Upload de la photo ingrédient impossible. Il sera enregistré sans image.')
                    }
                } catch {
                    toast.error('Erreur de connexion au stockage. L\'ingrédient sera enregistré sans image.')
                }
            }

            const payload = { ...form, image_url: imageUrl }
            const result = mode === 'create'
                ? await createIngredient(payload)
                : await updateIngredient(ingredient!.id, payload)

            if ('error' in result && result.error) {
                toast.error(result.error)
            } else {
                toast.success(mode === 'create' ? 'Ingrédient créé !' : 'Ingrédient mis à jour !')
                setOpen(false)
                if (mode === 'create') {
                    setForm({ name: '', unit: 'kg', cost_per_unit: 0, alert_threshold: 5 })
                    setImageFile(null)
                    setCurrentImageUrl(null)
                }
            }
        })
    }

    return (
        <>
            <button onClick={() => setOpen(true)}
                className={mode === 'create' ? 'btn-primary' : 'btn-ghost'}
                style={{ padding: mode === 'create' ? undefined : '0 8px', minHeight: '36px' }}>
                {mode === 'create' ? <><Plus size={16} /> Ajouter</> : <Edit2 size={16} />}
            </button>

            {open && (
                <div className="modal-overlay" onClick={() => setOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                                {mode === 'create' ? 'Nouvel ingrédient' : 'Modifier ingrédient'}
                            </h2>
                            <button onClick={() => setOpen(false)} className="btn-ghost" style={{ minHeight: '36px', padding: '0 10px' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label className="label">Nom</label>
                                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: Farine T55" required />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label className="label">Unité</label>
                                    <select className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                                        {['kg', 'g', 'l', 'cl', 'ml', 'piece', 'sachet'].map(u => <option key={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="label">Coût / unité</label>
                                    <TouchInput
                                        value={form.cost_per_unit.toString()}
                                        onChange={val => setForm(f => ({ ...f, cost_per_unit: parseFloat(val) || 0 }))}
                                        allowDecimal={true}
                                        placeholder="0.00"
                                        title="Coût par unité"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="label">Seuil d&apos;alerte (stock minimum)</label>
                                <TouchInput
                                    value={form.alert_threshold.toString()}
                                    onChange={val => setForm(f => ({ ...f, alert_threshold: parseFloat(val) || 0 }))}
                                    allowDecimal={true}
                                    placeholder="0.0"
                                    title="Seuil d'alerte"
                                />
                            </div>
                            <div>
                                <label className="label">Photo de l&apos;ingrédient (optionnel)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                                <button type="button" onClick={() => setOpen(false)} className="btn-secondary" style={{ flex: 1 }}>Annuler</button>
                                <button type="submit" className="btn-primary" disabled={isPending} style={{ flex: 1 }}>
                                    {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {isPending ? 'Enregistrement…' : 'Enregistrer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
