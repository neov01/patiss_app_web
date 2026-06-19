'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Mail, Lock, CakeSlice, Loader2, Eye, EyeOff } from 'lucide-react'
import { logoutKiosk } from '@/lib/actions/auth'

// ── COUCHE 1 : Premier plan (nets, échelles 1.7 à 2.2, traits 2.2px, opacité 19% à 27%)
const svgPlan1 = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='360' viewBox='0 0 360 360'%3E%3Cdefs%3E%3Cg id='c'%3E%3Cpath d='M 5,20 C 5,10 15,5 30,10 C 35,12 40,17 40,22 C 38,27 30,28 20,26 C 10,24 5,22 5,20 Z' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M 12,14 C 15,10 20,10 22,13' fill='none'/%3E%3Cpath d='M 20,19 C 23,15 27,15 29,18' fill='none'/%3E%3Cpath d='M 27,23 C 29,19 32,19 34,22' fill='none'/%3E%3C/g%3E%3Cg id='d'%3E%3Ccircle cx='20' cy='20' r='17' fill='none'/%3E%3Ccircle cx='20' cy='20' r='6' fill='none'/%3E%3Cline x1='10' y1='12' x2='13' y2='10' stroke-linecap='round'/%3E%3Cline x1='28' y1='10' x2='29' y2='13' stroke-linecap='round'/%3E%3Cline x1='12' y1='28' x2='15' y2='29' stroke-linecap='round'/%3E%3Cline x1='26' y1='27' x2='29' y2='25' stroke-linecap='round'/%3E%3Ccircle cx='9' cy='20' r='0.8' fill='currentColor'/%3E%3Ccircle cx='31' cy='18' r='0.8' fill='currentColor'/%3E%3C/g%3E%3Cg id='m'%3E%3Cpath d='M 10,22 L 7,37 C 7,39 9,40 11,40 L 29,40 C 31,40 33,39 33,37 L 30,22' fill='none' stroke-linejoin='round'/%3E%3Cline x1='15' y1='22' x2='13' y2='40'/%3E%3Cline x1='20' y1='22' x2='20' y2='40'/%3E%3Cline x1='25' y1='22' x2='27' y2='40'/%3E%3Cpath d='M 8,22 C 3,22 1,15 6,10 C 11,5 29,5 34,10 C 39,15 37,22 32,22 Z' fill='none' stroke-linejoin='round'/%3E%3C/g%3E%3Cg id='b'%3E%3Crect x='5' y='12' width='32' height='14' rx='7' fill='none' transform='rotate(-25 20 20)'/%3E%3Cline x1='12' y1='18' x2='17' y2='13' stroke-linecap='round' transform='rotate(-25 20 20)'/%3E%3Cline x1='19' y1='18' x2='24' y2='13' stroke-linecap='round' transform='rotate(-25 20 20)'/%3E%3Cline x1='26' y1='18' x2='31' y2='13' stroke-linecap='round' transform='rotate(-25 20 20)'/%3E%3C/g%3E%3Cg id='k'%3E%3Ccircle cx='16' cy='24' r='12' fill='none'/%3E%3Ccircle cx='11' cy='20' r='1.2' fill='currentColor'/%3E%3Ccircle cx='16' cy='17' r='1' fill='currentColor'/%3E%3Ccircle cx='21' cy='22' r='1.5' fill='currentColor'/%3E%3Ccircle cx='14' cy='27' r='1.2' fill='currentColor'/%3E%3Cpath d='M 23,16 C 27,17 30,21 30,26 C 30,31 26,34 22,34' fill='none'/%3E%3Ccircle cx='26' cy='21' r='1.2' fill='currentColor'/%3E%3Ccircle cx='26' cy='28' r='1' fill='currentColor'/%3E%3C/g%3E%3Cg id='g'%3E%3Cpath d='M 5,25 L 28,14 L 33,20 L 5,31 Z' fill='none' stroke-linejoin='round'/%3E%3Cpath d='M 33,20 L 33,29 L 5,40 L 5,31' fill='none' stroke-linejoin='round'/%3E%3Cline x1='28' y1='14' x2='28' y2='23'/%3E%3Cline x1='5' y1='40' x2='33' y2='29'/%3E%3Cpath d='M 5,35 L 33,24' opacity='0.7'/%3E%3Ccircle cx='18' cy='12' r='2.5' fill='none'/%3E%3Cpath d='M 18,9.5 Q 20,5 23,7' fill='none' stroke-linecap='round'/%3E%3C/g%3E%3C/defs%3E%3Cuse href='%23c' transform='translate(15, 15) scale(2.0)' stroke='%23815431' stroke-width='2.2' color='%23815431' opacity='0.22'/%3E%3Cuse href='%23d' transform='translate(210, 20) scale(1.8)' stroke='%23815431' stroke-width='2.2' color='%23815431' opacity='0.19'/%3E%3Cuse href='%23k' transform='translate(90, 95) scale(2.2)' stroke='%23815431' stroke-width='2.2' color='%23815431' opacity='0.27'/%3E%3Cuse href='%23m' transform='translate(15, 210) scale(1.7)' stroke='%23815431' stroke-width='2.2' color='%23815431' opacity='0.20'/%3E%3Cuse href='%23b' transform='translate(190, 200) scale(1.9)' stroke='%23815431' stroke-width='2.2' color='%23815431' opacity='0.24'/%3E%3Cuse href='%23g' transform='translate(250, 240) scale(2.1)' stroke='%23815431' stroke-width='2.2' color='%23815431' opacity='0.25'/%3E%3C/svg%3E`

