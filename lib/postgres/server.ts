import { getCurrentUser, hasTenantAccess, query, withTransaction } from './client'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

// Server-side auth utilities
export async function createServerClient() {
  return {
    auth: {
      getUser: async () => {
        const user = await getCurrentUser()
        return {
          data: { user },
          error: user ? null : { message: 'Not authenticated' }
        }
      }
    },
    from: (table: string) => ({
      select: (columns?: string) => ({
        eq: (column: string, value: any) => ({
          single: async () => {
            const whereClause = columns ? `SELECT ${columns}` : 'SELECT *'
            const result = await query(`${whereClause} FROM ${table} WHERE ${column} = $1`, [value])
            return {
              data: result.rows[0] || null,
              error: result.rows.length === 0 ? { message: 'No rows found' } : null
            }
          },
          then: async (callback: (result: any) => any) => {
            const result = await query(`${columns ? `SELECT ${columns}` : 'SELECT *'} FROM ${table} WHERE ${column} = $1`, [value])
            return callback({
              data: result.rows,
              error: null
            })
          }
        }),
        in: (column: string, values: any[]) => ({
          order: (orderColumn: string, options: { ascending: boolean }) => ({
            limit: (count: number) => ({
              then: async (callback: (result: any) => any) => {
                const inClause = values.map((_, i) => `$${i + 2}`).join(',')
                const orderDirection = options.ascending ? 'ASC' : 'DESC'
                const result = await query(
                  `${columns ? `SELECT ${columns}` : 'SELECT *'} FROM ${table} WHERE ${column} IN (${inClause}) ORDER BY ${orderColumn} ${orderDirection} LIMIT $1`,
                  [count, ...values]
                )
                return callback({
                  data: result.rows,
                  error: null
                })
              }
            })
          })
        })
      }),
      insert: (data: any) => ({
        select: (columns?: string) => ({
          single: async () => {
            const keys = Object.keys(data)
            const values = Object.values(data)
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
            const selectColumns = columns || '*'
            
            const result = await query(
              `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING ${selectColumns}`,
              values
            )
            
            return {
              data: result.rows[0],
              error: null
            }
          }
        })
      }),
      update: (data: any) => ({
        eq: (column: string, value: any) => ({
          then: async (callback: (result: any) => any) => {
            const keys = Object.keys(data)
            const values = Object.values(data)
            const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ')
            
            const result = await query(
              `UPDATE ${table} SET ${setClause} WHERE ${column} = $${keys.length + 1}`,
              [...values, value]
            )
            
            return callback({
              data: result.rows,
              error: null
            })
          }
        })
      }),
      delete: () => ({
        eq: (column: string, value: any) => ({
          then: async (callback: (result: any) => any) => {
            const result = await query(`DELETE FROM ${table} WHERE ${column} = $1`, [value])
            return callback({
              data: result.rows,
              error: null
            })
          }
        })
      })
    }),
    channel: (channelName: string) => ({
      on: (event: string, options: any, callback: (payload: any) => void) => ({
        subscribe: () => {
          // For now, we'll implement a simple polling mechanism
          // In a real implementation, you might use WebSockets or Server-Sent Events
          console.log(`Subscribed to channel: ${channelName}`)
          return {
            unsubscribe: () => console.log(`Unsubscribed from channel: ${channelName}`)
          }
        }
      })
    })
  }
}

// Auth middleware for server components
export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

// Tenant access middleware
export async function requireTenantAccess(tenantId: string) {
  const user = await requireAuth()
  const hasAccess = await hasTenantAccess(user.id, tenantId)
  if (!hasAccess) {
    throw new Error('Access denied to tenant')
  }
  return user
}

// Create JWT token for user
export function createAuthToken(userId: string): string {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  )
}

// Verify JWT token
export function verifyAuthToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as { userId: string }
  } catch {
    return null
  }
}
