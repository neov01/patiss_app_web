'use client'

import { useState, useEffect } from 'react'
import { Bot, Send, Loader2, Sparkles } from 'lucide-react'

interface Props {
    currency: string
    organizationId: string
}

export default function AIAssistant({ currency, organizationId }: Props) {
    const [question, setQuestion] = useState('')
    const [response, setResponse] = useState('')
    const [loading, setLoading] = useState(false)
    const [autoLoaded, setAutoLoaded] = useState(false)

    useEffect(() => {
        if (!autoLoaded) {
            setAutoLoaded(true)
            askAI('Donne-moi un bref résumé de la situation financière du jour.')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function askAI(q?: string) {
        const prompt = q ?? question
        if (!prompt.trim()) return
        setLoading(true)
        setResponse('')
        try {
            const res = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: prompt, organizationId, currency }),
            })
            const data = await res.json()
            setResponse(data.answer ?? "Je n'ai pas pu analyser les données.")
        } catch {
            setResponse("Erreur de connexion à l'assistant IA.")
        }
        setLoading(false)
        if (!q) setQuestion('')
    }

    return (
        <div className="card" style={{ borderLeft: '4px solid #C4836A' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: 'linear-gradient(135deg, #C4836A, #C78A4A)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Bot size={18} color="white" />
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Comptable IA</h3>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-muted)' }}>Propulsé par Gemini</p>
                </div>
                <Sparkles size={16} style={{ marginLeft: 'auto', color: '#C78A4A' }} />
            </div>

            {/* Réponse */}
            <div style={{
                minHeight: '80px', padding: '14px', borderRadius: 'var(--radius-md)',
                background: 'var(--color-cream)', marginBottom: '12px',
                fontSize: '0.9rem', color: 'var(--color-text)', lineHeight: 1.6,
            }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-muted)' }}>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Analyse en cours…</span>
                    </div>
                ) : response ? (
                    <p style={{ margin: 0 }}>{response}</p>
                ) : (
                    <p style={{ margin: 0, color: 'var(--color-muted)', fontStyle: 'italic' }}>
                        L&apos;assistant analyse vos données…
                    </p>
                )}
            </div>

            {/* Input question */}
            <div style={{ display: 'flex', gap: '8px' }}>
                <input
                    className="input"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    placeholder="Posez une question (ex: Quelles recettes génèrent le plus de marge ?)"
                    onKeyDown={e => e.key === 'Enter' && askAI()}
                    disabled={loading}
                />
                <button onClick={() => askAI()} className="btn-primary" disabled={loading || !question.trim()}
                    style={{ padding: '0 16px', minWidth: '44px' }}>
                    <Send size={16} />
                </button>
            </div>
        </div>
    )
}
