import Image from 'next/image'
import type { ReactNode } from 'react'

interface Props {
    name: string
    /** Photo importée depuis le catalogue produits (products.image_url). */
    imageUrl?: string | null
    /** Pastilles posées sur la plaque (quantité, actions…). */
    children?: ReactNode
    sizes?: string
}

/**
 * Plaque produit partagée (caisse, catalogue) : photo si elle existe,
 * sinon monogramme teinté. Si l'image échoue ou est indisponible hors-ligne,
 * le monogramme reste visible dessous.
 */
export default function ProductPlate({ name, imageUrl, children, sizes = '(max-width: 640px) 50vw, 220px' }: Props) {
    const initial = (name || '?').trim().charAt(0).toUpperCase()
    const tone = ((name || '').charCodeAt(0) || 0) % 4

    return (
        <div className="product-tile-plate" data-tone={tone}>
            <span className="product-tile-initial" aria-hidden="true">{initial}</span>
            {imageUrl && (
                <Image
                    src={imageUrl}
                    alt=""
                    fill
                    unoptimized
                    sizes={sizes}
                    className="product-tile-photo"
                    onError={e => { e.currentTarget.style.display = 'none' }}
                />
            )}
            {children}
        </div>
    )
}
