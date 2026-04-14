'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { get, set, del } from 'idb-keyval'
import { ReactNode, useState, useEffect } from 'react'

export default function ReactQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes fresh
            gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days in offline cache
            refetchOnReconnect: true,
            refetchOnWindowFocus: true,
            retry: 2,
          },
        },
      })
  )

  const [persister, setPersister] = useState<ReturnType<typeof createAsyncStoragePersister> | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const idbStorage = {
        getItem: async (key: string) => await get(key),
        setItem: async (key: string, value: string) => await set(key, value),
        removeItem: async (key: string) => await del(key),
      }
      const asyncPersister = createAsyncStoragePersister({ storage: idbStorage })
      setPersister(asyncPersister)
    }
  }, [])

  if (!persister) {
    // Render standard provider during SSR/early client load to avoid restoreClient undefined error
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      {children}
    </PersistQueryClientProvider>
  )
}


