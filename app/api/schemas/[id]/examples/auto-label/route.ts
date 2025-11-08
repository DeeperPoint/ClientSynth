import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/postgres/client"
import { createServerClient } from "@/lib/postgres/server"
import { AILabelingEngine } from "@/lib/ai-labeling-engine"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const schemaId = params.id

    if (!schemaId) {
      return NextResponse.json({ error: "Schema ID is required" }, { status: 400 })
    }

    // Verify authentication
    const db = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify schema access
    const schemaResult = await query(
      `SELECT s.*, t.id as tenant_id
       FROM schemas s
       JOIN tenants t ON s.tenant_id = t.id
       JOIN user_tenant_roles utr ON t.id = utr.tenant_id
       WHERE s.id = $1 AND utr.user_id = $2`,
      [schemaId, user.id]
    )

    if (schemaResult.rows.length === 0) {
      return NextResponse.json({ error: "Schema not found or access denied" }, { status: 404 })
    }

    // Get optional parameters
    const body = await request.json().catch(() => ({}))
    const exampleFileIds = body.exampleFileIds || undefined

    // Run auto-labeling
    const engine = new AILabelingEngine()
    const result = await engine.autoLabelAndMap(schemaId, exampleFileIds)

    // Store mapping results in database (optional)
    try {
      await query(
        `INSERT INTO schema_field_mappings (
          schema_id, tenant_id, mappings, coverage_metrics, created_at, created_by
        ) VALUES ($1, $2, $3, $4, NOW(), $5)
        ON CONFLICT (schema_id) 
        DO UPDATE SET 
          mappings = EXCLUDED.mappings,
          coverage_metrics = EXCLUDED.coverage_metrics,
          updated_at = NOW()`,
        [
          schemaId,
          schemaResult.rows[0].tenant_id,
          JSON.stringify(result.mappings),
          JSON.stringify(result.coverage),
          user.id
        ]
      )
    } catch (error) {
      console.warn('[AutoLabel] Could not save mappings to database:', error)
      // Continue even if save fails
    }

    return NextResponse.json({
      success: true,
      mappings: result.mappings,
      coverage: result.coverage,
      seeds: result.validatedSeeds
    })
  } catch (error) {
    console.error("Auto-labeling error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auto-labeling failed" },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const schemaId = params.id

    // Verify authentication
    const db = await createServerClient()
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get stored mappings if available
    try {
      const result = await query(
        `SELECT mappings, coverage_metrics, updated_at
         FROM schema_field_mappings
         WHERE schema_id = $1`,
        [schemaId]
      )

      if (result.rows.length > 0) {
        return NextResponse.json({
          success: true,
          mappings: result.rows[0].mappings,
          coverage: result.rows[0].coverage_metrics,
          lastUpdated: result.rows[0].updated_at
        })
      }
    } catch (error) {
      console.warn('[AutoLabel] Mappings table not found or query failed:', error)
    }

    return NextResponse.json({
      success: false,
      message: "No stored mappings found. Run POST to generate mappings."
    })
  } catch (error) {
    console.error("Get mappings error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get mappings" },
      { status: 500 }
    )
  }
}





