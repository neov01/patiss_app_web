import { z } from 'zod'

// ─── Labels de type de transaction ───
export const TransactionLabelType = z.enum(['ACOMPTE', 'SOLDE', 'VENTE_DIRECTE'])
export type TransactionLabelType = z.infer<typeof TransactionLabelType>

// ─── Statut de paiement d'une commande ───
export const PaymentStatus = z.enum(['EN_ATTENTE', 'PARTIEL', 'SOLDEE'])
export type PaymentStatus = z.infer<typeof PaymentStatus>

// ─── Méthodes de paiement ───
export const PaymentMethod = z.enum(['Espèces', 'Mobile Money', 'Carte Bancaire'])
export type PaymentMethod = z.infer<typeof PaymentMethod>

// ─── Schéma de validation pour créer une transaction ───
export const CreateTransactionSchema = z.object({
  organization_id: z.string().uuid(),
  order_id: z.string().uuid().nullable(),
  client_name: z.string().min(1, 'Le nom du client est requis'),
  amount: z.number().positive('Le montant doit être positif'),
  payment_method: PaymentMethod,
  label_type: TransactionLabelType,
  created_by: z.string().uuid(),
})
export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>

// ─── Schéma pour le résumé IA des transactions ───
export const TransactionForIASchema = z.object({
  commande_id: z.string().uuid().nullable(),
  montant: z.number(),
  label_type: TransactionLabelType,
  methode: z.string(),
  date: z.string(),
  client: z.string(),
})
export type TransactionForIA = z.infer<typeof TransactionForIASchema>
