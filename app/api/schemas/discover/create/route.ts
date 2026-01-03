import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, query } from "@/lib/postgres/client"
import { DiscoveredSchema } from "@/lib/schema-induction"

/**
 * POST /api/schemas/discover/create
 * 
 * Create schema from discovered schema definition
 * 
 * Request Body:
 * - name: string (required)
 * - description: string (optional)
 * - discoveredSchema: DiscoveredSchema (required)
 * - saveExampleData: boolean (optional, default: false) - whether to save uploaded file as example
 * 
 * Response: Created schema with ID
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { name, description, discoveredSchema, saveExampleData } = body

    if (!name || !discoveredSchema) {
      return NextResponse.json(
        { error: "Missing required fields: name, discoveredSchema" },
        { status: 400 }
      )
    }

    // Get user's tenant
    let tenantsResult = await query(
      `SELECT tenant_id FROM user_tenant_roles WHERE user_id = $1 LIMIT 1`,
      [user.id]
    )

    if (tenantsResult.rows.length === 0) {
      // Create default tenant if needed
      const createTenantRes = await fetch(new URL("/api/tenants/create-default", request.url), {
        method: "POST",
        headers: request.headers
      })

      if (!createTenantRes.ok) {
        return NextResponse.json(
          { error: "Unable to determine tenant. Please create an organization first." },
          { status: 400 }
        )
      }

      // Retry fetching tenant
      tenantsResult = await query(
        `SELECT tenant_id FROM user_tenant_roles WHERE user_id = $1 LIMIT 1`,
        [user.id]
      )

      if (tenantsResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Failed to create tenant" },
          { status: 500 }
        )
      }
    }

    const tenantId = tenantsResult.rows[0].tenant_id

    // Convert discovered schema to schema definition
    const schemaDefinition = {
      fields: discoveredSchema.fields.map((field: any) => ({
        id: field.id || `field_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        name: field.name.trim(),
        type: field.type,
        description: field.description || "",
        required: field.required || false,
        constraints: field.constraints || undefined
      })),
      metadata: {
        version: "1.0",
        created_at: new Date().toISOString()
      }
    }

    // Create schema in database
    const schemaResult = await query(
      `INSERT INTO schemas (tenant_id, name, description, schema_definition, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, name, description, schema_definition, created_at`,
      [
        tenantId,
        name.trim(),
        description?.trim() || null,
        JSON.stringify(schemaDefinition),
        user.id
      ]
    )

    if (schemaResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Failed to create schema" },
        { status: 500 }
      )
    }

    const createdSchema = schemaResult.rows[0]

    // If saveExampleData is true and file was provided, we'd save it here
    // This would require passing the file separately, which we'll handle in the UI flow
    // For now, we'll just return the schema

    return NextResponse.json({
      success: true,
      schema: {
        id: createdSchema.id,
        name: createdSchema.name,
        description: createdSchema.description,
        schema_definition: createdSchema.schema_definition,
        created_at: createdSchema.created_at
      }
    })

  } catch (error) {
    console.error("[SchemaDiscoverCreate] API error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create schema from discovery"
      },
      { status: 500 }
    )
  }
}

