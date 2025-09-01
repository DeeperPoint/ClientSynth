import { type NextRequest, NextResponse } from "next/server"
import { ImageGenerator } from "@/lib/image-generator"
import { createServerClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"

export async function POST(request: NextRequest) {
  try {
    const { tenantId, jobId, recordId, prompt, model, recordData } = await request.json()

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
    const imageUrl = await imageGenerator.generateAndUploadImage({
      tenantId,
      jobId,
      recordId,
      prompt,
      model,
      recordData,
    })

    return NextResponse.json({ imageUrl })
  } catch (error) {
    console.error("Image generation error:", error)
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 })
  }
}
