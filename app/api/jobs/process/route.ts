import { type NextRequest, NextResponse } from "next/server"
import { JobProcessor } from "@/lib/job-processor"

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Manual job processing endpoint called")

    console.log("[v0] Initializing JobProcessor...")
    const processor = new JobProcessor()
    console.log("[v0] JobProcessor initialized successfully")

    console.log("[v0] Processing next job...")
    const processed = await processor.processNextJob()
    console.log("[v0] Job processing result:", { processed })

    return NextResponse.json({
      success: true,
      processed,
      message: processed ? "Job processed successfully" : "No jobs to process",
    })
  } catch (error) {
    console.error("[v0] Error in job processing endpoint:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
