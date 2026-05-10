'use client'

import { useState, useEffect, useRef } from 'react'
import { Bot, Send, Loader2, Sparkles, MoreVertical } from 'lucide-react'

interface Props {
    currency: string
    organizationId: string
    userRole?: string
}

export default function AIAssistant({ currency, organizationId, userRole = 'vendeur' }: Props) {
    const [question, setQuestion] = useState('')
    const [history, setHistory] = useState<Array<{ q: string; a: string; loading?: boolean }>>([])
    const [loading, setLoading] = useState(false)
    const chatEndRef = useRef<HTMLDivElement>(null)

    // Auto-scroll vers le bas
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [history])

    async function askAI(q?: string) {
        const prompt = q ?? question
        if (!prompt.trim()) return
        
        const newHistory = [...history, { q: prompt, a: '', loading: true }].slice(-5)
        setHistory(newHistory)
        setLoading(true)
        
        try {
            const res = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: prompt, organizationId, currency, userRole }),
            })
            const data = await res.json()
            
            setHistory(prev => prev.map(item => 
                item.q === prompt && item.loading 
                    ? { q: prompt, a: data.answer ?? "Je n'ai pas pu analyser les données.", loading: false }
                    : item
            ))
        } catch {
            setHistory(prev => prev.map(item => 
                item.q === prompt && item.loading 
                    ? { q: prompt, a: "Erreur de connexion à l'assistant IA.", loading: false }
                    : item
            ))
        }
        setLoading(false)
        if (!q) setQuestion('')
    }

    // Sécurisation XSS
    function sanitizeHtml(html: string) {
        if (!html) return ''
        let clean = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, '')
        clean = clean.replace(/<([a-z1-6]+)\s+[^>]*>/gmi, '<$1>')
        return clean
    }

    return (
        <div className="card shadow-2xl transition-all duration-500 hover:shadow-primary/5" style={{ padding: 0, overflow: 'hidden', height: '500px', display: 'flex', flexDirection: 'column', border: 'none', background: 'var(--color-lift)' }}>
            {/* Header style - Editorial Glassmorphism */}
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
                <div style={{ display: 'flex', gap: '8px' }}>
                     <div className="p-2 rounded-full hover:bg-white/10 cursor-pointer transition-colors">
                        <MoreVertical size={20} color="white" />
                     </div>
                </div>
            </div>

            {/* Zone de discussion */}
            <div style={{
                flex: 1, padding: '24px', background: 'var(--color-surface-container-lowest)',
                overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px',
            }} className="no-scrollbar">
                {history.length === 0 ? (
                    <div style={{ display: 'flex', gap: '12px', maxWidth: '85%' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Bot size={16} color="var(--color-primary)" />
                        </div>
                        <div style={{ background: 'var(--color-surface-container-low)', padding: '16px', borderRadius: '0 16px 16px 16px', fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
                            Bonjour Wilfried ! J'ai analysé vos ventes d'hier. Souhaitez-vous un récapitulatif ou une prévision pour aujourd'hui ?
                        </div>
                    </div>
                ) : (
                    history.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Question utilisateur */}
                            <div style={{ 
                                alignSelf: 'flex-end',
                                background: 'rgba(192, 138, 99, 0.15)', /* Transparent Primary container */
                                padding: '12px 18px',
                                borderRadius: '16px 16px 0 16px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: 'var(--color-on-primary-container)',
                                maxWidth: '80%'
                            }}>
                                {item.q}
                            </div>

                            {/* Réponse IA */}
                            <div style={{ display: 'flex', gap: '12px', maxWidth: '85%', alignSelf: 'flex-start' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Bot size={16} color="var(--color-primary)" />
                                </div>
                                <div style={{ 
                                    background: 'var(--color-surface-container-low)', 
                                    padding: '16px', 
                                    borderRadius: '0 16px 16px 16px', 
                                    fontSize: '0.875rem', 
                                    color: 'var(--color-on-surface)' 
                                }}>
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
                    ))
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Zone de saisie */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-surface-container-low)' }}>
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
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', border: 'none'
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
