export const PRODUCT_CATEGORIES = ['Tous', 'Gâteaux', 'Viennoiseries', 'Petits fours', 'Boissons', 'Autres'] as const
export type ProductCategory = typeof PRODUCT_CATEGORIES[number]

export const CATEGORY_ICONS: Record<string, string> = {
  'Gâteaux': '🎂',
  'Viennoiseries': '🥐',
  'Petits fours': '🍪',
  'Boissons': '🧃',
  'Autres': '📦',
}

export const PAYMENT_METHODS = ['Espèces', 'Orange Money', 'Wave', 'MTN MOMO', 'Moov Money'] as const
export type PaymentMethodName = typeof PAYMENT_METHODS[number]
