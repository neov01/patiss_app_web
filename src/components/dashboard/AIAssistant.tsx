'use client'

import { useState, useEffect, useRef } from 'react'
import { Bot, Send, Loader2, Sparkles, Lightbulb, FileText, Download } from 'lucide-react'

interface Props {
    currency: string
    organizationId: string
    userRole?: string
}

export default function AIAssistant({ currency, organizationId, userRole = 'vendeur' }: Props) {
    const [question, setQuestion] = useState('')
    const [history, setHistory] = useState<Array<{ q: string; a: string; loading?: boolean }>>([])
    const [loading, setLoading] = useState(false)
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [suggestionsLoading, setSuggestionsLoading] = useState(true)
    const chatEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        async function loadSuggestions() {
            try {
                const res = await fetch('/api/ai-suggestions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ organizationId }),
                })
                const data = await res.json()
                setSuggestions(data.suggestions ?? [])
            } catch {
                setSuggestions([])
            } finally {
                setSuggestionsLoading(false)
            }
        }
        if (organizationId) loadSuggestions()
    }, [organizationId])

    // Auto-scroll vers le bas à chaque nouveau message
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [history])

    async function askAI(q?: string) {
        const prompt = q ?? question
        if (!prompt.trim()) return
        
        // Ajouter la question à l'historique avec un indicateur de chargement
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
            
            // Mettre à jour l'entrée correspondante dans l'historique
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

    // Sécurisation XSS : Autorise seulement les balises saines
    function sanitizeHtml(html: string) {
        if (!html) return ''
        let clean = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, '')
        clean = clean.replace(/<iframe\b[^>]*>([\s\S]*?)<\/iframe>/gmi, '')
        clean = clean.replace(/<([a-z1-6]+)\s+[^>]*>/gmi, '<$1>')
        return clean
    }

    const handlePrint = () => {
        window.print()
    }

    return (
        <div className="card" style={{ borderLeft: '4px solid #C4836A' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }} className="no-print">
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
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {history.length > 0 && (
                        <button 
                            onClick={handlePrint}
                            className="btn-outline"
                            style={{ 
                                padding: '6px 12px', 
                                fontSize: '0.75rem', 
                                gap: '6px', 
                                height: '32px',
                                borderColor: '#EDCFBF',
                                color: '#C4836A'
                            }}
                        >
                            <Download size={14} />
                            Exporter
                        </button>
                    )}
                    <Sparkles size={16} style={{ color: '#C78A4A' }} />
                </div>
            </div>

            {/* Header invisible à l'écran, visible à l'impression */}
            <div className="print-only" style={{ marginBottom: '30px', borderBottom: '2px solid #C4836A', paddingBottom: '15px' }}>
                <h1 style={{ color: '#2D1B0E', margin: 0 }}>Pâtiss'App - Bilan IA</h1>
                <p style={{ color: '#C4836A', margin: '5px 0 0', fontWeight: 600 }}>Rapport d'analyse financière - {new Date().toLocaleDateString('fr-FR')}</p>
            </div>

            {/* Zone de discussion scrollable */}
            <div style={{
                height: '320px', padding: '14px', borderRadius: 'var(--radius-md)',
                background: 'var(--color-cream)', marginBottom: '16px',
                fontSize: '0.9rem', color: 'var(--color-text)', lineHeight: 1.6,
                display: 'flex', flexDirection: 'column', gap: '20px',
                overflowY: 'auto',
                scrollBehavior: 'smooth'
            }} className="chat-container">
                {history.length === 0 ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <p style={{ margin: 0, color: 'var(--color-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                            Posez une question pour obtenir une analyse de vos données financières.
                        </p>
                    </div>
                ) : (
                    history.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* Question utilisateur */}
                            <div style={{ 
                                alignSelf: 'flex-end',
                                background: '#fff',
                                padding: '10px 16px',
                                borderRadius: '18px 18px 4px 18px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: '#2D1B0E',
                                border: '1px solid var(--color-border)',
                                maxWidth: '85%',
                                boxShadow: '0 2px 8px rgba(45,27,14,0.04)'
                            }}>
                                {item.q}
                            </div>

                            {/* Réponse IA */}
                            <div style={{ alignSelf: 'flex-start', width: '90%' }}>
                                {item.loading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-muted)', paddingLeft: '4px' }}>
                                        <Loader2 size={16} className="animate-spin" />
                                        <span style={{ fontSize: '0.8rem' }}>Analyse en cours…</span>
                                    </div>
                                ) : (
                                    <div 
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.a) }} 
                                        className="ai-response"
                                        style={{ margin: 0 }}
                                    />
                                )}
                            </div>
                        </div>
                    ))
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

                @media print {
                    :global(body *) {
                        visibility: hidden;
                    }
                    .chat-container, .chat-container *, .print-only, .print-only * {
                        visibility: visible;
                    }
                    .chat-container {
                        position: absolute;
                        left: 0;
                        top: 80px;
                        width: 100%;
                        height: auto !important;
                        overflow: visible !important;
                        background: white !important;
                        padding: 0 !important;
                    }
                    .print-only {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        display: block !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    :global(.animate-fade-in) {
                        animation: none !important;
                    }
                    .ai-response {
                        page-break-inside: avoid;
                    }
                }

                .print-only {
                    display: none;
                }
            `}</style>

            {/* Suggestions contextuelles */}
            {suggestionsLoading ? (
                <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Loader2 size={12} className="animate-spin" style={{ color: '#C78A4A' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Chargement des suggestions…</span>
                </div>
            ) : suggestions.length > 0 && (
                <div style={{ marginBottom: '12px' }} className="no-print">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <Lightbulb size={13} color="#C78A4A" />
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#C78A4A', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Suggestions</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {suggestions.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => askAI(s)}
                                disabled={loading}
                                style={{
                                    padding: '7px 13px',
                                    borderRadius: '99px',
                                    border: '1.5px solid #EDCFBF',
                                    background: '#FEF3EC',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    color: '#C4836A',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    opacity: loading ? 0.5 : 1
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#EDCFBF' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF3EC' }}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Input question */}
            <div style={{ display: 'flex', gap: '8px' }} className="no-print">
                <input
                    className="input"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    placeholder="Posez une question…"
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