// ── COUCHE 2 : Plan intermédiaire (échelles 1.25 à 1.45, traits 3.0px, opacité 10% à 13%)
const svgPlan2 = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='360' viewBox='0 0 360 360'%3E%3Cdefs%3E%3Cg id='d'%3E%3Ccircle cx='20' cy='20' r='17' fill='none'/%3E%3Ccircle cx='20' cy='20' r='6' fill='none'/%3E%3Cline x1='10' y1='12' x2='13' y2='10' stroke-linecap='round'/%3E%3Cline x1='28' y1='10' x2='29' y2='13' stroke-linecap='round'/%3E%3Cline x1='12' y1='28' x2='15' y2='29' stroke-linecap='round'/%3E%3Cline x1='26' y1='27' x2='29' y2='25' stroke-linecap='round'/%3E%3Ccircle cx='9' cy='20' r='0.8' fill='currentColor'/%3E%3Ccircle cx='31' cy='18' r='0.8' fill='currentColor'/%3E%3C/g%3E%3Cg id='m'%3E%3Cpath d='M 10,22 L 7,37 C 7,39 9,40 11,40 L 29,40 C 31,40 33,39 33,37 L 30,22' fill='none' stroke-linejoin='round'/%3E%3Cline x1='15' y1='22' x2='13' y2='40'/%3E%3Cline x1='20' y1='22' x2='20' y2='40'/%3E%3Cline x1='25' y1='22' x2='27' y2='40'/%3E%3Cpath d='M 8,22 C 3,22 1,15 6,10 C 11,5 29,5 34,10 C 39,15 37,22 32,22 Z' fill='none' stroke-linejoin='round'/%3E%3C/g%3E%3Cg id='k'%3E%3Ccircle cx='16' cy='24' r='12' fill='none'/%3E%3Ccircle cx='11' cy='20' r='1.2' fill='currentColor'/%3E%3Ccircle cx='16' cy='17' r='1' fill='currentColor'/%3E%3Ccircle cx='21' cy='22' r='1.5' fill='currentColor'/%3E%3Ccircle cx='14' cy='27' r='1.2' fill='currentColor'/%3E%3Cpath d='M 23,16 C 27,17 30,21 30,26 C 30,31 26,34 22,34' fill='none'/%3E%3Ccircle cx='26' cy='21' r='1.2' fill='currentColor'/%3E%3Ccircle cx='26' cy='28' r='1' fill='currentColor'/%3E%3C/g%3E%3Cg id='g'%3E%3Cpath d='M 5,25 L 28,14 L 33,20 L 5,31 Z' fill='none' stroke-linejoin='round'/%3E%3Cpath d='M 33,20 L 33,29 L 5,40 L 5,31' fill='none' stroke-linejoin='round'/%3E%3Cline x1='28' y1='14' x2='28' y2='23'/%3E%3Cline x1='5' y1='40' x2='33' y2='29'/%3E%3Cpath d='M 5,35 L 33,24' opacity='0.7'/%3E%3Ccircle cx='18' cy='12' r='2.5' fill='none'/%3E%3Cpath d='M 18,9.5 Q 20,5 23,7' fill='none' stroke-linecap='round'/%3E%3C/g%3E%3C/defs%3E%3Cuse href='%23m' transform='translate(110, 15) scale(1.4)' stroke='%23815431' stroke-width='3.0' color='%23815431' opacity='0.12'/%3E%3Cuse href='%23g' transform='translate(15, 110) scale(1.3)' stroke='%23815431' stroke-width='3.0' color='%23815431' opacity='0.10'/%3E%3Cuse href='%23d' transform='translate(120, 190) scale(1.25)' stroke='%23815431' stroke-width='3.0' color='%23815431' opacity='0.11'/%3E%3Cuse href='%23k' transform='translate(110, 250) scale(1.45)' stroke='%23815431' stroke-width='3.0' color='%23815431' opacity='0.13'/%3E%3C/svg%3E`

// ── COUCHE 3 : Arrière-plan lointain (échelles 0.99 et 1.1, traits 4.5px, opacité 7.5%)
const svgPlan3 = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='360' viewBox='0 0 360 360'%3E%3Cdefs%3E%3Cg id='c'%3E%3Cpath d='M 5,20 C 5,10 15,5 30,10 C 35,12 40,17 40,22 C 38,27 30,28 20,26 C 10,24 5,22 5,20 Z' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M 12,14 C 15,10 20,10 22,13' fill='none'/%3E%3Cpath d='M 20,19 C 23,15 27,15 29,18' fill='none'/%3E%3Cpath d='M 27,23 C 29,19 32,19 34,22' fill='none'/%3E%3C/g%3E%3Cg id='b'%3E%3Crect x='5' y='12' width='32' height='14' rx='7' fill='none' transform='rotate(-25 20 20)'/%3E%3Cline x1='12' y1='18' x2='17' y2='13' stroke-linecap='round' transform='rotate(-25 20 20)'/%3E%3Cline x1='19' y1='18' x2='24' y2='13' stroke-linecap='round' transform='rotate(-25 20 20)'/%3E%3Cline x1='26' y1='18' x2='31' y2='13' stroke-linecap='round' transform='rotate(-25 20 20)'/%3E%3C/g%3E%3C/defs%3E%3Cuse href='%23b' transform='translate(260, 90) scale(0.99)' stroke='%23815431' stroke-width='4.5' color='%23815431' opacity='0.075'/%3E%3Cuse href='%23c' transform='translate(210, 130) scale(1.1)' stroke='%23815431' stroke-width='4.5' color='%23815431' opacity='0.075'/%3E%3C/svg%3E`

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)

    // États UI/UX
    const [showPassword, setShowPassword] = useState(false)
    const [emailFocused, setEmailFocused] = useState(false)
    const [passwordFocused, setPasswordFocused] = useState(false)
    const [isCardHovered, setIsCardHovered] = useState(false)

    // États de validation et erreurs
    const [emailError, setEmailError] = useState('')
    const [loginError, setLoginError] = useState('')

    const emailRef = useRef<HTMLInputElement>(null)

    // Références pour l'effet de parallaxe réactif
    const layer1Ref = useRef<HTMLDivElement>(null) // Premier plan (rapide)
    const layer2Ref = useRef<HTMLDivElement>(null) // Second plan (moyen)
    const layer3Ref = useRef<HTMLDivElement>(null) // Arrière-plan (lent)
    const cardContainerRef = useRef<HTMLDivElement>(null) // Wrapper de la carte de connexion (mouvement inversé subtil)

    // Focus automatique sur l'email dès le chargement de la page
    useEffect(() => {
        if (emailRef.current) {
            emailRef.current.focus()
        }
    }, [])

    // Écouteur d'événement pour le mouvement de parallaxe à la souris
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const { innerWidth, innerHeight } = window
            // Position normalisée de -0.5 à 0.5 par rapport au centre de l'écran
            const x = (e.clientX / innerWidth) - 0.5
            const y = (e.clientY / innerHeight) - 0.5

            // Mise à jour directe du style (optimisation DOM directe sans re-rendu React)
            // L'usage de translate3d force l'utilisation du GPU pour une fluidité à 60 FPS
            if (layer3Ref.current) {
                layer3Ref.current.style.transform = `translate3d(${x * 12}px, ${y * 12}px, 0)`
            }
            if (layer2Ref.current) {
                layer2Ref.current.style.transform = `translate3d(${x * 24}px, ${y * 24}px, 0)`
            }
            if (layer1Ref.current) {
                layer1Ref.current.style.transform = `translate3d(${x * 38}px, ${y * 38}px, 0)`
            }
            if (cardContainerRef.current) {
                // Légère parallaxe inversée (de -6px à +6px) pour enfoncer visuellement le fond
                cardContainerRef.current.style.transform = `translate3d(${-x * 8}px, ${-y * 8}px, 0)`
            }
        }

        window.addEventListener('mousemove', handleMouseMove)
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
        }
    }, [])

    // Validation du format email
    const validateEmailField = (value: string) => {
        if (!value) {
            setEmailError("L'adresse email est requise.")
            return false
        }
        const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        if (!isValid) {
            setEmailError("Veuillez saisir une adresse email valide (ex: gerant@patisserie.fr).")
            return false
        }
        setEmailError('')
        return true
    }

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoginError('')

        // Validation finale avant soumission
        const isEmailValid = validateEmailField(email)
        if (!isEmailValid) {
            return
        }

        setLoading(true)

        const supabase = createClient()
        // If password is 4 digits PIN, pad it to 6 to match Auth storage
        const authPassword = password.length === 4 && /^\d+$/.test(password)
            ? password.padEnd(6, '0')
            : password

        // Clear any leftover kiosk session to prevent profile override
        await logoutKiosk()

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password: authPassword
        })

        if (error) {
            setLoginError("Identifiants incorrects. Vérifiez votre email et mot de passe.")
            toast.error("Identifiants incorrects. Vérifiez votre email et mot de passe.")
            setLoading(false)
            return
        }

        toast.success('Connexion réussie !')
        // Use a hard redirect to the home page so the layout correctly refetches roles and clears any old client-side layout states
        window.location.href = '/'
    }

    // Style dynamique pour les Floating Labels animés
    const getLabelStyle = (isFocused: boolean, hasValue: boolean) => ({
        position: 'absolute' as const,
        left: (isFocused || hasValue) ? '12px' : '40px',
        top: (isFocused || hasValue) ? '0px' : '50%',
        transform: 'translateY(-50%)',
        fontSize: (isFocused || hasValue) ? '0.75rem' : '0.95rem',
        color: isFocused 
            ? 'var(--color-primary)' 
            : (hasValue ? 'var(--color-muted)' : 'var(--color-muted)'),
        backgroundColor: (isFocused || hasValue) ? 'var(--color-lift)' : 'transparent',
        padding: '0 6px',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'none' as const,
        fontWeight: (isFocused || hasValue) ? 700 : 500,
        zIndex: 10,
    })

    return (
        <div style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(145deg, #FDF8F3 0%, #FDE8E0 100%)',
            padding: '24px',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* ── COUCHE 3 : Arrière-plan (flou profond, bouge lentement) ── */}
            <div 
                ref={layer3Ref}
                style={{
                    position: 'absolute',
                    top: '-40px',
                    left: '-40px',
                    right: '-40px',
                    bottom: '-40px',
                    backgroundImage: `url("${svgPlan3}")`,
                    backgroundRepeat: 'repeat',
                    backgroundSize: '360px 360px',
                    pointerEvents: 'none',
                    zIndex: 0,
                    transition: 'transform 0.15s ease-out'
                }}
            />

            {/* ── COUCHE 2 : Plan intermédiaire (flou moyen, bouge moyennement) ── */}
            <div 
                ref={layer2Ref}
                style={{
                    position: 'absolute',
                    top: '-40px',
                    left: '-40px',
                    right: '-40px',
                    bottom: '-40px',
                    backgroundImage: `url("${svgPlan2}")`,
                    backgroundRepeat: 'repeat',
                    backgroundSize: '360px 360px',
                    pointerEvents: 'none',
                    zIndex: 0,
                    transition: 'transform 0.12s ease-out'
                }}
            />

            {/* ── COUCHE 1 : Premier plan (net, bouge rapidement) ── */}
            <div 
                ref={layer1Ref}
                style={{
                    position: 'absolute',
                    top: '-40px',
                    left: '-40px',
                    right: '-40px',
                    bottom: '-40px',
                    backgroundImage: `url("${svgPlan1}")`,
                    backgroundRepeat: 'repeat',
                    backgroundSize: '360px 360px',
                    pointerEvents: 'none',
                    zIndex: 0,
                    transition: 'transform 0.08s ease-out'
                }}
            />

            {/* Logo avec animation au survol de la carte (toujours au premier plan) */}
            <div className="animate-fade-in" style={{ textAlign: 'center', marginBottom: '32px', zIndex: 2 }}>
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '72px',
                    height: '72px',
                    borderRadius: '24px',
                    background: 'linear-gradient(135deg, var(--color-rose-dark), #C78A4A)',
                    marginBottom: '16px',
                    boxShadow: isCardHovered 
                        ? '0 12px 40px rgba(196,131,106,0.5)' 
                        : '0 8px 32px rgba(196,131,106,0.35)',
                    transform: isCardHovered ? 'scale(1.08) rotate(5deg)' : 'scale(1)',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                }}>
                    <CakeSlice size={36} color="white" strokeWidth={1.5} />
                </div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
                    Pâtiss&apos;App
                </h1>
                <p style={{ color: 'var(--color-muted)', marginTop: '4px', fontSize: '0.9rem' }}>
                    Espace Gérant
                </p>
            </div>

            {/* Wrapper de la carte de connexion pour parallaxe de carte */}
            <div 
                ref={cardContainerRef} 
                style={{ 
                    width: '100%', 
                    maxWidth: '420px', 
                    zIndex: 2, 
                    transition: 'transform 0.15s ease-out' 
                }}
            >
                {/* Card connexion avec effet Glassmorphism */}
                <div 
                    className="card animate-slide-up" 
                    onMouseEnter={() => setIsCardHovered(true)}
                    onMouseLeave={() => setIsCardHovered(false)}
                    style={{ 
                        width: '100%', 
                        padding: '32px',
                        background: 'rgba(255, 255, 255, 0.75)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 255, 255, 0.5)',
                        boxShadow: 'var(--shadow-lg)',
                        transition: 'box-shadow 0.3s ease, transform 0.3s ease'
                    }}
                >
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '24px', color: 'var(--color-text)' }}>
                        Connexion
                    </h2>

                    {/* Message d'erreur de connexion visuel */}
                    {loginError && (
                        <div style={{
                            padding: '12px 16px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: '#FFF5F5',
                            border: '1.5px solid var(--color-error)',
                            color: 'var(--color-error)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            marginBottom: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            animation: 'slideUp 0.2s ease both'
                        }}>
                            <span>⚠️</span>
                            <span>{loginError}</span>
                        </div>
                    )}

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Groupe Email avec Floating Label */}
                        <div>
                            <div style={{ position: 'relative' }}>
                                <Mail size={16} style={{ 
                                    position: 'absolute', 
                                    left: '14px', 
                                    top: '50%', 
                                    transform: 'translateY(-50%)', 
                                    color: emailFocused ? 'var(--color-primary)' : 'var(--color-muted)',
                                    transition: 'color 0.2s',
                                    zIndex: 5
                                }} />
                                <input
                                    ref={emailRef}
                                    id="email"
                                    type="text"
                                    className={`input ${emailError || loginError ? 'has-error' : ''}`}
                                    value={email}
                                    onChange={e => {
                                        setEmail(e.target.value)
                                        if (emailError) validateEmailField(e.target.value)
                                    }}
                                    onFocus={() => setEmailFocused(true)}
                                    onBlur={e => {
                                        setEmailFocused(false)
                                        validateEmailField(e.target.value)
                                    }}
                                    placeholder=""
                                    style={{ paddingLeft: '40px', paddingRight: '16px' }}
                                    required
                                />
                                <label htmlFor="email" style={getLabelStyle(emailFocused, email !== '')}>
                                    Email
                                </label>
                            </div>
                            {emailError && (
                                <div style={{
                                    color: 'var(--color-error)',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    marginTop: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    animation: 'slideUp 0.15s ease both'
                                }}>
                                    <span>❌</span>
                                    <span>{emailError}</span>
                                </div>
                            )}
                        </div>

                        {/* Groupe Mot de passe avec Floating Label et Bouton d'œil */}
                        <div>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{ 
                                    position: 'absolute', 
                                    left: '14px', 
                                    top: '50%', 
                                    transform: 'translateY(-50%)', 
                                    color: passwordFocused ? 'var(--color-primary)' : 'var(--color-muted)',
                                    transition: 'color 0.2s',
                                    zIndex: 5
                                }} />
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    className={`input ${loginError ? 'has-error' : ''}`}
                                    value={password}
                                    onChange={e => {
                                        setPassword(e.target.value)
                                        if (loginError) setLoginError('')
                                    }}
                                    onFocus={() => setPasswordFocused(true)}
                                    onBlur={() => setPasswordFocused(false)}
                                    placeholder=""
                                    style={{ paddingLeft: '40px', paddingRight: '44px' }}
                                    required
                                />
                                <label htmlFor="password" style={getLabelStyle(passwordFocused, password !== '')}>
                                    Mot de passe
                                </label>

                                {/* Icône Oeil interactif */}
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                    style={{
                                        position: 'absolute',
                                        right: '12px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--color-muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '6px',
                                        borderRadius: '50%',
                                        transition: 'color 0.2s, background-color 0.2s',
                                        zIndex: 5
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.color = 'var(--color-primary)'
                                        e.currentTarget.style.backgroundColor = 'rgba(131, 116, 107, 0.08)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.color = 'var(--color-muted)'
                                        e.currentTarget.style.backgroundColor = 'transparent'
                                    }}
                                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            className="btn-primary" 
                            disabled={loading} 
                            style={{ 
                                marginTop: '8px',
                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: 'var(--shadow-sm)'
                            }}
                            onMouseEnter={e => {
                                if (!loading) {
                                    e.currentTarget.style.backgroundColor = 'var(--color-primary-container)'
                                    e.currentTarget.style.transform = 'translateY(-1px)'
                                    e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                                }
                            }}
                            onMouseLeave={e => {
                                if (!loading) {
                                    e.currentTarget.style.backgroundColor = 'var(--color-primary)'
                                    e.currentTarget.style.transform = 'none'
                                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                                }
                            }}
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                            {loading ? 'Connexion…' : 'Se connecter'}
                        </button>
                    </form>

                    {/* Lien Mode Kiosque plus graphique (Bouton carte arrondi) */}
                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--color-border)' }}>
                        <a 
                            href="/kiosk" 
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '10px',
                                padding: '14px', 
                                borderRadius: 'var(--radius-md)', 
                                background: 'rgba(75, 100, 80, 0.06)', 
                                border: '1.5px solid rgba(75, 100, 80, 0.15)',
                                color: 'var(--color-secondary)', 
                                fontSize: '0.9rem', 
                                textDecoration: 'none', 
                                fontWeight: 600,
                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--color-secondary-container)'
                                e.currentTarget.style.transform = 'translateY(-1.5px)'
                                e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(75, 100, 80, 0.06)'
                                e.currentTarget.style.transform = 'none'
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)'
                            }}
                        >
                            <span style={{ fontSize: '1.1rem' }}>🖥️</span> 
                            <span>Accéder au Mode Kiosque (Employés)</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    )
}
