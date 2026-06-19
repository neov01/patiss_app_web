'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { UserPlus, X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createOrUpdateCustomer } from '@/lib/actions/customers'
import { useActionFeedback } from '@/hooks/useActionFeedback'

export default function CustomerCreateModal() {
    const [open, setOpen] = useState(false)
    const { execute, isPending, renderFeedback } = useActionFeedback()
    const [form, setForm] = useState({ name: '', phone: '', email: '', birthDate: '' })
    const router = useRouter()

    function handleClose() {
        setOpen(false)
        setForm({ name: '', phone: '', email: '', birthDate: '' })
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        await execute(async () => {
            const result = await createOrUpdateCustomer({
                name: form.name.trim(),
                phone: form.phone.trim(),
                email: form.email.trim() || undefined,
                birth_date: form.birthDate || undefined,
            })

            if ('error' in result && result.error) {
                const errMsg = typeof result.error === 'string' ? result.error : 'Erreur lors de la validation du formulaire'
                throw new Error(errMsg)
            }
            return result
        }, {
            type: 'toast',
            successMessage: `Client "${form.name.trim()}" enregistré avec succès`,
            onSuccess: () => {
                handleClose()
                router.refresh()
            }
        })
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
                <UserPlus size={16} />
                Ajouter un client
            </button>

            {open && createPortal(
                <div className="modal-overlay" onClick={handleClose}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Nouveau client</h2>
                            <button onClick={handleClose} className="btn-ghost" style={{ minHeight: '36px', padding: '0 10px' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label className="label">Nom complet *</label>
                                <input
                                    className="input"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="ex: Adjoua Konan"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="label">Téléphone *</label>
                                <input
                                    className="input"
                                    type="tel"
                                    value={form.phone}
                                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                                    placeholder="+225 07 XX XX XX XX"
                                    required
                                />
                                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--color-muted)' }}>
                                    Le numéro sert d&apos;identifiant unique — un client existant avec ce numéro sera mis à jour.
                                </p>
                            </div>

                            <div>
                                <label className="label">
                                    Email <span style={{ fontWeight: 400, color: 'var(--color-muted)', fontSize: '0.8rem' }}>(optionnel)</span>
                                </label>
                                <input
                                    className="input"
                                    type="email"
                                    value={form.email}
                                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                    placeholder="adjoua@exemple.com"
                                />
                            </div>

                            <div>
                                <label className="label">
                                    Date de naissance <span style={{ fontWeight: 400, color: 'var(--color-muted)', fontSize: '0.8rem' }}>(optionnel)</span>
                                </label>
                                <input
                                    className="input"
                                    type="date"
                                    value={form.birthDate}
                                    onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                                <button type="button" onClick={handleClose} className="btn-secondary" style={{ flex: 1 }}>
                                    Annuler
                                </button>
                                <button type="submit" className="btn-primary" disabled={isPending} style={{ flex: 1 }}>
                                    {isPending ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                                    {isPending ? 'Enregistrement…' : 'Enregistrer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            , document.body)}
            {renderFeedback()}
        </>
    )
}
