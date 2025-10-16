// Supabase was migrated away from — provide a tiny shim to avoid importing
// '@supabase/ssr' (which isn't installed) and to produce clear runtime
// errors when client code still tries to use the old API. This keeps the
// minimal edits requirement and unblocks the Next.js build.

export function createClient() {
  // Returns a proxy that throws when any method is actually invoked. This
  // prevents compile-time import errors while making it immediately obvious
  // at runtime which code still needs to be migrated to the Postgres APIs.
  const handler: ProxyHandler<any> = {
    get(_, prop) {
      // If someone accesses nested properties (e.g. auth.getUser), return a
      // function that throws when called.
      return new Proxy(() => {
        throw new Error(
          `[supabase-shim] Supabase APIs were removed. Attempted to call '${String(prop)}'. ` +
            "Replace this usage with your Postgres helpers (see lib/postgres) or ask me to refactor the call."
        )
      }, handler)
    },
    apply() {
      throw new Error(
        "[supabase-shim] Supabase APIs were removed. This shim prevents runtime errors from missing '@supabase/ssr'. " +
          "Migrate calls to use lib/postgres client.query() or createServerClient()."
      )
    },
  }

  return new Proxy(() => {}, handler)
}
