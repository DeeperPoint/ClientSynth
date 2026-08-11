import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, query } from "@/lib/postgres/client"

/**
 * POST /api/v1/schemas/import
 * 
 * Import schema from Knowledge Slot (MarketForge)
 * 
 * Request Body (JSON):
 * - name: string (required)
 * - description: string (optional)
 * - schema_definition: Object (required)
 *   - fields: Array of FieldDefinition
 *   - seed_rules: Array of RuleDefinition (optional)
 *   - metadata: Object (optional)
 * 
 * Response: Created schema with ID
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Parse request body
    const body = await request.json()
    const { name, description, schema_definition } = body

    if (!name || !schema_definition || !schema_definition.fields) {
      return NextResponse.json(
        { error: "Missing required fields: name, schema_definition.fields" },
        { status: 400 }
      )
    }

    // 3. Get user's tenant
    const tenantsResult = await query(
      `SELECT tenant_id FROM user_tenant_roles WHERE user_id = $1 LIMIT 1`,
      [user.id]
    )

    if (tenantsResult.rows.length === 0) {
      return NextResponse.json(
        { error: "No organization found for user. Please create a tenant first." },
        { status: 400 }
      )
    }

    const tenantId = tenantsResult.rows[0].tenant_id

    // 4. Validate and sanitize schema definition
    // We ensure each field has a stable ID and necessary properties
    const sanitizedFields = schema_definition.fields.map((field: any) => ({
      id: field.id || `field_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: field.name.trim(),
      type: field.type || "text",
      description: field.description || "",
      required: !!field.required,
      constraints: field.constraints || {},
      linkedFieldConfig: field.linkedFieldConfig || undefined,
      distributionConfig: field.distributionConfig || undefined
    }))

    const finalSchemaDefinition = {
      fields: sanitizedFields,
      seed_rules: schema_definition.seed_rules || [],
      metadata: {
        ...schema_definition.metadata,
        version: "1.0-knowledge-slot",
        imported_at: new Date().toISOString(),
        source: "CommonContext"
      }
    }

    // 5. Insert into database
    const result = await query(
      `INSERT INTO schemas (tenant_id, name, description, schema_definition, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, name, description, schema_definition, created_at`,
      [
        tenantId,
        name.trim(),
        description?.trim() || null,
        JSON.stringify(finalSchemaDefinition),
        user.id
      ]
    )

    if (result.rows.length === 0) {
      throw new Error("Failed to insert schema into database")
    }

    const createdSchema = result.rows[0]

    return NextResponse.json({
      success: true,
      schema: {
        id: createdSchema.id,
        name: createdSchema.name,
        description: createdSchema.description,
        schema_definition: createdSchema.schema_definition,
        created_at: createdSchema.created_at
      }
    }, { status: 201 })

  } catch (error) {
    console.error("[SchemaImport] API error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to import schema"
      },
      { status: 500 }
    )
  }
}
