'use client'

import { useState, useEffect, useRef } from 'react'
import { Bot, Send, Loader2, Sparkles, MoreVertical, Trash2 } from 'lucide-react'
import DOMPurify from 'dompurify'

interface Props {
    currency: string
    organizationId: string
    userRole?: string
}

const QUICK_QUESTIONS = [
    { label: '📊 Résumé du jour', text: 'Donne-moi un résumé des ventes d\'aujourd\'hui.' },
    { label: '🏆 Meilleurs produits', text: 'Quels sont mes produits les plus vendus cette semaine ?' },
    { label: '📈 Prévision demain', text: 'Quelle prévision de chiffre d\'affaires pour demain ?' },
    { label: '💰 Chiffre du mois', text: 'Quel est mon chiffre d\'affaires ce mois-ci ?' },
]

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000 // 24h

export default function AIAssistant({ currency, organizationId, userRole = 'vendeur' }: Props) {
    const [question, setQuestion] = useState('')
    const [history, setHistory] = useState<Array<{ q: string; a: string; loading?: boolean }>>([])
    const [loading, setLoading] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const chatEndRef = useRef<HTMLDivElement>(null)
    const storageKey = `ai-chat-${organizationId}`

    // Restaurer l'historique depuis localStorage au montage
    useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey)
            if (raw) {
                const { ts, data } = JSON.parse(raw)
                if (Date.now() - ts < CACHE_DURATION_MS) {
                    setHistory(data)
                } else {
                    localStorage.removeItem(storageKey)
                }
            }
        } catch {
            // ignore parse errors
        }
    }, [storageKey])

    // Auto-scroll vers le bas
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [history])

    function persistHistory(h: typeof history) {
        try {
            localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), data: h }))
        } catch {
            // ignore storage errors (private mode, quota)
        }
    }

    function clearHistory() {
        setHistory([])
        localStorage.removeItem(storageKey)
        setShowMenu(false)
    }

    async function askAI(q?: string) {
        const prompt = q ?? question
        if (!prompt.trim()) return

        const newHistory = [...history, { q: prompt, a: '', loading: true }].slice(-10)
        setHistory(newHistory)
        setLoading(true)
        if (!q) setQuestion('')

        try {
            const res = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: prompt, organizationId, currency, userRole }),
            })

            if (!res.ok || !res.body) throw new Error('Réponse invalide')

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let accumulated = ''

            setHistory(prev => prev.map((item, idx) =>
                idx === prev.length - 1 ? { ...item, loading: false } : item
            ))

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                accumulated += decoder.decode(value, { stream: true })
                setHistory(prev => prev.map((item, idx) =>
                    idx === prev.length - 1 ? { ...item, a: accumulated } : item
                ))
            }

            const tail = decoder.decode()
            if (tail) accumulated += tail

            setHistory(prev => {
                const updated = prev.map((item, idx) =>
                    idx === prev.length - 1 ? { ...item, a: accumulated, loading: false } : item
                )
                persistHistory(updated)
                return updated
            })

        } catch {
            setHistory(prev => {
                const updated = prev.map((item, idx) =>
                    idx === prev.length - 1
                        ? { ...item, a: "Erreur de connexion à l'assistant IA.", loading: false }
                        : item
                )
                persistHistory(updated)
                return updated
            })
        }

        setLoading(false)
    }

    function sanitizeHtml(html: string) {
        if (!html) return ''
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'br', 'ul', 'ol', 'li', 'p'],
            ALLOWED_ATTR: [],
        })
    }

    const showQuickQuestions = history.length === 0 || (!loading && history.length > 0)

    return (
        <div className="card shadow-2xl transition-all duration-500 hover:shadow-primary/5" style={{ padding: 0, overflow: 'hidden', height: '500px', display: 'flex', flexDirection: 'column', border: 'none', background: 'var(--color-lift)' }}>
            {/* Header */}
            <div style={{
                background: 'rgba(129, 84, 49, 0.95)',
                backdropFilter: 'blur(20px)',
                padding: '24px 32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '16px',
                        background: 'rgba(255,255,255,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
                    }}>
                        <Sparkles size={24} color="white" />
                    </div>
                    <div>
                        <h4 style={{ margin: 0, color: 'white', fontWeight: 900, fontFamily: 'var(--font-display)', fontSize: '1.15rem', letterSpacing: '-0.02em' }}>Assistant Compta-Gâteau</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ADE80', animation: 'pulse-dot 2s infinite' }} />
                            <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Intelligence Artisanale</p>
                        </div>
                    </div>
                </div>
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowMenu(v => !v)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}
                    >
                        <MoreVertical size={20} color="white" />
                    </button>
                    {showMenu && (
                        <div style={{
                            position: 'absolute', right: 0, top: '100%', marginTop: '4px',
                            background: 'white', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                            padding: '6px', zIndex: 50, minWidth: '170px',
                        }}>
                            <button
                                onClick={clearHistory}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '10px 12px', border: 'none',
                                    background: 'none', cursor: 'pointer', borderRadius: '8px',
                                    fontSize: '0.875rem', color: '#D94F38', fontWeight: 600,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#FFF1F0')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                                <Trash2 size={15} />
                                Effacer la conversation
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Zone de discussion */}
            <div style={{
                flex: 1, padding: '20px 24px', background: 'var(--color-surface-container-lowest)',
                overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px',
            }} className="no-scrollbar" onClick={() => setShowMenu(false)}>
                {history.length === 0 && (
                    <div style={{ display: 'flex', gap: '12px', maxWidth: '85%' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Bot size={16} color="var(--color-primary)" />
                        </div>
                        <div style={{ background: 'var(--color-surface-container-low)', padding: '16px', borderRadius: '0 16px 16px 16px', fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
                            Bonjour ! J&apos;ai analysé vos données. Souhaitez-vous un récapitulatif ou une prévision ?
                        </div>
                    </div>
                )}

                {history.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{
                            alignSelf: 'flex-end',
                            background: 'rgba(192, 138, 99, 0.15)',
                            padding: '12px 18px',
                            borderRadius: '16px 16px 0 16px',
                            fontSize: '0.85rem', fontWeight: 600,
                            color: 'var(--color-on-primary-container)',
                            maxWidth: '80%'
                        }}>
                            {item.q}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', maxWidth: '85%', alignSelf: 'flex-start' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Bot size={16} color="var(--color-primary)" />
                            </div>
                            <div style={{ background: 'var(--color-surface-container-low)', padding: '16px', borderRadius: '0 16px 16px 16px', fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
                                {item.loading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>Analyse en cours…</span>
                                    </div>
                                ) : (
                                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.a) }} className="ai-response" />
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={chatEndRef} />
            </div>

            {/* Questions rapides */}
            {showQuickQuestions && !loading && (
                <div style={{
                    padding: '10px 16px 4px',
                    display: 'flex', gap: '8px', flexWrap: 'wrap',
                    borderTop: '1px solid var(--color-surface-container-low)',
                    background: 'var(--color-surface-container-lowest)',
                }}>
                    {QUICK_QUESTIONS.map(qq => (
                        <button
                            key={qq.label}
                            onClick={() => askAI(qq.text)}
                            disabled={loading}
                            style={{
                                padding: '6px 12px', borderRadius: '99px',
                                border: '1.5px solid var(--color-border)',
                                background: 'white', cursor: 'pointer',
                                fontSize: '0.78rem', fontWeight: 600,
                                color: 'var(--color-on-surface)',
                                transition: 'all 0.15s',
                                whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = '#C4836A'
                                e.currentTarget.style.color = '#C4836A'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = 'var(--color-border)'
                                e.currentTarget.style.color = 'var(--color-on-surface)'
                            }}
                        >
                            {qq.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Zone de saisie */}
            <div style={{ padding: '12px 24px 16px', borderTop: '1px solid var(--color-surface-container-low)' }}>
                <div style={{ position: 'relative' }}>
                    <input
                        className="input"
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        placeholder="Posez une question..."
                        onKeyDown={e => e.key === 'Enter' && askAI()}
                        disabled={loading}
                        style={{ background: 'var(--color-surface-container-low)', borderRadius: '99px', paddingRight: '48px', minHeight: '48px' }}
                    />
                    <button
                        onClick={() => askAI()}
                        disabled={loading || !question.trim()}
                        style={{
                            position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
                            width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', border: 'none',
                            cursor: loading || !question.trim() ? 'not-allowed' : 'pointer',
                            opacity: loading || !question.trim() ? 0.5 : 1,
                        }}
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>

            <style jsx>{`
                .ai-response :global(ul) { margin: 8px 0; padding-left: 20px; }
                .ai-response :global(li) { margin-bottom: 4px; }
                .ai-response :global(b) { font-weight: 700; color: var(--color-primary); }
            `}</style>
        </div>
    )
}
