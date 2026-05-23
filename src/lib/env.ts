import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL doit être une URL valide'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY manquante'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY manquante'),
  GEMINI_API_KEY: z.string().min(10, 'GEMINI_API_KEY manquante'),
  CRON_SECRET: z.string().min(20, 'CRON_SECRET trop courte (min 20 caractères)'),
  RESEND_API_KEY: z.string().min(10, 'RESEND_API_KEY manquante').optional(),
  REPORT_RECIPIENT_EMAIL: z.string().email().optional(),
})

function validateEnv() {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Variables d'environnement invalides ou manquantes:\n${missing}\n\nCopiez .env.example vers .env.local et renseignez les valeurs.`)
  }
  return parsed.data
}

export const env = validateEnv()
