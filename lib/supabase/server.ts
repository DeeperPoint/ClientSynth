// Minimal server-side shim to replace `createServerClient` from Supabase.
// This provides a tiny subset of the Supabase-like API used in the repo
// (i.e. `.from(table).select/insert/update/delete/...`) and delegates to
// the project's Postgres `query()` helper. The goal is to make the smallest
// changes necessary so the codebase builds. This is not a full supabase
// replacement — it's a pragmatic shim.

import { query, getCurrentUser } from "@/lib/postgres/client"

// Synchronous server shim replacing `createServerClient` from Supabase.
// Many modules in this repo call `createServerClient(...)` synchronously, so
// we export the same named function and provide a minimal `.from()` API that
// delegates to the Postgres `query()` helper.
export function createServerClient(_url?: string, _key?: string, _options?: any) {
  function from(table: string) {
    return {
      select: (columns?: string, options?: any) => ({
        eq: (column: string, value: any) => ({
          single: async () => {
            const where = `WHERE ${column} = $1`
            const q = columns ? `SELECT ${columns} FROM ${table} ${where}` : `SELECT * FROM ${table} ${where}`
            const result = await query(q, [value])
            return { data: result.rows[0] || null, error: result.rows.length === 0 ? { message: 'No rows' } : null }
          }
        }),
        order: (orderColumn: string, opts: { ascending: boolean }) => ({
          limit: (count: number) => ({
            then: async (cb: any) => {
              const dir = opts.ascending ? 'ASC' : 'DESC'
              const q = `SELECT ${columns || '*'} FROM ${table} ORDER BY ${orderColumn} ${dir} LIMIT $1`
              const result = await query(q, [count])
              return cb({ data: result.rows, error: null })
            }
          })
        })
      }),
      insert: (data: any) => ({
        select: (cols?: string) => ({
          single: async () => {
            // Auto-fill slug for tenants if missing
            const record = { ...data }
            if (table === 'tenants' && !record.slug && record.name) {
              record.slug = String(record.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$|--+/g, '-')
            }
            const keys = Object.keys(record)
            const vals = Object.values(record)
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
            const q = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders}) RETURNING ${cols || '*'} `
            const result = await query(q, vals)
            return { data: result.rows[0], error: null }
          }
        })
      }),
      update: (data: any) => ({
        eq: (column: string, value: any) => ({
          then: async (cb: any) => {
            const keys = Object.keys(data)
            const vals = Object.values(data)
            const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
            const q = `UPDATE ${table} SET ${setClause} WHERE ${column} = $${keys.length + 1} RETURNING *`
            const result = await query(q, [...vals, value])
            return cb({ data: result.rows, error: null })
          }
        })
      }),
      delete: () => ({
        eq: (column: string, value: any) => ({
          then: async (cb: any) => {
            const q = `DELETE FROM ${table} WHERE ${column} = $1 RETURNING *`
            const result = await query(q, [value])
            return cb({ data: result.rows, error: null })
          }
        }),
        match: (criteria: Record<string, any>) => ({
          then: async (cb: any) => {
            const entries = Object.entries(criteria)
            const where = entries.map(([k], i) => `${k} = $${i + 1}`).join(' AND ')
            const values = entries.map(([, v]) => v)
            const q = `DELETE FROM ${table} WHERE ${where} RETURNING *`
            const result = await query(q, values)
            return cb({ data: result.rows, error: null })
          }
        }),
        in: (column: string, values: any[]) => ({
          then: async (cb: any) => {
            const inClause = values.map((_, i) => `$${i + 1}`).join(',')
            const q = `DELETE FROM ${table} WHERE ${column} IN (${inClause}) RETURNING *`
            const result = await query(q, values)
            return cb({ data: result.rows, error: null })
          }
        })
      })
    }
  }

  const auth = {
    getUser: async () => {
      const user = await getCurrentUser()
      if (!user) {
        return { data: { user: null }, error: { message: 'Not authenticated' } }
      }
      return { data: { user }, error: null }
    }
  }

  return { from, auth }
}

// Many server modules import { createClient } from this path. Provide a compatible alias.
export function createClient(url?: string, key?: string, options?: any) {
  return createServerClient(url, key, options)
}
