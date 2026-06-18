import { z } from 'zod'

export const orderItemSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1, "La désignation est requise"),
  quantity: z.number().positive("La quantité doit être supérieure à 0"),
  unit_price: z.number().positive("Le prix unitaire doit être supérieur à 0"),
  from_inventory: z.boolean(),
  subtotal: z.number().min(0).optional()
})

export const orderSchema = z.object({
  id: z.string().uuid().optional(),
  order_number: z.string().min(1, "Le numéro de commande est requis"),
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().min(2, "Le nom du client est trop court"),
  customer_contact: z.string().min(8, "Le numéro de téléphone est trop court ou requis"),
  pickup_date: z.string().min(1, "La date de retrait est requise"),
  status: z.string().default('pending'),
  priority: z.string().default('normale'),
  reception_type: z.enum(['retrait', 'livraison']),
  delivery_address: z.string().optional(),
  order_channel: z.string().optional(),
  
  // Financials
  subtotal: z.number().min(0, "Le sous-total ne peut pas être négatif"),
  discount_amount: z.number().optional().default(0),
  delivery_fee: z.number().optional().default(0),
  total_amount: z.number().min(0, "Le total ne peut pas être négatif"),
  deposit_amount: z.number().min(0, "L'acompte ne peut pas être négatif"),
  deposit_payment_method: z.string().optional(),
  customization_notes: z.string().optional(),
  custom_image_url: z.string().optional(),
  creation_started_at: z.string().datetime().optional(),
  creation_completed_at: z.string().datetime().optional(),
  creation_duration_seconds: z.number().int().min(0).optional(),
  
  items: z.array(orderItemSchema).min(1, "La commande doit contenir au moins un produit")
}).refine((data) => data.deposit_amount <= data.total_amount, {
  message: "L'acompte ne peut pas être supérieur au montant total",
  path: ["deposit_amount"]
}).refine((data) => {
    // Vérification de la cohérence du total (permissif sur les arrondis si nécessaire)
    const expectedTotal = data.subtotal - (data.discount_amount || 0)
    return Math.abs(data.total_amount - expectedTotal) < 1 // Tolérance 1 unité monétaire
}, {
    message: "Le montant total est incohérent avec le sous-total",
    path: ["total_amount"]
})

export type OrderFormValues = z.infer<typeof orderSchema>
