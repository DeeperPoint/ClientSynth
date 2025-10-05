// Supabase is not used in local dev; this no-op stub prevents runtime crashes while we migrate to the FastAPI backend.
type AuthResult<T> = { data: T; error: null }
type QueryResult<T = any> = { data: T | null; error: null; count?: number }

function makeThenableResult<T>(result: QueryResult<T[]>) {
  const thenable: any = {
    // Chainable no-op filters/sorters
    eq: () => thenable,
    gte: () => thenable,
    lte: () => thenable,
    gt: () => thenable,
    lt: () => thenable,
    in: () => thenable,
    order: () => thenable,
    limit: () => thenable,
    select: () => thenable,
    // Terminal helpers
    single: () => Promise.resolve({ data: null, error: null } as QueryResult<any>),
    insert: () => Promise.resolve({ data: null, error: null } as QueryResult<any>),
    update: () => Promise.resolve({ data: null, error: null } as QueryResult<any>),
    delete: () => Promise.resolve({ data: null, error: null } as QueryResult<any>),
    // Promise interface
    then: (resolve: any) => resolve(result),
    catch: () => thenable,
    finally: (cb: any) => {
      cb?.()
      return thenable
    },
  }
  return thenable
}

export function createClient() {
  return {
    auth: {
      // Return null user by default; frontends should use backend auth instead
      getUser: async (): Promise<AuthResult<{ user: any | null }>> => ({ data: { user: null }, error: null }),
    },
    from: (_table: string) => makeThenableResult<any>({ data: [], error: null, count: 0 }),
  }
}
