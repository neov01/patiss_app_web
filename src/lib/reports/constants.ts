export const REPORT_FROM = "Pâtiss'App <onboarding@resend.dev>"

/** URL publique de l'application pour le lien « Ouvrir le tableau de bord » ; null = lien masqué. */
export function reportAppUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim()
  return url ? url : null
}
