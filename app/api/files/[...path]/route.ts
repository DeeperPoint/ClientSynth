import { NextRequest, NextResponse } from "next/server"
import fs from 'fs'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const filePath = params.path.join('/')
    const fullPath = path.join(process.cwd(), 'uploads', 'example-files', filePath)
    
    // Security check - ensure the path is within our uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads', 'example-files')
    const resolvedPath = path.resolve(fullPath)
    const resolvedUploadsDir = path.resolve(uploadsDir)
    
    if (!resolvedPath.startsWith(resolvedUploadsDir)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const fileBuffer = fs.readFileSync(fullPath)
    const ext = path.extname(fullPath).toLowerCase()
    
    // Set appropriate content type based on file extension
    const contentTypes: Record<string, string> = {
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.txt': 'text/plain',
    }
    
    const contentType = contentTypes[ext] || 'application/octet-stream'

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${path.basename(fullPath)}"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })

  } catch (error) {
    console.error("File serve error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
