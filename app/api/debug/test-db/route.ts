import { NextResponse } from "next/server"
import { query } from "@/lib/postgres/client"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    // Get current user
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Get user's tenants
    const tenantsResult = await query(`
      SELECT tenant_id FROM user_tenant_roles WHERE user_id = $1
    `, [user.id])
    const tenantIds = tenantsResult.rows.map(row => row.tenant_id)

    if (tenantIds.length === 0) {
      return NextResponse.json({
        user: { id: user.id, email: user.email },
        tenants: [],
        schemas: 0,
        jobs: 0,
        exports: 0,
        message: "User has no tenants"
      })
    }

    // Get counts
    const tenantPlaceholders = tenantIds.map((_, i) => `$${i + 1}`).join(',')
    
    const [schemasResult, jobsResult, exportsResult] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM schemas WHERE tenant_id IN (${tenantPlaceholders})`, tenantIds),
      query(`SELECT COUNT(*) as count FROM jobs WHERE tenant_id IN (${tenantPlaceholders})`, tenantIds),
      query(`SELECT COUNT(*) as count FROM exports WHERE tenant_id IN (${tenantPlaceholders})`, tenantIds),
    ])

    // Get sample data
    const sampleSchemas = await query(`
      SELECT id, name, created_by FROM schemas 
      WHERE tenant_id IN (${tenantPlaceholders})
      ORDER BY created_at DESC
      LIMIT 3
    `, tenantIds)

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      tenants: tenantIds,
      counts: {
        schemas: parseInt(schemasResult.rows[0]?.count || '0'),
        jobs: parseInt(jobsResult.rows[0]?.count || '0'),
        exports: parseInt(exportsResult.rows[0]?.count || '0'),
      },
      sampleSchemas: sampleSchemas.rows,
    })

  } catch (error) {
    console.error("[Debug Test DB] Error:", error)
    return NextResponse.json({ 
      error: "Failed to test database", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

