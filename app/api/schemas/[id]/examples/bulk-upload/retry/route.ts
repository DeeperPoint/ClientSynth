import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { query } from "@/lib/postgres/client"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const schemaId = params.id
    const { fileIds } = await request.json()
    
    if (!schemaId) {
      return NextResponse.json({ error: "Schema ID is required" }, { status: 400 })
    }

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: "File IDs are required" }, { status: 400 })
    }

    // Verify user authentication
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get failed files that can be retried
    const failedFiles = await query(`
      SELECT buf.*, ef.file_name, ef.file_type, ef.file_size
      FROM bulk_upload_files buf
      JOIN bulk_upload_sessions bus ON buf.session_id = bus.id
      JOIN schemas s ON bus.schema_id = s.id
      JOIN user_tenant_roles utr ON s.tenant_id = utr.tenant_id
      WHERE buf.id = ANY($1) 
        AND buf.status = 'failed'
        AND utr.user_id = $2
        AND s.id = $3
    `, [fileIds, user.id, schemaId])

    if (failedFiles.rows.length === 0) {
      return NextResponse.json({ error: "No failed files found to retry" }, { status: 404 })
    }

    // Reset file statuses to pending for retry
    await query(`
      UPDATE bulk_upload_files SET
        status = 'pending',
        error_message = NULL,
        processing_started_at = NULL,
        processing_completed_at = NULL
      WHERE id = ANY($1)
    `, [fileIds])

    return NextResponse.json({
      success: true,
      message: `${failedFiles.rows.length} files marked for retry`,
      retryCount: failedFiles.rows.length
    })

  } catch (error) {
    console.error("Retry files error:", error)
    return NextResponse.json(
      { error: "Failed to retry files" },
      { status: 500 }
    )
  }
}


