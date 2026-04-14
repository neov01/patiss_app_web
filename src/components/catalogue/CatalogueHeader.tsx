'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProductModal from './ProductModal'

interface CatalogueHeaderProps {
  products: any[]
  availableIngredients: any[]
}

export default function CatalogueHeader({ products, availableIngredients }: CatalogueHeaderProps) {
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const router = useRouter()

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      marginBottom: '32px',
      gap: '16px',
      flexWrap: 'wrap'
    }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-text)', margin: 0 }}>
          Catalogue Produits
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', marginTop: '4px', fontWeight: 500 }}>
          {products?.length ?? 0} produits enregistrés · Gérer l&apos;offre unifiée
        </p>
      </div>

      <button
        onClick={() => setIsProductModalOpen(true)}
        className="btn-primary"
      >
        <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>+</span>
        Ajouter au catalogue
      </button>

      {/* La modale a déjà son propre overlay système via Portal ou position fixed */}
      <ProductModal
        open={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        availableIngredients={availableIngredients}
        existingProducts={products}
        onSuccess={() => {
          setIsProductModalOpen(false)
          router.refresh()
        }}
      />
    </div>
  )
}
