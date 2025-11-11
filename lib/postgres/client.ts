import { Pool, PoolClient, QueryResult } from 'pg'
import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'

// PostgreSQL connection pool
let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required')
    }
    
    const sslMode = process.env.DATABASE_SSL?.toLowerCase()
    const useSSL =
      sslMode === 'true' ||
      sslMode === 'require' ||
      (!!sslMode && sslMode === '1')

    pool = new Pool({
      connectionString,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  }
  return pool
}

// Get a client from the pool
export async function getClient(): Promise<PoolClient> {
  const pool = getPool()
  return await pool.connect()
}

// Execute a query with automatic client management
export async function query<T = any>(
  text: string, 
  params?: any[]
): Promise<QueryResult<T>> {
  const client = await getClient()
  try {
    return await client.query<T>(text, params)
  } finally {
    client.release()
  }
}

// Transaction helper
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Auth utilities
export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Tenant {
  id: string
  name: string
  slug: string
  created_at: string
  updated_at: string
}

export interface UserTenantRole {
  id: string
  user_id: string
  tenant_id: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
}

// Get current user from JWT token
export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth-token')?.value
    
    if (!token) {
      return null
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    if (!decoded.userId) {
      return null
    }

    const result = await query<User>(
      'SELECT id, email, full_name, avatar_url, created_at, updated_at FROM profiles WHERE id = $1',
      [decoded.userId]
    )

    return result.rows[0] || null
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

// Get user's tenants
export async function getUserTenants(userId: string): Promise<Tenant[]> {
  const result = await query<Tenant>(`
    SELECT t.id, t.name, t.slug, t.created_at, t.updated_at
    FROM tenants t
    INNER JOIN user_tenant_roles utr ON t.id = utr.tenant_id
    WHERE utr.user_id = $1
    ORDER BY t.created_at ASC
  `, [userId])

  return result.rows
}

// Get user's role in a tenant
export async function getUserTenantRole(userId: string, tenantId: string): Promise<UserTenantRole | null> {
  const result = await query<UserTenantRole>(
    'SELECT * FROM user_tenant_roles WHERE user_id = $1 AND tenant_id = $2',
    [userId, tenantId]
  )

  return result.rows[0] || null
}

// Check if user has access to a tenant
export async function hasTenantAccess(userId: string, tenantId: string): Promise<boolean> {
  const role = await getUserTenantRole(userId, tenantId)
  return !!role
}

// Create a new user profile
export async function createUserProfile(userData: {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
}): Promise<User> {
  const result = await query<User>(`
    INSERT INTO profiles (id, email, full_name, avatar_url)
    VALUES ($1, $2, $3, $4)
    RETURNING id, email, full_name, avatar_url, created_at, updated_at
  `, [userData.id, userData.email, userData.full_name, userData.avatar_url])

  return result.rows[0]
}

// Create a new tenant
export async function createTenant(tenantData: {
  name: string
  slug: string
}): Promise<Tenant> {
  const result = await query<Tenant>(`
    INSERT INTO tenants (name, slug)
    VALUES ($1, $2)
    RETURNING id, name, slug, created_at, updated_at
  `, [tenantData.name, tenantData.slug])

  return result.rows[0]
}

// Add user to tenant
export async function addUserToTenant(userId: string, tenantId: string, role: 'owner' | 'admin' | 'member'): Promise<UserTenantRole> {
  const result = await query<UserTenantRole>(`
    INSERT INTO user_tenant_roles (user_id, tenant_id, role)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [userId, tenantId, role])

  return result.rows[0]
}

// Close the pool (for cleanup)
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
