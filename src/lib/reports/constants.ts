export const REPORT_FROM = "Pâtiss'App <onboarding@resend.dev>"

/**
 * Destinataire de secours hors production quand REPORT_DEV_EMAIL n'est pas défini.
 * Doit rester l'adresse du propriétaire du compte Resend : sans domaine vérifié,
 * l'expéditeur onboarding@resend.dev ne peut écrire qu'à cette adresse.
 */
export const REPORT_FALLBACK_EMAIL = 'adouwilfried@gmail.com'

/** URL publique de l'application pour le lien « Ouvrir le tableau de bord » ; null = lien masqué. */
export function reportAppUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim()
  return url ? url : null
}
