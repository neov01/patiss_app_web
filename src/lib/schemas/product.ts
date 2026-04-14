import { z } from 'zod'

export const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Le nom du produit est trop court"),
  category: z.enum(['Gâteaux', 'Viennoiseries', 'Petits fours', 'Boissons', 'Autres']),
  type: z.enum(['maison', 'revente']),
  sellingPrice: z.number().min(0, "Le prix de vente doit être positif"),
  trackStock: z.boolean().default(false),
  currentStock: z.number().min(0).optional(),
  purchaseCost: z.number().min(0).optional(),
  composition: z.array(z.object({
    ingredientId: z.string().uuid(),
    quantity: z.number().min(0)
  })).optional(),
  updateMode: z.enum(['increment', 'set']).default('increment').optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'revente' && (data.purchaseCost === undefined || data.purchaseCost <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Le coût d'achat est obligatoire pour les produits de revente",
      path: ['purchaseCost'],
    });
  }
  // Composition est maintenant optionnelle comme demandé
  if (data.trackStock && (data.currentStock === undefined || data.currentStock < 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Le stock initial est requis si le suivi est activé",
      path: ['currentStock'],
    });
  }
});

export type ProductFormValues = z.infer<typeof productSchema>;
