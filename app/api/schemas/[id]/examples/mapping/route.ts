import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { FileParser } from "@/lib/file-parser"
import { query } from "@/lib/postgres/client"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const schemaId = params.id
    
    if (!schemaId) {
      return NextResponse.json({ error: "Schema ID is required" }, { status: 400 })
    }

    // Verify user authentication
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { exampleFieldNames } = await request.json()

    if (!Array.isArray(exampleFieldNames)) {
      return NextResponse.json({ error: "exampleFieldNames must be an array" }, { status: 400 })
    }

    // Get schema fields
    const schemaResult = await query(`
      SELECT s.schema_definition
      FROM schemas s
      JOIN user_tenant_roles utr ON s.tenant_id = utr.tenant_id
      WHERE s.id = $1 AND utr.user_id = $2
    `, [schemaId, user.id])

    if (schemaResult.rows.length === 0) {
      return NextResponse.json({ error: "Schema not found or access denied" }, { status: 404 })
    }

    const schema = schemaResult.rows[0]
    const schemaFieldNames = schema.schema_definition?.fields?.map((field: any) => field.name) || []

    // Get field mapping suggestions
    const fileParser = new FileParser()
    const suggestions = fileParser.getFieldMappingSuggestions(exampleFieldNames, schemaFieldNames)

    return NextResponse.json({
      success: true,
      suggestions
    })

  } catch (error) {
    console.error("Field mapping suggestions error:", error)
    return NextResponse.json(
      { error: "Failed to get field mapping suggestions" },
      { status: 500 }
    )
  }
}
