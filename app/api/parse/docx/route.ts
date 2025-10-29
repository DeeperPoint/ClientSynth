import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { writeFile, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Save file temporarily
    const buffer = Buffer.from(await file.arrayBuffer())
    const tempFilePath = path.join('/tmp', `${randomUUID()}.docx`)
    await writeFile(tempFilePath, buffer)

    try {
      // Parse DOCX using Python script
      const text = await this.parseDOCXFile(tempFilePath)
      
      return NextResponse.json({ 
        success: true, 
        text 
      })
    } finally {
      // Clean up temp file
      await unlink(tempFilePath).catch(() => {})
    }
  } catch (error) {
    console.error('[DOCX Parse] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'DOCX parsing failed' 
      },
      { status: 500 }
    )
  }
}

async function parseDOCXFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const python = spawn('python', [
      path.join(process.cwd(), 'lib', 'docx_parser.py'),
      filePath
    ])

    let output = ''
    let errorOutput = ''

    python.stdout.on('data', (data) => {
      output += data.toString()
    })

    python.stderr.on('data', (data) => {
      errorOutput += data.toString()
    })

    python.on('close', (code) => {
      if (code === 0) {
        resolve(output)
      } else {
        reject(new Error(`DOCX parsing failed: ${errorOutput}`))
      }
    })

    python.on('error', (error) => {
      reject(new Error(`Failed to start Python: ${error.message}`))
    })
  })
}


