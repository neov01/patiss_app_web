import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

function isNetworkError(err: unknown): err is TypeError {
  if (!(err instanceof TypeError)) return false
  const msg = err.message?.toLowerCase() ?? ''
  return (
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('network request failed')
  )
}

async function offlineAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (err) {
    if (isNetworkError(err)) {
      const url =
        typeof input === 'string' ? input
        : input instanceof URL ? input.href
        : (input as Request).url
      if (url.includes('/auth/v1/')) {
        throw new TypeError('Failed to fetch (offline)')
      }
    }
    throw err
  }
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Désactive le verrouillage du navigateur pour éviter les blocages en mode hors-ligne/instable
        lock: async (name, acquireTimeout, fn) => fn(),
      },
      global: {
        fetch: offlineAwareFetch,
      },
    }
  )
}
