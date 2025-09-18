import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { jobId, action, metadata = {} } = await request.json()

    if (!jobId || !action) {
      return NextResponse.json({ error: "Missing jobId or action" }, { status: 400 })
    }

    if (!["pause", "resume", "cancel", "retry"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify user has access to this job
    const { data: job } = await supabase
      .from("jobs")
      .select("tenant_id, status, can_be_cancelled, can_be_paused, can_be_retried")
      .eq("id", jobId)
      .single()

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const { data: tenantAccess } = await supabase
      .from("user_tenant_roles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("tenant_id", job.tenant_id)
      .single()

    if (!tenantAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Validate action is allowed for current job state
    const validations = {
      pause: job.status === "processing" && job.can_be_paused,
      resume: job.status === "paused",
      cancel: ["processing", "paused", "pending"].includes(job.status) && job.can_be_cancelled,
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
    const { data: controlId, error } = await supabase.rpc("send_job_control_signal", {
      p_job_id: jobId,
      p_action: action,
      p_metadata: metadata,
    })

    if (error) {
      console.error("Failed to send job control signal:", error)
      return NextResponse.json({ error: "Failed to send control signal" }, { status: 500 })
    }

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
