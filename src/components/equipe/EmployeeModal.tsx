'use client'

// {"file":"src/components/equipe/EmployeeModal.tsx","type":"component","depends":["react","react-dom","react-hook-form","@hookform/resolvers/zod","lucide-react","sonner","@/lib/actions/employees","@/lib/schemas/employee.schema"],"exports":["EmployeeModal"],"supabase_tables":["profiles"]}

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { employeeSchema, EmployeeFormValues } from '@/lib/schemas/employee.schema'
import { createEmployee, updateEmployee, uploadEmployeeAvatar } from '@/lib/actions/employees'
import { X, Camera, Check, Loader2, User, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import type { EmployeeData } from './EmployeeCard'
import { Controller } from 'react-hook-form'
import TouchInput from '@/components/ui/TouchInput'
import DatePicker from '@/components/ui/DatePicker'
import { compressImage } from '@/lib/utils/image-compression'
import ImageCropper from '@/components/ui/ImageCropper'
import { format, parseISO } from 'date-fns'

// ─────────────────────────────────────────────────
const COLOR_PRESETS = [
  '#C4836A', '#6A9CC4', '#6AC48A', '#C4C46A',
  '#C46AB0', '#6AC4C4', '#A06AC4', '#7B8FA1',
]

const CONTRACT_OPTIONS = [
  { value: 'full_time',  label: 'Temps plein',  emoji: '⏱️' },
  { value: 'part_time',  label: 'Temps partiel', emoji: '🕐' },
  { value: 'daily',      label: 'Journalier',    emoji: '📅' },
]

const ROLE_OPTIONS = [
  { value: 'vendeur',   label: 'Vendeur',   emoji: '🛒' },
  { value: 'patissier', label: 'Pâtissier', emoji: '👨‍🍳' },
  { value: 'gerant',    label: 'Gérant',    emoji: '👑' },
]

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  mode: 'create' | 'edit'
  employee?: EmployeeData
  organizationId: string
  currency: string
}

