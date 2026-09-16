/**
 * Construction des filtres de recherche PostgREST (`.or(...)`).
 *
 * PostgREST parse `or=(col.op.val,col2.op.val2)` comme un arbre logique : la
 * virgule sépare les conditions et les parenthèses délimitent les groupes. Une
 * valeur brute contenant l'un de ces caractères — ou un cast `::` dans le nom
 * de colonne — fait échouer le parse et renvoie une 400
 * « failed to parse logic tree », remontée à l'utilisateur en toast.
 *
 * La parade documentée est de guillemeter la valeur ; on le fait
 * systématiquement pour n'avoir qu'un seul chemin de code à éprouver.
 */

/** Guillemets PostgREST autour d'une valeur de filtre, `"` et `\` échappés. */
export function quotePostgrestValue(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Assemble un `ilike` « contient » sur plusieurs colonnes, prêt pour `.or(...)`.
 * Renvoie `null` s'il n'y a rien à chercher, pour que l'appelant n'ajoute
 * simplement aucun filtre.
 */
export function buildIlikeOrFilter(columns: string[], rawQuery: string): string | null {
    const trimmed = rawQuery.trim()
    if (!trimmed || columns.length === 0) return null

    const value = quotePostgrestValue(`%${trimmed}%`)
    return columns.map(column => `${column}.ilike.${value}`).join(',')
}
