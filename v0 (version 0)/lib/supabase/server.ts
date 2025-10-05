// Stub server client: we don't use Supabase SSR in local dev.
type QueryResult<T = any> = { data: T | null; error: null; count?: number }

function makeThenableResult<T>(result: QueryResult<T[]>) {
  const thenable: any = {
    eq: () => thenable,
    gte: () => thenable,
    lte: () => thenable,
    gt: () => thenable,
    lt: () => thenable,
    in: () => thenable,
    order: () => thenable,
    limit: () => thenable,
    select: () => thenable,
    single: () => Promise.resolve({ data: null, error: null } as QueryResult<any>),
    insert: () => Promise.resolve({ data: null, error: null } as QueryResult<any>),
    update: () => Promise.resolve({ data: null, error: null } as QueryResult<any>),
    delete: () => Promise.resolve({ data: null, error: null } as QueryResult<any>),
    then: (resolve: any) => resolve(result),
    catch: () => thenable,
    finally: (cb: any) => {
      cb?.()
      return thenable
    },
  }
  return thenable
}

export async function createClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: (_table: string) => makeThenableResult<any>({ data: [], error: null, count: 0 }),
  }
}
