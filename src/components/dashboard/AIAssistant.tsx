'use client'

import { useState } from 'react'
import { Bot, Send, Loader2, Sparkles } from 'lucide-react'

interface Props {
    currency: string
    organizationId: string
}

export default function AIAssistant({ currency, organizationId }: Props) {
    const [question, setQuestion] = useState('')
    const [response, setResponse] = useState('')
    const [loading, setLoading] = useState(false)

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
                    <div 
                        dangerouslySetInnerHTML={{ __html: response }} 
                        className="ai-response"
                        style={{ margin: 0 }}
                    />
                ) : (
                    <p style={{ margin: 0, color: 'var(--color-muted)', fontStyle: 'italic' }}>
                        Posez une question pour obtenir une analyse de vos données financières.
                    </p>
                )}
            </div>

            <style jsx>{`
                .ai-response :global(ul) {
                    margin: 8px 0;
                    padding-left: 20px;
                }
                .ai-response :global(li) {
                    margin-bottom: 4px;
                }
                .ai-response :global(b) {
                    color: #2D1B0E;
                    font-weight: 700;
                }
            `}</style>

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
