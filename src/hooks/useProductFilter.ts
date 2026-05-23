'use client'

import { useMemo, useState } from 'react'

interface FilterableProduct {
  id: string
  name: string
  category?: string | null
}

interface UseProductFilterResult<T extends FilterableProduct> {
  search: string
  setSearch: (v: string) => void
  activeCategory: string
  setActiveCategory: (v: string) => void
  filtered: T[]
}

export function useProductFilter<T extends FilterableProduct>(
  products: T[],
  allCategoriesLabel = 'Tous'
): UseProductFilterResult<T> {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(allCategoriesLabel)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter(p => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q)
      const matchesCategory = activeCategory === allCategoriesLabel || p.category === activeCategory
      return matchesSearch && matchesCategory
    })
  }, [products, search, activeCategory, allCategoriesLabel])

  return { search, setSearch, activeCategory, setActiveCategory, filtered }
}
