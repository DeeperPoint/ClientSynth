import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { S3Uploader } from "@/lib/s3-uploader"
import { LocalFileStorage } from "@/lib/local-file-storage"
import { FileParser } from "@/lib/file-parser"
import { query } from "@/lib/postgres/client"
import crypto from "crypto"

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

    // Get form data
    const formData = await request.formData()
    const file = formData.get("file") as File
    const fieldMappings = JSON.parse(formData.get("fieldMappings") as string || "{}")

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file
    const fileParser = new FileParser()
    const validation = fileParser.validateFile(file)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Get schema and verify access
    const schemaResult = await query(`
      SELECT s.*, t.id as tenant_id
      FROM schemas s
      JOIN tenants t ON s.tenant_id = t.id
      JOIN user_tenant_roles utr ON t.id = utr.tenant_id
      WHERE s.id = $1 AND utr.user_id = $2
    `, [schemaId, user.id])

    if (schemaResult.rows.length === 0) {
      return NextResponse.json({ error: "Schema not found or access denied" }, { status: 404 })
    }

    const schema = schemaResult.rows[0]
    const tenantId = schema.tenant_id

    // Parse the file
    const parseResult = await fileParser.parseFile(file)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error }, { status: 400 })
    }

    // Generate file metadata
    const fileBuffer = await file.arrayBuffer()
    const md5Hash = crypto.createHash("md5").update(Buffer.from(fileBuffer)).digest("hex")
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'unknown'
    const allowedTypes = new Set(['csv','json','xlsx','xls'])
    const fileType = allowedTypes.has(fileExtension) ? fileExtension : 'json'

    // Try S3 upload first, fallback to local storage
    let uploadResult
    try {
      const s3Uploader = new S3Uploader()
      uploadResult = await s3Uploader.uploadFile(Buffer.from(fileBuffer), {
        tenantId,
        schemaId,
        fileName: file.name,
        contentType: file.type,
        md5Hash
      })
    } catch (s3Error) {
      console.warn("[Upload] S3 upload failed, falling back to local storage:", s3Error)
      const localStorage = new LocalFileStorage()
      uploadResult = await localStorage.uploadFile(Buffer.from(fileBuffer), {
        tenantId,
        schemaId,
        fileName: file.name,
        contentType: file.type,
        md5Hash
      })
    }

    // Store file metadata in database
    const fileResult = await query(`
      INSERT INTO example_files (
        tenant_id, schema_id, file_name, file_type, file_size, 
        s3_key, s3_bucket, md5_hash, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      tenantId,
      schemaId,
      file.name,
      fileType,
      file.size,
      uploadResult.key,
      (uploadResult as any).bucket ?? 'local',
      md5Hash,
      user.id
    ])

    const exampleFileId = fileResult.rows[0].id

    // Store parsed example data
    const exampleData = parseResult.data.map(item => ({
      example_file_id: exampleFileId,
      field_name: fieldMappings[item.fieldName] || item.fieldName,
      example_value: item.exampleValue,
      row_index: item.rowIndex
    }))

    // Batch insert example data
    if (exampleData.length > 0) {
      const values = exampleData.map((_, index) => 
        `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`
      ).join(',')

      const params = exampleData.flatMap(item => [
        item.example_file_id,
        item.field_name,
        item.example_value,
        item.row_index
      ])

      await query(`
        INSERT INTO example_data (example_file_id, field_name, example_value, row_index)
        VALUES ${values}
      `, params)
    }

    return NextResponse.json({
      success: true,
      fileId: exampleFileId,
      parsedData: {
        fieldNames: parseResult.fieldNames,
        totalRows: parseResult.totalRows,
        mappedFields: Object.keys(fieldMappings).length
      }
    })

  } catch (error) {
    console.error("Example file upload error:", error)
    return NextResponse.json(
      { error: "Failed to upload example file" },
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

    // Get example files for this schema
    const filesResult = await query(`
      SELECT 
        ef.id, ef.file_name, ef.file_type, ef.file_size, ef.created_at,
        p.full_name as uploaded_by_name
      FROM example_files ef
      JOIN profiles p ON ef.uploaded_by = p.id
      JOIN schemas s ON ef.schema_id = s.id
      JOIN user_tenant_roles utr ON s.tenant_id = utr.tenant_id
      WHERE ef.schema_id = $1 AND utr.user_id = $2
      ORDER BY ef.created_at DESC
    `, [schemaId, user.id])

    // Get example data summary per file
    const examplesPerFileResult = await query(`
      SELECT 
        ef.id as example_file_id,
        COUNT(*) as total_examples
      FROM example_data ed
      JOIN example_files ef ON ed.example_file_id = ef.id
      JOIN schemas s ON ef.schema_id = s.id
      JOIN user_tenant_roles utr ON s.tenant_id = utr.tenant_id
      WHERE ef.schema_id = $1 AND utr.user_id = $2
      GROUP BY ef.id
      ORDER BY ef.created_at DESC
    `, [schemaId, user.id])

    return NextResponse.json({
      success: true,
      files: filesResult.rows,
      examplesPerFile: examplesPerFileResult.rows
    })

  } catch (error) {
    console.error("Get example files error:", error)
    return NextResponse.json(
      { error: "Failed to get example files" },
      { status: 500 }
    )
  }
}
