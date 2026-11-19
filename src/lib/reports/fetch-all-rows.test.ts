import { describe, expect, it } from 'vitest'
import { fetchAllRows } from './fetch-all-rows'

describe('fetchAllRows', () => {
  it("enchaîne les pages jusqu'à une page incomplète", async () => {
    const ranges: Array<[number, number]> = []
    const rows = await fetchAllRows<number>(async (from, to) => {
      ranges.push([from, to])
      const size = from === 0 ? 2 : 1
      return { data: Array.from({ length: size }, (_, i) => from + i), error: null }
    }, 2)
    expect(rows).toEqual([0, 1, 2])
    expect(ranges).toEqual([[0, 1], [2, 3]])
  })

  it("s'arrête sur une page vide après une page pleine", async () => {
    const rows = await fetchAllRows<number>(async from => ({ data: from === 0 ? [1, 2] : [], error: null }), 2)
    expect(rows).toEqual([1, 2])
  })

  it('traite une réponse sans données comme une page vide', async () => {
    const rows = await fetchAllRows<number>(async () => ({ data: null, error: null }))
    expect(rows).toEqual([])
  })

  it('propage une erreur Supabase', async () => {
    await expect(fetchAllRows(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom')
  })

  it('lève une erreur si la limite de pages est atteinte', async () => {
    await expect(fetchAllRows<number>(async () => ({ data: [1, 2], error: null }), 2, 3)).rejects.toThrow('limite de pages')
  })
})
