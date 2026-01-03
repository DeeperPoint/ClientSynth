import { NextRequest, NextResponse } from "next/server"
import { SchemaDiscovery } from "@/lib/schema-discovery"
import { getCurrentUser } from "@/lib/postgres/client"

/**
 * POST /api/schemas/discover
 * 
 * Discover schema from uploaded file
 * 
 * Request: multipart/form-data
 * - file: File (required)
 * - useLLM: boolean (optional, default: true)
 * - sampleSize: number (optional, default: 1000)
 * - minConfidence: number (optional, default: 0.5)
 * 
 * Response: DiscoveryResult
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Parse options
    const useLLM = formData.get("useLLM") !== "false" // Default to true
    const sampleSize = formData.get("sampleSize") 
      ? parseInt(formData.get("sampleSize") as string) 
      : undefined
    const minConfidence = formData.get("minConfidence")
      ? parseFloat(formData.get("minConfidence") as string)
      : undefined

    // Discover schema
    const discovery = new SchemaDiscovery()
    const result = await discovery.discoverSchema(file, {
      useLLM: useLLM === true || useLLM === "true",
      sampleSize,
      minConfidence
    })

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.errors?.join(", ") || "Schema discovery failed",
        warnings: result.warnings,
        metadata: result.metadata
      }, { status: 400 })
    }

    // Return discovered schema
    return NextResponse.json({
      success: true,
      schema: result.schema,
      warnings: result.warnings,
      metadata: result.metadata
    })

  } catch (error) {
    console.error("[SchemaDiscovery] API error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to discover schema"
      },
      { status: 500 }
    )
  }
}

