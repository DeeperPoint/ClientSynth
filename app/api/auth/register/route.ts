import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/postgres/client"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

export async function POST(request: NextRequest) {
  try {
    // Read raw text first so we can log and provide clearer errors when the
    // incoming body isn't valid JSON (helps diagnose redirects returning
    // HTML or clients sending malformed bodies).
    const raw = await request.text()
    // Log the raw body for debugging in dev
    console.log('[auth/register] raw body:', raw)

    let body: any
    try {
      body = raw ? JSON.parse(raw) : {}
    } catch (err) {
      console.error('[auth/register] JSON parse error:', err)
      return NextResponse.json({ error: 'Invalid JSON body', raw }, { status: 400 })
    }

    const { email, password, full_name } = body

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    // Check if user already exists
    const existingUser = await query(`
      SELECT id FROM auth.users WHERE email = $1
    `, [email])

    if (existingUser.rows.length > 0) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user using the database function
    const result = await query(`
      SELECT create_user($1, $2, $3) as user_id
    `, [email, passwordHash, full_name])

    const userId = result.rows[0].user_id

    // Create JWT token
    const token = jwt.sign(
      { userId },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    // Set cookie
    const response = NextResponse.json({ 
      success: true, 
      user: {
        id: userId,
        email,
        full_name
      }
    })

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    })

    return response
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
