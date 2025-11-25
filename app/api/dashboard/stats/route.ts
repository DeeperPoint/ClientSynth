import { NextRequest, NextResponse } from "next/server"
import { query, getCurrentUser } from "@/lib/postgres/client"

export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[Dashboard Stats] Starting...')
    // Get only tenants the user belongs to
    const tenantsResult = await query(`
      SELECT DISTINCT tenant_id 
      FROM user_tenant_roles
      WHERE user_id = $1
    `, [user.id])

    console.log('[Dashboard Stats] Tenants result:', tenantsResult.rows)
    const tenantIds = tenantsResult.rows.map(row => row.tenant_id)
    console.log('[Dashboard Stats] Tenant IDs:', tenantIds)

    if (tenantIds.length === 0) {
      console.log('[Dashboard Stats] No tenants found, returning zeros')
      return NextResponse.json({
        stats: {
          schemas: 0,
          jobs: 0,
          completedJobs: 0,
          exports: 0
        },
        recentActivity: []
      })
    }

    // Build tenant filter
    const tenantPlaceholders = tenantIds.map((_, i) => `$${i + 1}`).join(',')

    // Get counts
    const [schemasResult, jobsResult, exportsResult] = await Promise.all([
      query(`
        SELECT COUNT(*) as count 
        FROM schemas 
        WHERE tenant_id IN (${tenantPlaceholders})
      `, tenantIds),
      query(`
        SELECT COUNT(*) as count, status
        FROM jobs 
        WHERE tenant_id IN (${tenantPlaceholders})
        GROUP BY status
      `, tenantIds),
      query(`
        SELECT COUNT(*) as count 
        FROM exports 
        WHERE tenant_id IN (${tenantPlaceholders})
      `, tenantIds)
    ])

    console.log('[Dashboard Stats] Schemas result:', schemasResult.rows)
    console.log('[Dashboard Stats] Jobs result:', jobsResult.rows)
    console.log('[Dashboard Stats] Exports result:', exportsResult.rows)

    const schemasCount = Number(schemasResult.rows[0]?.count || 0)
    const exportsCount = Number(exportsResult.rows[0]?.count || 0)
    
    let totalJobs = 0
    let completedJobs = 0
    
    jobsResult.rows.forEach(row => {
      const count = Number(row.count || 0)
      totalJobs += count
      if (row.status === 'completed') {
        completedJobs = count
      }
    })

    const finalStats = {
      schemas: schemasCount,
      jobs: totalJobs,
      completedJobs,
      exports: exportsCount
    }

    console.log('[Dashboard Stats] Calculated stats:', finalStats)
    console.log('[Dashboard Stats] Stats types:', {
      schemas: typeof finalStats.schemas,
      jobs: typeof finalStats.jobs,
      completedJobs: typeof finalStats.completedJobs,
      exports: typeof finalStats.exports
    })

    // Get recent jobs (last 5 jobs)
    const recentJobsResult = await query(`
      SELECT id, name, status, created_at
      FROM jobs
      WHERE tenant_id IN (${tenantPlaceholders})
      ORDER BY created_at DESC
      LIMIT 5
    `, tenantIds)

    console.log('[Dashboard Stats] Recent jobs:', recentJobsResult.rows)

    const activities = recentJobsResult.rows.map(job => ({
      id: job.id,
      type: 'job',
      title: job.name || `Generation job ${job.id.substring(0, 8)}…`,
      status: job.status,
      created_at: job.created_at
    }))

    console.log('[Dashboard Stats] Recent activities formatted:', activities)

    const response = {
      stats: finalStats,
      recentActivity: activities
    }

    console.log('[Dashboard Stats] Final response:', JSON.stringify(response, null, 2))

    return NextResponse.json(response)

  } catch (error) {
    console.error("Dashboard stats error:", error)
    console.error("Error details:", error instanceof Error ? error.message : String(error))
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json(
      { error: "Failed to load dashboard stats", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

