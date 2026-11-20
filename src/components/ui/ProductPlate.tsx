import Image from 'next/image'
import type { ReactNode } from 'react'
import { CakeSlice, Croissant, Cookie, CupSoda, Package, type LucideIcon } from 'lucide-react'

interface Props {
    name: string
    /** Photo importée depuis le catalogue produits (products.image_url). */
    imageUrl?: string | null
    /** Catégorie catalogue : donne la teinte et l'icône de la plaque sans photo. */
    category?: string | null
    /** Pastilles posées sur la plaque (quantité, actions…). */
    children?: ReactNode
    sizes?: string
}

// Une teinte et une icône par famille de produits (teintes issues de DESIGN.md).
const CATEGORY_PLATES: Record<string, { tone: string; icon: LucideIcon }> = {
    'Gâteaux': { tone: 'cake', icon: CakeSlice },
    'Viennoiseries': { tone: 'viennoiserie', icon: Croissant },
    'Petits fours': { tone: 'petit-four', icon: Cookie },
    'Boissons': { tone: 'boisson', icon: CupSoda },
    'Autres': { tone: 'autre', icon: Package },
}

/**
 * Plaque produit partagée (caisse, catalogue) : photo si elle existe,
 * sinon plaque teintée par catégorie avec son icône (ou monogramme si la
 * catégorie est inconnue). Si l'image échoue ou est indisponible hors-ligne,
 * la plaque reste visible dessous.
 */
export default function ProductPlate({ name, imageUrl, category, children, sizes = '(max-width: 640px) 50vw, 220px' }: Props) {
    const plate = category ? CATEGORY_PLATES[category] : undefined
    const initial = (name || '?').trim().charAt(0).toUpperCase()
    const tone = plate?.tone ?? String(((name || '').charCodeAt(0) || 0) % 4)
    const Icon = plate?.icon

    return (
        <div className="product-tile-plate" data-tone={tone}>
            {Icon ? (
                <span className="product-tile-mark" aria-hidden="true">
                    <Icon size={40} strokeWidth={1.6} />
                </span>
            ) : (
                <span className="product-tile-initial" aria-hidden="true">{initial}</span>
            )}
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
