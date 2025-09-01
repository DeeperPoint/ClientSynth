import { type NextRequest, NextResponse } from "next/server"
import { JobProcessor } from "@/lib/job-processor"

export async function POST(request: NextRequest) {
  try {
    // Check for API key or authentication
    const authHeader = request.headers.get("authorization")
    if (!authHeader || authHeader !== `Bearer ${process.env.JOB_PROCESSOR_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const processor = new JobProcessor()
    const processed = await processor.processNextJob()

    return NextResponse.json({
      success: true,
      processed,
      message: processed ? "AI-powered job processed successfully" : "No jobs to process",
    })
  } catch (error) {
    console.error("Error in AI job processing endpoint:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
