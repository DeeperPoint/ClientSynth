import { NextRequest, NextResponse } from 'next/server'
import { query, getCurrentUser, hasTenantAccess } from '@/lib/postgres/client'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authentication check
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const schemaId = params.id
    const { fields } = await request.json()

    if (!fields || !Array.isArray(fields)) {
      return NextResponse.json(
        { error: 'Fields array required' },
        { status: 400 }
      )
    }

    console.log(`[AddFields] Adding ${fields.length} fields to schema ${schemaId}`)

    // Fetch current schema with tenant_id
    const schemaResult = await query(
      'SELECT schema_definition, tenant_id FROM schemas WHERE id = $1',
      [schemaId]
    )

    if (schemaResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Schema not found' },
        { status: 404 }
      )
    }

    const schema = schemaResult.rows[0]
    
    // Verify user has access to the schema's tenant
    const hasAccess = await hasTenantAccess(user.id, schema.tenant_id)
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have access to this schema' },
        { status: 403 }
      )
    }

    const currentDefinition = schema.schema_definition
    const currentFields = currentDefinition.fields || []

    // Add new fields with IDs
    const newFields = fields.map(field => ({
      id: `field-${Date.now()}-${Math.random().toString(36).substring(7)}`, // Generate unique ID
      name: field.name,
      type: field.type,
      description: field.description || `Auto-generated field from example file`,
      required: field.required || false
    }))

    // Check for duplicates
    const existingFieldNames = new Set(currentFields.map((f: any) => f.name))
    const fieldsToAdd = newFields.filter(f => !existingFieldNames.has(f.name))

    if (fieldsToAdd.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All fields already exist',
        addedCount: 0
      })
    }

    // Update schema
    const updatedFields = [...currentFields, ...fieldsToAdd]
    const updatedDefinition = {
      ...currentDefinition,
      fields: updatedFields
    }

    await query(
      'UPDATE schemas SET schema_definition = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updatedDefinition), schemaId]
    )

    console.log(`[AddFields] Added ${fieldsToAdd.length} new fields`)

    return NextResponse.json({
      success: true,
      addedFields: fieldsToAdd,
      addedCount: fieldsToAdd.length,
      totalFields: updatedFields.length
    })

  } catch (error) {
    console.error('[AddFields] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to add fields' 
      },
      { status: 500 }
    )
  }
}




