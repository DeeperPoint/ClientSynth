import { type NextRequest, NextResponse } from "next/server"
import { JobProcessor } from "@/lib/job-processor"

export async function POST(request: NextRequest) {
  try {
    const processor = new JobProcessor()
    const processed = await processor.processNextJob()

    return NextResponse.json({
      success: true,
      processed,
      message: processed ? "Job processed successfully" : "No jobs to process",
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
