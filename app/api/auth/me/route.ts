import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/postgres/client'

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser()
    return NextResponse.json({ data: { user }, error: null })
  } catch (err) {
    console.error('API /api/auth/me error:', err)
    return NextResponse.json({ data: { user: null }, error: 'Internal server error' }, { status: 500 })
  }
}
