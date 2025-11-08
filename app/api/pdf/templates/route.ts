import { NextRequest, NextResponse } from "next/server"
import { PDFTemplateService } from "@/lib/pdf-template-service"
import { getCurrentUser } from "@/lib/postgres/client"
import { query } from "@/lib/postgres/client"

const templateService = new PDFTemplateService()

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { action, ...params } = body

    if (action === "create") {
      // Get user's first tenant (simplified - in production, handle tenant selection)
      const tenantResult = await query(
        `SELECT tenant_id FROM user_tenant_roles WHERE user_id = $1 LIMIT 1`,
        [user.id]
      )

      if (tenantResult.rows.length === 0) {
        return NextResponse.json({ error: "No tenant found for user" }, { status: 403 })
      }

      const tenantId = tenantResult.rows[0].tenant_id

      const template = await templateService.createTemplate({
        tenantId,
        name: params.name,
        description: params.description,
        templateConfig: params.templateConfig,
        templatePdfBase64: params.templatePdfBase64,
        createdBy: user.id,
      })

      return NextResponse.json({ success: true, template })
    } else if (action === "generate") {
      // Get user's first tenant
      const tenantResult = await query(
        `SELECT tenant_id FROM user_tenant_roles WHERE user_id = $1 LIMIT 1`,
        [user.id]
      )

      if (tenantResult.rows.length === 0) {
        return NextResponse.json({ error: "No tenant found for user" }, { status: 403 })
      }

      const tenantId = tenantResult.rows[0].tenant_id

      const result = await templateService.generatePDF(
        tenantId,
        params.templateName,
        params.data,
        params.version,
        params.pageSize,
        params.marginMm
      )

      return NextResponse.json(result)
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("[PDF Templates API] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const action = searchParams.get("action")

    // Get user's first tenant
    const tenantResult = await query(
      `SELECT tenant_id FROM user_tenant_roles WHERE user_id = $1 LIMIT 1`,
      [user.id]
    )

    if (tenantResult.rows.length === 0) {
      return NextResponse.json({ error: "No tenant found for user" }, { status: 403 })
    }

    const tenantId = tenantResult.rows[0].tenant_id

    if (action === "list") {
      const templates = await templateService.listTemplates(tenantId)
      return NextResponse.json({ success: true, templates })
    } else if (action === "get") {
      const name = searchParams.get("name")
      const version = searchParams.get("version") ? parseInt(searchParams.get("version")!) : undefined

      if (!name) {
        return NextResponse.json({ error: "Template name required" }, { status: 400 })
      }

      const template = await templateService.getTemplate(tenantId, name, version)
      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 })
      }

      return NextResponse.json({ success: true, template })
    } else if (action === "stats") {
      const templateName = searchParams.get("templateName") || undefined
      const days = searchParams.get("days") ? parseInt(searchParams.get("days")!) : 30

      const stats = await templateService.getUsageStats(tenantId, templateName, days)
      return NextResponse.json({ success: true, stats })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("[PDF Templates API] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}