// ─────────────────────────────────────────────────
export default function EmployeeModal({ open, onClose, onSuccess, mode, employee, organizationId, currency }: Props) {
  const [isMounted, setIsMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'identity' | 'access'>('identity')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Avatar
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile]       = useState<File | null>(null)
  const [showSalary, setShowSalary]       = useState(false)
  const [showPin, setShowPin]             = useState(false)
  
  // Cropping
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [tempImageSrc, setTempImageSrc]   = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setIsMounted(true) }, [])

  // ── Form ──
  const { register, control, handleSubmit, setValue, reset, formState: { errors } } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema) as any,
    defaultValues: {
      fullName:        '',
      phone:           '',
      role:            'vendeur',
      contractType:    'full_time',
      baseSalary:      0,
      hireDate:        '',
      pinCode:         '',
      identityColor:   COLOR_PRESETS[0],
      autoLockSeconds: 60,
      avatarUrl:       '',
    }
  })

  const [identityColor, contractType, role, autoLockSeconds] = useWatch({
    control,
    name: ['identityColor', 'contractType', 'role', 'autoLockSeconds'],
  })

  // Pre-fill for edit mode
  useEffect(() => {
    if (open) {
      setActiveTab('identity')
      setAvatarFile(null)
      setShowSalary(false)
      setShowPin(false)

      if (mode === 'edit' && employee) {
        reset({
          fullName:        employee.full_name,
          phone:           employee.phone       ?? '',
          role:            (employee.role_slug  ?? 'vendeur') as EmployeeFormValues['role'],
          contractType:    (employee.contract_type ?? 'full_time') as EmployeeFormValues['contractType'],
          baseSalary:      Number(employee.base_salary ?? 0),
          hireDate:        employee.hire_date   ?? '',
          pinCode:         '',
          identityColor:   employee.theme_color ?? COLOR_PRESETS[0],
          autoLockSeconds: employee.auto_lock_seconds ?? 60,
          avatarUrl:       employee.avatar_url  ?? '',
        })
        setAvatarPreview(employee.avatar_url ?? null)
      } else {
        reset({
          fullName: '', phone: '', role: 'vendeur', contractType: 'full_time',
          baseSalary: 0, hireDate: '', pinCode: '',
          identityColor: COLOR_PRESETS[0], autoLockSeconds: 60, avatarUrl: '',
        })
        setAvatarPreview(null)
      }
    }
  }, [open, mode, employee, reset])

  // ── Avatar handling ──
  // Cleanup Object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  }, [avatarPreview])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Open crop modal instead of setting file directly
    const reader = new FileReader()
    reader.onload = () => {
      setTempImageSrc(reader.result as string)
      setCropModalOpen(true)
    }
    reader.readAsDataURL(file)
    
    // Reset input
    e.target.value = ''
  }

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCropModalOpen(false)
    
    // Convert blob to File if needed, or just keep as blob
    // For our current uploadEmployeeAvatar logic, blob works in FormData
    setAvatarFile(croppedBlob as any)
    
    const newPreview = URL.createObjectURL(croppedBlob)
    setAvatarPreview(newPreview)
    setTempImageSrc(null)
  }

  // ── Submit ──
  const onSubmit = async (data: EmployeeFormValues) => {
    setIsSubmitting(true)
    try {
      let finalAvatarUrl = data.avatarUrl

      if (mode === 'create') {
        // Étape 1: Créer l'employé d'abord
        const res = await createEmployee({ ...data, organization_id: organizationId, avatarUrl: '' })
        if (!res.success || !res.employeeId) {
          toast.error(res.error ?? 'Erreur lors de la création')
          return
        }
        // Étape 2: Upload avatar si présent
        if (avatarFile) {
          const compressedAvatar = await compressImage(avatarFile, { maxWidth: 400, quality: 0.7 })
          const fd = new FormData()
          fd.append('file', compressedAvatar, 'avatar.webp')
          const upRes = await uploadEmployeeAvatar(res.employeeId, fd)
          if (upRes.success) finalAvatarUrl = upRes.url
        }
        toast.success('Employé créé avec succès !')
      } else if (mode === 'edit' && employee) {
        // Upload avatar si changé
        if (avatarFile) {
          const compressedAvatar = await compressImage(avatarFile, { maxWidth: 400, quality: 0.7 })
          const fd = new FormData()
          fd.append('file', compressedAvatar, 'avatar.webp')
          const upRes = await uploadEmployeeAvatar(employee.id, fd)
          if (upRes.success) finalAvatarUrl = upRes.url
        }
        const res = await updateEmployee(employee.id, { ...data, avatarUrl: finalAvatarUrl })
        if (!res.success) {
          toast.error(res.error ?? 'Erreur lors de la mise à jour')
          return
        }
        toast.success('Employé mis à jour !')
      }

      onSuccess()
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2) || '?'

  const fullName = (useWatch({ control, name: 'fullName' })) as string

  if (!open || !isMounted) return null

  return (
    <>
      {createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          {/* Backdrop */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(45,27,14,0.45)', backdropFilter: 'blur(8px)' }} onClick={onClose} />

          {/* Modal */}
          <div style={{
            position: 'relative', zIndex: 1,
            background: '#fff', borderRadius: '28px', width: '100%', maxWidth: '560px',
            maxHeight: '92vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 64px rgba(45,27,14,0.2)',
            animation: 'scaleIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
            overflow: 'visible',
          }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1.5px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
              <h2 style={{ margin: 0, fontWeight: 900, fontSize: '1.1rem', color: '#2D1B0E' }}>
                {mode === 'create' ? 'Nouvel employé' : `Modifier ${employee?.full_name ?? ''}`}
              </h2>
              <button type="button" onClick={onClose} style={{ background: 'var(--color-cream)', border: 'none', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1.5px solid var(--color-border)' }}>
              {([['identity', '👤 Identité'], ['access', '🔐 Accès & Sécurité']] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1, padding: '14px', border: 'none', background: 'none', cursor: 'pointer',
                    fontWeight: activeTab === tab ? 700 : 500,
                    fontSize: '0.875rem',
                    color: activeTab === tab ? 'var(--color-rose-dark)' : 'var(--color-muted)',
                    borderBottom: `2.5px solid ${activeTab === tab ? 'var(--color-rose-dark)' : 'transparent'}`,
                    transition: 'all 0.15s',
                    marginBottom: '-1.5px',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Body scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <form id="employee-form" onSubmit={handleSubmit(onSubmit)}>

                {/* ═══ ONGLET IDENTITÉ ═══ */}
                {activeTab === 'identity' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Avatar */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      {/* Cercle avatar */}
                      <div
                        style={{ position: 'relative', cursor: 'pointer' }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {avatarPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatarPreview}
                            alt="Avatar"
                            style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${identityColor}` }}
                          />
                        ) : (
                          <div style={{
                            width: 88, height: 88, borderRadius: '50%',
                            background: identityColor ?? COLOR_PRESETS[0],
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 900, fontSize: '1.5rem', color: '#fff',
                            border: `3px solid ${identityColor}`,
                            boxShadow: `0 0 0 4px ${identityColor}30`,
                            transition: 'background 0.2s',
                          }}>
                            {fullName ? getInitials(fullName) : <User size={32} color="rgba(255,255,255,0.7)" />}
                          </div>
                        )}
                        {/* Overlay caméra */}
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: '50%',
                          background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: 0, transition: 'opacity 0.2s',
                        }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0' }}
                        >
                          <Camera size={24} color="#fff" />
                        </div>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: 'none' }}
                        onChange={handleAvatarChange}
                      />
                      <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: 'none', color: 'var(--color-rose-dark)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Camera size={14} /> {avatarPreview ? 'Changer la photo' : 'Ajouter une photo'}
                      </button>
                      {avatarPreview && (
                        <button type="button" onClick={() => { setAvatarPreview(null); setAvatarFile(null); setValue('avatarUrl', '') }} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '0.75rem', cursor: 'pointer' }}>
                          Supprimer la photo
                        </button>
                      )}
                    </div>

                    {/* Nom complet */}
                    <div>
                      <label className="label">Nom complet *</label>
                      <input {...register('fullName')} className="input" placeholder="ex: Marie Konan" inputMode="text" autoComplete="name" />
                      {errors.fullName && <span style={{ fontSize: '0.75rem', color: 'var(--color-error)', marginTop: '4px', display: 'block' }}>{errors.fullName.message}</span>}
                    </div>

                    {/* Téléphone */}
                    <div>
                      <label className="label">Téléphone (optionnel)</label>
                      <Controller
                        control={control}
                        name="phone"
                        render={({ field }) => (
                          <TouchInput
                            value={field.value || ''}
                            onChange={field.onChange}
                            placeholder="ex: +225 07 00 00 00"
                            title="Numéro de téléphone"
                            isPhone={true}
                          />
                        )}
                      />
                    </div>

                    {/* Rôle */}
                    <div>
                      <label className="label">Rôle</label>
                      <select {...register('role')} className="input" style={{ cursor: 'pointer' }}>
                        {ROLE_OPTIONS.map(r => (
                          <option key={r.value} value={r.value}>{r.emoji} {r.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Type de contrat */}
                    <div>
                      <label className="label">Type de contrat</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                        {CONTRACT_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setValue('contractType', opt.value as EmployeeFormValues['contractType'])}
                            style={{
                              padding: '12px 8px', borderRadius: '14px',
                              border: `2px solid ${contractType === opt.value ? 'var(--color-rose-dark)' : 'var(--color-border)'}`,
                              background: contractType === opt.value ? 'var(--color-blush)' : '#fff',
                              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                              transition: 'all 0.15s',
                            }}
                          >
                            <span style={{ fontSize: '1.3rem' }}>{opt.emoji}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: contractType === opt.value ? 'var(--color-rose-dark)' : 'var(--color-muted)', textAlign: 'center', lineHeight: 1.2 }}>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Date d'embauche */}
                    <div>
                      <label className="label">Date d&apos;embauche (optionnel)</label>
                      <Controller
                        control={control}
                        name="hireDate"
                        render={({ field }) => (
                          <DatePicker
                            value={field.value ? parseISO(field.value) : null}
                            onChange={(date) => field.onChange(format(date, 'yyyy-MM-dd'))}
                            placeholder="Cliquer pour choisir..."
                            direction="up"
                          />
                        )}
                      />
                    </div>

                    {/* Couleur identité */}
                    <div>
                      <label className="label">Couleur d&apos;identité</label>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {COLOR_PRESETS.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setValue('identityColor', c)}
                            style={{
                              width: 38, height: 38, borderRadius: '50%', background: c,
                              border: 'none', cursor: 'pointer',
                              outline: identityColor === c ? `3px solid ${c}` : '3px solid transparent',
                              outlineOffset: '2px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.15s',
                            }}
                          >
                            {identityColor === c && <Check size={16} color="#fff" strokeWidth={3} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ ONGLET ACCÈS & SÉCURITÉ ═══ */}
                {activeTab === 'access' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* PIN */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <label className="label" style={{ margin: 0 }}>
                          Code PIN (4 chiffres)
                          {mode === 'edit' && <span style={{ fontWeight: 400, color: 'var(--color-muted)', textTransform: 'none', letterSpacing: 0, marginLeft: '6px' }}>— laisser vide pour ne pas changer</span>}
                        </label>
                        <button 
                          type="button" 
                          onClick={() => setShowPin(!showPin)}
                          style={{ background: 'var(--color-cream)', border: 'none', padding: '4px 10px', borderRadius: '8px', cursor: 'pointer', color: 'var(--color-rose-dark)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700 }}
                        >
                          {showPin ? <><EyeOff size={14} /> Masquer</> : <><Eye size={14} /> Afficher</>}
                        </button>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <Controller
                          control={control}
                          name="pinCode"
                          render={({ field }) => (
                            <TouchInput
                              value={field.value}
                              onChange={field.onChange}
                              isPassword={!showPin}
                              maxLength={4}
                              title="Code PIN (4 chiffres)"
                              placeholder="••••"
                              style={{ fontSize: '1.5rem', textAlign: 'center' }}
                            />
                          )}
                        />
                      </div>
                      {errors.pinCode && <span style={{ fontSize: '0.75rem', color: 'var(--color-error)', marginTop: '4px', display: 'block' }}>{errors.pinCode.message}</span>}
                    </div>

                    {/* Auto-lock slider */}
                    <div>
                      <label className="label">
                        Verrouillage auto — {autoLockSeconds === 0 ? 'Désactivé' : `après ${autoLockSeconds}s d'inactivité`}
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={300}
                        step={15}
                        value={autoLockSeconds}
                        onChange={e => setValue('autoLockSeconds', Number(e.target.value))}
                        style={{ width: '100%', accentColor: identityColor ?? 'var(--color-rose-dark)', height: '6px', marginTop: '8px' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '6px' }}>
                        <span>Désactivé</span><span>30s</span><span>1 min</span><span>2 min</span><span>5 min</span>
                      </div>
                    </div>

                    {/* Salaire de base */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <label className="label" style={{ margin: 0 }}>Salaire de base mensuel ({currency})</label>
                        <button 
                          type="button" 
                          onClick={() => setShowSalary(!showSalary)}
                          style={{ background: 'var(--color-cream)', border: 'none', padding: '4px 10px', borderRadius: '8px', cursor: 'pointer', color: 'var(--color-rose-dark)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700 }}
                        >
                          {showSalary ? <><EyeOff size={14} /> Masquer</> : <><Eye size={14} /> Afficher</>}
                        </button>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <Controller
                          control={control}
                          name="baseSalary"
                          render={({ field }) => (
                            <TouchInput
                              value={field.value?.toString() || '0'}
                              onChange={(val) => field.onChange(parseFloat(val) || 0)}
                              allowDecimal={true}
                              isPassword={!showSalary}
                              title="Salaire mensuel"
                              placeholder="0"
                              style={{ fontSize: '1.1rem', fontWeight: 700 }}
                            />
                          )}
                        />
                        <span style={{ position: 'absolute', right: '44px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-muted)', pointerEvents: 'none', zIndex: 1 }}>
                          {currency}
                        </span>
                      </div>
                      {errors.baseSalary && <span style={{ fontSize: '0.75rem', color: 'var(--color-error)', marginTop: '4px', display: 'block' }}>{errors.baseSalary.message}</span>}
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* Footer sticky */}
            <div style={{ padding: '16px 24px', borderTop: '1.5px solid var(--color-border)', background: '#fff', display: 'flex', gap: '12px' }}>
              <button type="button" onClick={onClose} className="btn-ghost" style={{ flex: 1 }}>Annuler</button>
              <button
                type="submit"
                form="employee-form"
                disabled={isSubmitting}
                className="btn-primary"
                style={{ flex: 2, height: '48px', fontSize: '0.9rem' }}
              >
                {isSubmitting
                  ? <><Loader2 size={16} className="animate-spin" /> Enregistrement...</>
                  : mode === 'create' ? "Créer l'employé" : 'Enregistrer les modifications'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {cropModalOpen && tempImageSrc && createPortal(
        <ImageCropper 
          image={tempImageSrc}
          onCancel={() => {
            setCropModalOpen(false)
            setTempImageSrc(null)
          }}
          onCropComplete={handleCropComplete}
        />,
        document.body
      )}
    </>
  )
}
