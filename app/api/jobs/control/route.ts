import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser, query } from "@/lib/postgres/client"

export async function POST(request: NextRequest) {
  try {
    const { jobId, action, metadata = {} } = await request.json()

    if (!jobId || !action) {
      return NextResponse.json({ error: "Missing jobId or action" }, { status: 400 })
    }

    if (!["pause", "resume", "cancel", "retry"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify user has access to this job
    const jobResult = await query(`
      SELECT tenant_id, status, can_be_cancelled, can_be_paused, can_be_retried
      FROM jobs
      WHERE id = $1
    `, [jobId])

    if (jobResult.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const job = jobResult.rows[0]

    const tenantAccessResult = await query(`
      SELECT tenant_id
      FROM user_tenant_roles
      WHERE user_id = $1 AND tenant_id = $2
    `, [user.id, job.tenant_id])

    if (tenantAccessResult.rows.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Validate action is allowed for current job state
    const validations = {
      pause: ["running", "processing"].includes(job.status) && job.can_be_paused,
      resume: job.status === "paused",
      cancel: ["running", "processing", "paused", "pending"].includes(job.status) && job.can_be_cancelled,
      retry: ["failed", "paused"].includes(job.status) && job.can_be_retried,
    }

    if (!validations[action as keyof typeof validations]) {
      return NextResponse.json(
        {
          error: `Cannot ${action} job in ${job.status} status`,
        },
        { status: 400 },
      )
    }

    // Send control signal using database function
    const controlResult = await query(`
      SELECT send_job_control_signal($1, $2, $3, $4) as control_id
    `, [jobId, action, user.id, JSON.stringify(metadata)])

    const controlId = controlResult.rows[0].control_id

    return NextResponse.json({
      success: true,
      controlId,
      message: `Job ${action} signal sent successfully`,
    })
  } catch (error) {
    console.error("Job control error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
