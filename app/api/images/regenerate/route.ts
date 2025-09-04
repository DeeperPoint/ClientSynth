import { type NextRequest, NextResponse } from "next/server"
import { ImageGenerator } from "@/lib/image-generator"
import { createServerClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"

export async function POST(request: NextRequest) {
  try {
    const { tenantId, jobId, recordId, prompt, model, fieldName = "profile_image" } = await request.json()

    if (!tenantId || !jobId || !recordId || !prompt || !model) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Verify user has access to this tenant
    const supabase = createServerClient(cookies())
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

    const imageGenerator = new ImageGenerator()
    const result = await imageGenerator.generateAndUploadImage({
      tenantId,
      jobId,
      recordId,
      fieldName,
      prompt,
      model,
    })

    // Store new image metadata in media table
    const { error: mediaError } = await supabase.from("media").insert({
      tenant_id: tenantId,
      job_id: jobId,
      record_id: recordId,
      s3_key: result.s3Key,
      s3_bucket: process.env.AWS_S3_BUCKET || "client-synth-media",
      md5_hash: result.md5Hash,
      width: 512, // Default dimensions
      height: 512,
      file_size: result.fileSize,
      model_name: model,
      prompt: prompt,
    })

    if (mediaError) {
      console.error("Failed to store media metadata:", mediaError)
    }

    return NextResponse.json({
      success: true,
      imageUrl: result.url,
      s3Key: result.s3Key,
    })
  } catch (error) {
    console.error("Image regeneration error:", error)
    return NextResponse.json(
      {
        error: "Failed to regenerate image",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
