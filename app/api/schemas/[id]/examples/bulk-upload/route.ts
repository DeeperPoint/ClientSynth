import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { S3Uploader } from "@/lib/s3-uploader"
import { LocalFileStorage } from "@/lib/local-file-storage"
import { UniversalFileParser } from "@/lib/universal-file-parser"
import { query } from "@/lib/postgres/client"
import crypto from "crypto"

interface BulkUploadFile {
  id: string
  file: File
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  error?: string
  parsedData?: any
  uploadResult?: any
}

interface BulkUploadResult {
  batchId: string
  totalFiles: number
  completedFiles: number
  failedFiles: number
  results: Array<{
    fileId: string
    fileName: string
    status: 'success' | 'failed'
    error?: string
    parsedFields?: number
    recordCount?: number
  }>
}

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
    const files = formData.getAll("files") as File[]
    const fieldMappings = JSON.parse(formData.get("fieldMappings") as string || "{}")

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    // Validate file count limit
    if (files.length > 50) {
      return NextResponse.json({ error: "Maximum 50 files allowed per batch" }, { status: 400 })
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

    // Generate session ID for tracking
    const sessionId = crypto.randomUUID()
    const batchId = crypto.randomUUID()
    
    // Create bulk upload session (skip if tables don't exist yet)
    try {
      await query(`
        INSERT INTO bulk_upload_sessions (
          id, tenant_id, schema_id, session_name, total_files, 
          total_size_bytes, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [
        sessionId,
        tenantId,
        schemaId,
        `Bulk Upload ${new Date().toLocaleString()}`,
        files.length,
        files.reduce((sum, file) => sum + file.size, 0),
        'processing',
        user.id
      ])
    } catch (error) {
      console.warn('Bulk upload session table not found, continuing without session tracking:', error)
    }

    // Initialize results
    const results: BulkUploadResult = {
      batchId: sessionId,
      totalFiles: files.length,
      completedFiles: 0,
      failedFiles: 0,
      results: []
    }

    // Process files in parallel with concurrency limit
    const concurrencyLimit = 5
    const parser = new UniversalFileParser()
    
    const processFile = async (file: File, index: number): Promise<void> => {
      const fileId = crypto.randomUUID()
      const fileName = file.name
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || ''
      
      // Create bulk upload file record (skip if table doesn't exist)
      try {
        await query(`
          INSERT INTO bulk_upload_files (
            id, session_id, file_name, file_size, file_type, status
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [fileId, sessionId, fileName, file.size, fileExtension, 'processing'])
      } catch (error) {
        console.warn('Bulk upload files table not found, continuing without file tracking:', error)
      }
      
      try {
        // Enhanced file validation
        const validation = parser.validateFile(file)
        if (!validation.valid) {
          throw new Error(validation.error || 'Invalid file')
        }

        // Check file size (50MB limit)
        if (file.size > 50 * 1024 * 1024) {
          throw new Error('File size exceeds 50MB limit')
        }

        // Enhanced file type validation with MIME type checking
        const allowedExtensions = ['pdf', 'docx', 'doc', 'txt', 'csv', 'json', 'xlsx', 'xls', 'xml', 'png', 'jpg', 'jpeg', 'gif']
        const allowedMimeTypes = [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          'text/plain',
          'text/csv',
          'application/json',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/xml',
          'image/png',
          'image/jpeg',
          'image/gif'
        ]
        
        if (!allowedExtensions.includes(fileExtension)) {
          throw new Error(`File type .${fileExtension} not supported`)
        }
        
        if (!allowedMimeTypes.includes(file.type)) {
          throw new Error(`MIME type ${file.type} not supported`)
        }

        // Basic virus scan - check for suspicious file patterns
        const suspiciousPatterns = [
          /\.exe$/i,
          /\.bat$/i,
          /\.cmd$/i,
          /\.scr$/i,
          /\.pif$/i,
          /\.com$/i,
          /\.vbs$/i,
          /\.js$/i,
          /\.jar$/i
        ]
        
        if (suspiciousPatterns.some(pattern => pattern.test(fileName))) {
          throw new Error('File type appears to be executable and is not allowed')
        }

        // Parse file
        const parseResult = await parser.parseFile(file)
        if (!parseResult.success) {
          throw new Error(parseResult.error || 'Failed to parse file')
        }

        // Generate file metadata
        const fileBuffer = await file.arrayBuffer()
        const md5Hash = crypto.createHash("md5").update(Buffer.from(fileBuffer)).digest("hex")
        const fileType = fileExtension === 'csv' ? 'csv' : 
                        fileExtension === 'json' ? 'json' : 
                        ['xlsx', 'xls'].includes(fileExtension) ? fileExtension :
                        ['png', 'jpg', 'jpeg', 'gif'].includes(fileExtension) ? 'image' :
                        fileExtension

        // Upload file
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
          console.warn(`[BulkUpload] S3 upload failed for ${fileName}, falling back to local storage:`, s3Error)
          const localStorage = new LocalFileStorage()
          uploadResult = await localStorage.uploadFile(Buffer.from(fileBuffer), {
            tenantId,
            schemaId,
            fileName: file.name,
            contentType: file.type,
            md5Hash
          })
        }

        // Store file metadata in database (simplified for compatibility)
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
          uploadResult.bucket,
          md5Hash,
          user.id
        ])

        const exampleFileId = fileResult.rows[0].id

        // Update bulk upload file record with success (skip if table doesn't exist)
        try {
          await query(`
            UPDATE bulk_upload_files SET
              example_file_id = $1,
              status = 'completed',
              processing_completed_at = $2,
              extracted_fields_count = $3,
              extracted_records_count = $4,
              confidence_score = $5
            WHERE id = $6
          `, [
            exampleFileId,
            new Date(),
            parseResult.fields.length,
            parseResult.metadata.recordCount,
            parseResult.metadata.confidence,
            fileId
          ])
        } catch (error) {
          console.warn('Bulk upload files table not found, skipping update:', error)
        }

        // Store parsed example data
        const exampleData = parseResult.fields.flatMap(field => 
          field.exampleValues.map((value, valueIndex) => ({
            example_file_id: exampleFileId,
            field_name: fieldMappings[field.fieldName] || field.fieldName,
            example_value: value,
            row_index: valueIndex
          }))
        )

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

        // Add to results
        results.results.push({
          fileId: exampleFileId,
          fileName,
          status: 'success',
          parsedFields: parseResult.fields.length,
          recordCount: parseResult.metadata.recordCount
        })
        
        results.completedFiles++

      } catch (error) {
        console.error(`[BulkUpload] Error processing ${fileName}:`, error)
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // Update bulk upload file record with failure (skip if table doesn't exist)
        try {
          await query(`
            UPDATE bulk_upload_files SET
              status = 'failed',
              error_message = $1,
              processing_completed_at = $2
            WHERE id = $3
          `, [errorMessage, new Date(), fileId])
        } catch (error) {
          console.warn('Bulk upload files table not found, skipping update:', error)
        }
        
        results.results.push({
          fileId: crypto.randomUUID(),
          fileName,
          status: 'failed',
          error: errorMessage
        })
        
        results.failedFiles++
      }
    }

    // Process files with concurrency limit
    const processBatches = async () => {
      for (let i = 0; i < files.length; i += concurrencyLimit) {
        const batch = files.slice(i, i + concurrencyLimit)
        await Promise.all(batch.map((file, batchIndex) => processFile(file, i + batchIndex)))
      }
    }

    await processBatches()

    // Update session status (skip if table doesn't exist)
    try {
      const finalStatus = results.failedFiles === 0 ? 'completed' : 
                         results.completedFiles === 0 ? 'failed' : 'completed'
      
      await query(`
        UPDATE bulk_upload_sessions SET
          status = $1,
          completed_files = $2,
          failed_files = $3,
          completed_at = $4
        WHERE id = $5
      `, [finalStatus, results.completedFiles, results.failedFiles, new Date(), sessionId])
    } catch (error) {
      console.warn('Bulk upload sessions table not found, skipping update:', error)
    }

    return NextResponse.json({
      success: true,
      batchId: results.batchId,
      sessionId: sessionId,
      totalFiles: results.totalFiles,
      completedFiles: results.completedFiles,
      failedFiles: results.failedFiles,
      results: results.results
    })

  } catch (error) {
    console.error("Bulk upload error:", error)
    return NextResponse.json(
      { error: "Failed to process bulk upload" },
      { status: 500 }
    )
  }
}

// Get bulk upload status
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const schemaId = params.id
    const { searchParams } = new URL(request.url)
    const batchId = searchParams.get('batchId')
    
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

    // Get recent uploads for this schema
    const recentUploads = await query(`
      SELECT 
        ef.id, ef.file_name, ef.file_type, ef.file_size, ef.created_at,
        ef.parsing_metadata,
        p.full_name as uploaded_by_name
      FROM example_files ef
      JOIN profiles p ON ef.uploaded_by = p.id
      JOIN schemas s ON ef.schema_id = s.id
      JOIN user_tenant_roles utr ON s.tenant_id = utr.tenant_id
      WHERE ef.schema_id = $1 AND utr.user_id = $2
      ORDER BY ef.created_at DESC
      LIMIT 50
    `, [schemaId, user.id])

    return NextResponse.json({
      success: true,
      uploads: recentUploads.rows
    })

  } catch (error) {
    console.error("Get bulk upload status error:", error)
    return NextResponse.json(
      { error: "Failed to get upload status" },
      { status: 500 }
    )
  }
}
