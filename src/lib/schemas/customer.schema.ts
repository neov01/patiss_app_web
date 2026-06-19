import { z } from "zod";

// Nettoyage de numéro de téléphone FR
export const normalizeFrenchPhone = (phone: string) => {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("33")) cleaned = "0" + cleaned.slice(2);
  if (cleaned.length === 9 && !cleaned.startsWith("0")) cleaned = "0" + cleaned;
  return cleaned;
};

// Schéma pour le client
export const CustomerSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  phone: z
    .string()
    .transform(normalizeFrenchPhone)
    .refine((val) => val.length === 10, "Numéro de téléphone invalide"),
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  birth_date: z.string().optional().nullable().or(z.literal("")),
});

export type CustomerFormValues = z.infer<typeof CustomerSchema>;
