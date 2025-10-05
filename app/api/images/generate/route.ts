import { type NextRequest, NextResponse } from "next/server"
import { ImageGenerationService } from "@/lib/image-generation/image-service"
import { createClient } from "@/lib/supabase/server"

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
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: tenantAccess } = await supabase
      .from("user_tenant_roles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single()

    if (!tenantAccess) {
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
