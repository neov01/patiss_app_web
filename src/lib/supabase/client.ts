import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Désactive le verrouillage du navigateur pour éviter les blocages en mode hors-ligne/instable
        lock: async (name, acquireTimeout, fn) => fn(),
      }
    }
  )
}
