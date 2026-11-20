export type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Lit toutes les lignes d'une requête PostgREST page par page.
 * PostgREST plafonne chaque réponse (1 000 lignes par défaut) : sans pagination,
 * un total mensuel serait tronqué sans erreur.
 * La requête doit avoir un ordre stable (ex. .order('created_at').order('id')).
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
  maxPages = 100
): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize
    const { data, error } = await makeQuery(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < pageSize) return rows
  }
  throw new Error('fetchAllRows : limite de pages atteinte')
}
