import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, query } from "@/lib/postgres/client"

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Use the authenticated user's identity; accept empty body for idempotency
    const user_id = user.id
    const user_email = user.email || "user@example.com"

    // Create default tenant using database function
    let createdUserId: string | null = null
    try {
      const result = await query(`
        SELECT create_user($1, $2, $3) as user_id
      `, [user_email, 'dummy_password', 'Default User'])
      createdUserId = result.rows[0]?.user_id ?? null
    } catch (e: any) {
      // If user already exists, continue; make this endpoint idempotent
      if (e?.code !== '23505') throw e
    }

    // This is a simplified version - in practice you'd use the create_default_tenant_for_user function
    const tenantName = user_email.includes('@gmail.com') || user_email.includes('@yahoo.com') || user_email.includes('@hotmail.com') 
      ? 'My Organization'
      : user_email.split('@')[1].split('.')[0]

    const slug = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    let tenant
    try {
      tenant = await query(`
        INSERT INTO tenants (name, slug)
        VALUES ($1, $2)
        RETURNING *
      `, [tenantName, slug])
    } catch (e: any) {
      if (e?.code === '23505') {
        // Slug exists, select it
        tenant = await query(`SELECT * FROM tenants WHERE slug = $1 LIMIT 1`, [slug])
      } else {
        throw e
      }
    }

    // Add user as owner
    await query(`
      INSERT INTO user_tenant_roles (user_id, tenant_id, role)
      VALUES ($1, $2, 'owner')
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role
    `, [user_id, tenant.rows[0].id])

    return NextResponse.json(tenant.rows[0])
  } catch (error) {
    console.error("Error creating default tenant:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
