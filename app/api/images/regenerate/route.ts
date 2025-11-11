import { type NextRequest, NextResponse } from "next/server"
import { ImageGenerator } from "@/lib/image-generator"
import { getCurrentUser, query } from "@/lib/postgres/client"

export async function POST(request: NextRequest) {
  try {
    const { tenantId, jobId, recordId, prompt, model, fieldName = "profile_image" } = await request.json()

    if (!tenantId || !jobId || !recordId || !prompt || !model) {
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
    try {
      await query(
        `
          INSERT INTO media (
            tenant_id, job_id, record_id, field_name, s3_key, s3_url,
            content_type, file_size, md5_hash, model_used, prompt_used, generation_metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          tenantId,
          jobId,
          recordId,
          fieldName,
          result.s3Key,
          result.url,
          "image/png",
          result.fileSize || 0,
          result.md5Hash || "",
          model,
          prompt,
          JSON.stringify({
            regeneratedAt: new Date().toISOString(),
            regenerateRequestedBy: user.id,
          }),
        ]
      )
    } catch (mediaError) {
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
        error: "Image regeneration failed",
        details: error instanceof Error ? error.message : "Unknown error",
        message: "Please check your OpenRouter API key and try again",
      },
      { status: 500 },
    )
  }
}
