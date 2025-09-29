import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, getUserById, getUserRoleInTenant } from './jwt'

export interface AuthenticatedUser {
  id: string
  email: string
  name?: string
  avatar_url?: string
  role?: string
  tenantId?: string
}

export async function authenticateRequest(request: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }

    const token = authHeader.substring(7)
    const payload = verifyToken(token)
    
    if (!payload) {
      return null
    }

    // Get user details
    const user = await getUserById(payload.userId)
    if (!user) {
      return null
    }

    // Get user role if tenantId is provided
    let role: string | undefined
    if (payload.tenantId) {
      role = await getUserRoleInTenant(payload.userId, payload.tenantId)
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      role,
      tenantId: payload.tenantId,
    }
  } catch (error) {
    console.error('Authentication error:', error)
    return null
  }
}

export function requireAuth(handler: (request: NextRequest, user: AuthenticatedUser) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const user = await authenticateRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return handler(request, user)
  }
}

export function requireRole(requiredRole: string) {
  return function(handler: (request: NextRequest, user: AuthenticatedUser) => Promise<NextResponse>) {
    return async (request: NextRequest): Promise<NextResponse> => {
      const user = await authenticateRequest(request)
      
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      if (!user.role || !hasPermission(user.role, requiredRole)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      return handler(request, user)
    }
  }
}

function hasPermission(userRole: string, requiredRole: string): boolean {
  const roleHierarchy = {
    'owner': 3,
    'admin': 2,
    'member': 1,
  }

  const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0
  const requiredLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0

  return userLevel >= requiredLevel
}

// API Key authentication for job processing
export function requireApiKey(handler: (request: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authHeader = request.headers.get('authorization')
    const expectedKey = process.env.JOB_PROCESSOR_SECRET
    
    if (!authHeader || !expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return handler(request)
  }
}
