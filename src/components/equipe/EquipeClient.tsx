'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { UserPlus, Pencil, Power, X, Check } from 'lucide-react'
import type { Profile } from '@/types/supabase'
import { createEmployee, updateEmployee, deleteEmployee } from '@/lib/actions/employees'
import TouchInput from '@/components/ui/TouchInput'

const ROLE_OPTIONS = [
    { value: 'vendeur', label: '🛒 Vendeur' },
    { value: 'patissier', label: '👨‍🍳 Pâtissier' },
]

const COLOR_PRESETS = [
    '#C4836A', '#6A9CC4', '#6AC48A', '#C4C46A',
    '#C46AB0', '#6AC4C4', '#A06AC4', '#C47A6A',
]

interface Props {
    employees: Profile[]
    organizationId: string
}

type FormState = {
    full_name: string
    role_slug: string
    pin_code: string
    theme_color: string
    auto_lock_seconds: number
}

const DEFAULT_FORM: FormState = {
    full_name: '',
    role_slug: 'vendeur',
    pin_code: '',
    theme_color: COLOR_PRESETS[0],
    auto_lock_seconds: 60,
}

export default function EquipeClient({ employees, organizationId }: Props) {
    const [list, setList] = useState<Profile[]>(employees)
    const [showModal, setShowModal] = useState(false)
    const [editTarget, setEditTarget] = useState<Profile | null>(null)
    const [form, setForm] = useState<FormState>(DEFAULT_FORM)
    const [saving, setSaving] = useState(false)

    const openCreate = () => {
        setEditTarget(null)
        setForm(DEFAULT_FORM)
        setShowModal(true)
    }

    const openEdit = (emp: Profile) => {
        setEditTarget(emp)
        setForm({
            full_name: emp.full_name,
            role_slug: emp.role_slug,
            pin_code: '',
            theme_color: (emp as any).theme_color ?? COLOR_PRESETS[0],
            auto_lock_seconds: emp.auto_lock_seconds ?? 60,
        })
        setShowModal(true)
    }

    const handleSubmit = async () => {
        if (!form.full_name.trim()) return toast.error('Nom requis')
        if (!editTarget && (form.pin_code.length !== 4 || !/^\d+$/.test(form.pin_code))) {
            return toast.error('Le code PIN doit être de 4 chiffres')
        }
        setSaving(true)
        try {
            if (editTarget) {
                const upd: any = {
                    full_name: form.full_name,
                    role_slug: form.role_slug,
                    theme_color: form.theme_color,
                    auto_lock_seconds: form.auto_lock_seconds,
                }
                if (form.pin_code.length === 4) upd.pin_code = form.pin_code
                const res = await updateEmployee(editTarget.id, upd)
                if (res.error) return toast.error(res.error)
                setList(l => l.map(e => e.id === editTarget.id ? { ...e, ...upd } : e))
                toast.success('Employé mis à jour ✓')
            } else {
                const res = await createEmployee({
                    full_name: form.full_name,
                    role_slug: form.role_slug,
                    pin_code: form.pin_code,
                    theme_color: form.theme_color,
                    auto_lock_seconds: form.auto_lock_seconds,
                    organization_id: organizationId,
                })
                if (res.error) return toast.error(res.error)
                toast.success('Employé créé ✓')
                // Reload to get the new id from server
                window.location.reload()
            }
            setShowModal(false)
        } finally {
            setSaving(false)
        }
    }

    const handleToggleActive = async (emp: Profile) => {
        const res = await deleteEmployee(emp.id) // does is_active = false
        if (res.error) return toast.error(res.error)
        setList(l => l.filter(e => e.id !== emp.id))
        toast.success('Employé désactivé')
    }

    const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                <button onClick={openCreate} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserPlus size={18} />
                    Ajouter un employé
                </button>
            </div>

            {list.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-muted)' }}>
                    <p style={{ fontSize: '1.1rem' }}>Aucun employé pour l'instant.</p>
                    <p style={{ fontSize: '0.875rem' }}>Ajoutez vos vendeurs et pâtissiers pour le mode kiosque.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
                    {list.map(emp => (
                        <div key={emp.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '48px', height: '48px', borderRadius: '50%', flexShrink: 0,
                                    background: (emp as any).theme_color ?? '#E8B4A0',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 700, fontSize: '1rem', color: '#fff',
                                    border: `3px solid ${(emp as any).theme_color ?? '#E8B4A0'}`,
                                    boxShadow: `0 0 0 2px white, 0 0 0 4px ${(emp as any).theme_color ?? '#E8B4A0'}30`,
                                }}>
                                    {initials(emp.full_name)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#2D1B0E' }}>{emp.full_name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '2px' }}>
                                        {emp.role_slug === 'vendeur' ? '🛒 Vendeur' : '👨‍🍳 Pâtissier'}
                                        {' · '}Auto-lock {emp.auto_lock_seconds}s
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                                <button onClick={() => openEdit(emp)} className="btn-ghost" style={{ flex: 1, gap: '6px', fontSize: '0.8rem' }}>
                                    <Pencil size={14} /> Modifier
                                </button>
                                <button onClick={() => handleToggleActive(emp)} className="btn-ghost" style={{ flex: 1, gap: '6px', fontSize: '0.8rem', color: '#D94F38' }}>
                                    <Power size={14} /> Désactiver
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', position: 'relative' }}>
                        <button onClick={() => setShowModal(false)}
                            style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer' }}>
                            <X size={20} />
                        </button>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '20px' }}>
                            {editTarget ? `Modifier ${editTarget.full_name}` : 'Nouvel employé'}
                        </h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Nom complet</label>
                                <input className="input" value={form.full_name}
                                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                                    placeholder="ex: Marie Dupont" />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Rôle</label>
                                <select className="input" value={form.role_slug}
                                    onChange={e => setForm(f => ({ ...f, role_slug: e.target.value }))}>
                                    {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>

                            <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                                Code PIN 4 chiffres {editTarget && '(laisser vide pour ne pas changer)'}
                            </label>
                            <TouchInput
                                value={form.pin_code}
                                onChange={val => setForm(f => ({ ...f, pin_code: val }))}
                                maxLength={4}
                                placeholder="0000"
                                title="Code PIN Employé"
                                isPassword={true}
                            />

                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Couleur d'identité</label>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {COLOR_PRESETS.map(c => (
                                        <button key={c} onClick={() => setForm(f => ({ ...f, theme_color: c }))}
                                            style={{
                                                width: '36px', height: '36px', borderRadius: '50%',
                                                background: c, border: 'none', cursor: 'pointer',
                                                outline: form.theme_color === c ? `3px solid ${c}` : '3px solid transparent',
                                                outlineOffset: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                            {form.theme_color === c && <Check size={16} color="white" strokeWidth={3} />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                                    Auto-lock : {form.auto_lock_seconds}s
                                    <span style={{ fontWeight: 400, color: 'var(--color-muted)', marginLeft: '8px' }}>
                                        {form.auto_lock_seconds === 0 ? '(désactivé)' : `— verrou après ${form.auto_lock_seconds}s d'inactivité`}
                                    </span>
                                </label>
                                <input type="range" min={0} max={300} step={15}
                                    value={form.auto_lock_seconds}
                                    onChange={e => setForm(f => ({ ...f, auto_lock_seconds: Number(e.target.value) }))}
                                    style={{ width: '100%', accentColor: form.theme_color }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--color-muted)' }}>
                                    <span>Désactivé</span><span>5 min</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                            <button onClick={() => setShowModal(false)} className="btn-ghost" style={{ flex: 1 }}>Annuler</button>
                            <button onClick={handleSubmit} disabled={saving} className="btn-primary" style={{ flex: 2 }}>
                                {saving ? 'Enregistrement...' : editTarget ? 'Mettre à jour' : 'Créer l\'employé'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
