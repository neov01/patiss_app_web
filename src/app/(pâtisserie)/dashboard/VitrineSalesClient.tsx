'use client'

import { useState } from 'react'
import { createVitrineSale } from '@/lib/actions/orders'
import { toast } from 'sonner'
import { Plus, Minus, ShoppingCart, Loader2 } from 'lucide-react'

type Recipe = {
    id: string
    name: string
    sale_price: number
}

export default function VitrineSalesClient({ recipes, currency }: { recipes: Recipe[], currency: string }) {
    const [cart, setCart] = useState<{ recipe: Recipe, quantity: number }[]>([])
    const [loading, setLoading] = useState(false)

    const addToCart = (recipe: Recipe) => {
        setCart(prev => {
            const existing = prev.find(item => item.recipe.id === recipe.id)
            if (existing) {
                return prev.map(item => item.recipe.id === recipe.id ? { ...item, quantity: item.quantity + 1 } : item)
            }
            return [...prev, { recipe, quantity: 1 }]
        })
    }

    const removeFromCart = (recipeId: string) => {
        setCart(prev => {
            const existing = prev.find(item => item.recipe.id === recipeId)
            if (existing && existing.quantity > 1) {
                return prev.map(item => item.recipe.id === recipeId ? { ...item, quantity: item.quantity - 1 } : item)
            }
            return prev.filter(item => item.recipe.id !== recipeId)
        })
    }

    const totalAmount = cart.reduce((sum, item) => sum + (item.recipe.sale_price * item.quantity), 0)

    const handleCheckout = async () => {
        if (cart.length === 0) return
        
        setLoading(true)
        const res = await createVitrineSale({
            total_amount: totalAmount,
            items: cart.map(item => ({
                recipe_id: item.recipe.id,
                quantity: item.quantity,
                unit_price: item.recipe.sale_price
            }))
        })
        setLoading(false)

        if (res.error) {
            toast.error(res.error)
        } else {
            toast.success('Vente encaissée avec succès !')
            setCart([])
        }
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: '24px', marginTop: '32px' }}>
            {/* Grille de produits */}
            <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px' }}>Vente Rapide (Vitrine)</h2>
                {recipes.length === 0 ? (
                    <p style={{ color: '#6b7280' }}>Aucune recette disponible.</p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
                        {recipes.map(recipe => (
                            <button
                                key={recipe.id}
                                onClick={() => addToCart(recipe)}
                                style={{
                                    background: '#fff',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'transform 0.1s, box-shadow 0.1s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
                                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <div style={{ fontWeight: 600, color: '#374151' }}>{recipe.name}</div>
                                <div style={{ color: '#2563EB', fontWeight: 700 }}>{recipe.sale_price.toLocaleString('fr-FR')} {currency}</div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Ticket de caisse / Panier */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShoppingCart size={18} />
                    Panier en cours
                </div>
                
                <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
                    {cart.length === 0 ? (
                        <div style={{ color: '#9ca3af', textAlign: 'center', marginTop: '40px' }}>Le panier est vide</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {cart.map(item => (
                                <div key={item.recipe.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{item.recipe.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                            {item.recipe.sale_price} {currency} / u
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button 
                                            onClick={() => removeFromCart(item.recipe.id)}
                                            style={{ width: '28px', height: '28px', borderRadius: '14px', border: 'none', background: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <span style={{ fontWeight: 600, width: '20px', textAlign: 'center' }}>{item.quantity}</span>
                                        <button 
                                            onClick={() => addToCart(item.recipe)}
                                            style={{ width: '28px', height: '28px', borderRadius: '14px', border: 'none', background: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ padding: '20px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '1.25rem' }}>
                        <span style={{ fontWeight: 600 }}>Total :</span>
                        <span style={{ fontWeight: 800, color: '#111827' }}>{totalAmount.toLocaleString('fr-FR')} {currency}</span>
                    </div>
                    <button 
                        onClick={handleCheckout}
                        disabled={cart.length === 0 || loading}
                        className="btn-primary" 
                        style={{ width: '100%', height: '48px', opacity: cart.length === 0 ? 0.5 : 1 }}
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Encaisser'}
                    </button>
                </div>
            </div>
        </div>
    )
}
