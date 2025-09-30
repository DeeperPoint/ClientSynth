import { type NextRequest, NextResponse } from "next/server"
import { JobProcessor } from "@/lib/job-processor-local"
import { requireApiKey } from "@/lib/auth/middleware"

export async function POST(request: NextRequest) {
  try {
    // Check for API key authentication
    const authHeader = request.headers.get("authorization")
    const expectedKey = process.env.JOB_PROCESSOR_SECRET
    
    if (!authHeader || !expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const processor = new JobProcessor()
    await processor.processNextJob()

    return NextResponse.json({
      success: true,
      message: "Job processing completed",
    })
  } catch (error) {
    console.error("Error in job processing endpoint:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
