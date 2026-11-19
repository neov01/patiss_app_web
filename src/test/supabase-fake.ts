export type FakeCall = { table: string; ops: Array<[string, unknown[]]> }
export type FakeResult = { data: unknown; error: { message: string } | null; count?: number | null }
export type FakeHandler = (call: FakeCall) => FakeResult

const EMPTY: FakeResult = { data: [], error: null }

/**
 * Faux client Supabase : chaque `from(table)` enregistre les méthodes chaînées
 * (select, eq, gte, range…) puis, au moment du `await`, renvoie la réponse
 * produite par le handler de la table (par défaut : aucune ligne).
 */
export function createSupabaseFake(
  handlers: Record<string, FakeHandler> = {},
  options: { userEmail?: string | null } = {}
) {
  const calls: FakeCall[] = []

  const from = (table: string) => {
    const call: FakeCall = { table, ops: [] }
    calls.push(call)
    const builder: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (onFulfilled: (value: FakeResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
              Promise.resolve()
                .then(() => (handlers[table] ?? (() => EMPTY))(call))
                .then(onFulfilled, onRejected)
          }
          if (typeof prop !== 'string') return undefined
          return (...args: unknown[]) => {
            call.ops.push([prop, args])
            return builder
          }
        },
      }
    )
    return builder
  }

  const userEmail = options.userEmail === undefined ? 'gerant@test.local' : options.userEmail
  const client = {
    from,
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: userEmail ? { email: userEmail } : null }, error: null }),
      },
    },
  }
  return { client, calls }
}

export function hasOp(call: FakeCall, op: string, args: unknown[]): boolean {
  return call.ops.some(([name, values]) => name === op && args.every((value, i) => Object.is(values[i], value)))
}

export function callsTo(calls: FakeCall[], table: string): FakeCall[] {
  return calls.filter(call => call.table === table)
}

export function opArg(call: FakeCall, op: string, column: string): unknown {
  return call.ops.find(([name, values]) => name === op && values[0] === column)?.[1][1]
}

export function isSingle(call: FakeCall): boolean {
  return call.ops.some(([name]) => name === 'single' || name === 'maybeSingle')
}
