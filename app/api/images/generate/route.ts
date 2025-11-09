import { type NextRequest, NextResponse } from "next/server"
import { ImageGenerationService } from "@/lib/image-generation/image-service"
import { getCurrentUser, query } from "@/lib/postgres/client"

export async function POST(request: NextRequest) {
  try {
    const {
      tenantId,
      jobId,
      recordId,
      fieldName,
      prompt,
      model,
      recordData,
      fieldDescription,
      style = "professional",
    } = await request.json()

    if (!tenantId || !jobId || !recordId || !fieldName || !prompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Verify user has access to this tenant
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const tenantAccess = await query(
      `SELECT 1 FROM user_tenant_roles WHERE user_id = $1 AND tenant_id = $2`,
      [user.id, tenantId]
    )

    if (tenantAccess.rows.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    console.log(`[ImageAPI] Generating image for field: ${fieldName} using OpenRouter`)

    const imageService = new ImageGenerationService()
    const result = await imageService.generateAndUploadImage({
      tenantId,
      jobId,
      recordId,
      fieldName,
      prompt,
      recordData,
      fieldDescription,
      style,
      model,
    })

    console.log(`[ImageAPI] Image generated successfully: ${result.url}`)

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (error) {
    console.error("[ImageAPI] Image generation error:", error)
    return NextResponse.json(
      {
        error: "Image generation failed",
        details: error instanceof Error ? error.message : "Unknown error",
        message: "Please check your OpenRouter API key and try again",
      },
      { status: 500 },
    )
  }
}
