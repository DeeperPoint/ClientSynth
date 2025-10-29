import { NextRequest, NextResponse } from 'next/server'
import { query, getCurrentUser } from '@/lib/postgres/client'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const schemaId = params.id
    const { name, description, schema_definition } = await request.json()

    console.log(`[UpdateSchema] Updating schema ${schemaId}`)

    // Validate input
    if (!name || !schema_definition) {
      return NextResponse.json(
        { error: 'Name and schema_definition are required' },
        { status: 400 }
      )
    }

    if (!schema_definition.fields || !Array.isArray(schema_definition.fields)) {
      return NextResponse.json(
        { error: 'schema_definition.fields must be an array' },
        { status: 400 }
      )
    }

    if (schema_definition.fields.length === 0) {
      return NextResponse.json(
        { error: 'At least one field is required' },
        { status: 400 }
      )
    }

    // Validate field names
    const fieldNames = new Set<string>()
    for (const field of schema_definition.fields) {
      if (!field.name) {
        return NextResponse.json(
          { error: 'All fields must have a name' },
          { status: 400 }
        )
      }

      // Check for duplicates
      if (fieldNames.has(field.name)) {
        return NextResponse.json(
          { error: `Duplicate field name: ${field.name}` },
          { status: 400 }
        )
      }
      fieldNames.add(field.name)

      // Validate field name format
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.name)) {
        return NextResponse.json(
          { error: `Invalid field name: ${field.name}. Use only letters, numbers, and underscores.` },
          { status: 400 }
        )
      }
    }

    // Get current user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if schema exists and user has access
    const schemaResult = await query(`
      SELECT s.id, s.tenant_id
      FROM schemas s
      JOIN user_tenant_roles utr ON s.tenant_id = utr.tenant_id
      WHERE s.id = $1 AND utr.user_id = $2
    `, [schemaId, user.id])

    if (schemaResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Schema not found or access denied' },
        { status: 404 }
      )
    }

    // Update schema
    const updateResult = await query(`
      UPDATE schemas
      SET 
        name = $1,
        description = $2,
        schema_definition = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING id, name, description, schema_definition, updated_at
    `, [
      name,
      description || null,
      JSON.stringify(schema_definition),
      schemaId
    ])

    if (updateResult.rows.length === 0) {
      throw new Error('Failed to update schema')
    }

    console.log(`[UpdateSchema] Successfully updated schema ${schemaId}`)

    return NextResponse.json({
      success: true,
      schema: updateResult.rows[0]
    })

  } catch (error) {
    console.error('[UpdateSchema] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update schema' 
      },
      { status: 500 }
    )
  }
}


