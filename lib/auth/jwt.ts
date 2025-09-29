import jwt from 'jsonwebtoken'
import { pool } from '../database/client'

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

export interface JWTPayload {
  userId: string
  email: string
  tenantId?: string
  role?: string
}

export interface User {
  id: string
  email: string
  name?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Tenant {
  id: string
  name: string
  created_at: string
}

export interface UserTenantRole {
  user_id: string
  tenant_id: string
  role: 'owner' | 'admin' | 'member'
}

// Generate JWT token
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

// Verify JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch (error) {
    return null
  }
}

// Get user by ID
export async function getUserById(userId: string): Promise<User | null> {
  try {
    const result = await pool.query(
      'SELECT id, email, name, avatar_url, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    )
    return result.rows[0] || null
  } catch (error) {
    console.error('Error getting user by ID:', error)
    return null
  }
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const result = await pool.query(
      'SELECT id, email, name, avatar_url, created_at, updated_at FROM users WHERE email = $1',
      [email]
    )
    return result.rows[0] || null
  } catch (error) {
    console.error('Error getting user by email:', error)
    return null
  }
}

// Create user
export async function createUser(email: string, name?: string, avatar_url?: string): Promise<User | null> {
  try {
    const result = await pool.query(
      'INSERT INTO users (email, name, avatar_url) VALUES ($1, $2, $3) RETURNING id, email, name, avatar_url, created_at, updated_at',
      [email, name, avatar_url]
    )
    return result.rows[0]
  } catch (error) {
    console.error('Error creating user:', error)
    return null
  }
}

// Get user tenants
export async function getUserTenants(userId: string): Promise<Tenant[]> {
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.created_at 
       FROM tenants t 
       JOIN user_tenant_roles utr ON t.id = utr.tenant_id 
       WHERE utr.user_id = $1`,
      [userId]
    )
    return result.rows
  } catch (error) {
    console.error('Error getting user tenants:', error)
    return []
  }
}

// Get user role in tenant
export async function getUserRoleInTenant(userId: string, tenantId: string): Promise<string | null> {
  try {
    const result = await pool.query(
      'SELECT role FROM user_tenant_roles WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId]
    )
    return result.rows[0]?.role || null
  } catch (error) {
    console.error('Error getting user role:', error)
    return null
  }
}

// Create tenant
export async function createTenant(name: string, ownerId: string): Promise<Tenant | null> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    
    // Create tenant
    const tenantResult = await client.query(
      'INSERT INTO tenants (name) VALUES ($1) RETURNING id, name, created_at',
      [name]
    )
    const tenant = tenantResult.rows[0]
    
    // Add owner role
    await client.query(
      'INSERT INTO user_tenant_roles (user_id, tenant_id, role) VALUES ($1, $2, $3)',
      [ownerId, tenant.id, 'owner']
    )
    
    await client.query('COMMIT')
    return tenant
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error creating tenant:', error)
    return null
  } finally {
    client.release()
  }
}

// Add user to tenant
export async function addUserToTenant(userId: string, tenantId: string, role: string = 'member'): Promise<boolean> {
  try {
    await pool.query(
      'INSERT INTO user_tenant_roles (user_id, tenant_id, role) VALUES ($1, $2, $3) ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = $3',
      [userId, tenantId, role]
    )
    return true
  } catch (error) {
    console.error('Error adding user to tenant:', error)
    return false
  }
}

// Authenticate user (for login)
export async function authenticateUser(email: string, password?: string): Promise<{ user: User; token: string } | null> {
  try {
    // For now, we'll just create/find the user without password verification
    // In a real app, you'd verify the password hash
    let user = await getUserByEmail(email)
    
    if (!user) {
      user = await createUser(email)
      if (!user) return null
    }
    
    const token = generateToken({
      userId: user.id,
      email: user.email,
    })
    
    return { user, token }
  } catch (error) {
    console.error('Error authenticating user:', error)
    return null
  }
}
