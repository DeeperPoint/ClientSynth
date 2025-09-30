import { NextRequest, NextResponse } from 'next/server'
import { createUser, generateToken, getUserByEmail } from '@/lib/auth/jwt'

export async function POST(request: NextRequest) {
  try {
    const { email, name, password } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email)
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 })
    }

    // Create new user
    const user = await createUser(email, name)
    
    if (!user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    })

    return NextResponse.json({
      user,
      token,
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
