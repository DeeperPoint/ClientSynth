import { spawn, spawnSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { S3Uploader } from './s3-uploader'

/**
 * Resolves the correct Python command to use.
 * Tries 'python3', 'python', and 'py' in that order.
 */
function resolvePythonCommand(): string {
  const candidates = ['python3', 'python', 'py']
  for (const cmd of candidates) {
    try {
      const res = spawnSync(cmd, ['-V'], { timeout: 2000 })
      if (res.status === 0 || (res.stderr && res.stderr.toString().length > 0)) {
        return cmd
      }
    } catch {
      // Continue to next candidate
    }
  }
  // Fallback to python3 as it's most common on Linux
  return 'python3'
}

export interface PDFField {
  name: string
  label: string
  type?: string
}

export interface PDFTemplateOptions {
  title: string
  fields: PDFField[]
  pageSize?: 'A4' | 'LETTER'
  marginMm?: number
}

export interface PDFFillOptions {
  pdfBase64: string
  data: Record<string, any>
}

export interface PDFContentOptions {
  title: string
  content: string
  pageSize?: 'A4' | 'LETTER'
  marginMm?: number
}

export interface PDFTemplateConfig {
  title?: string
  pageSize?: 'A4' | 'LETTER'
  marginMm?: number
  fonts?: {
    default?: string
    defaultSize?: number
    title?: { family: string; size: number }
    header?: { family: string; size: number }
  }
  sections?: Array<{
    type: 'title' | 'text' | 'table' | 'pageBreak' | 'spacer'
    content?: string
    headers?: string[]
    rows?: string | any[]
    style?: {
      headerBackground?: string
      alternateRows?: boolean
      columnWidths?: number[]
    }
    pageBreakBefore?: boolean
    pageBreakAfter?: boolean
    font?: { family: string; size: number }
    spaceAfter?: number
    heightMm?: number
  }>
}

export interface PDFTemplateGenerateOptions {
  templateConfig: PDFTemplateConfig
  data: Record<string, any>
  pageSize?: 'A4' | 'LETTER'
  marginMm?: number
}

export class PDFGenerator {
  private s3Uploader = new S3Uploader()

  async uploadPDFToS3(pdfBase64: string, tenantId: string, jobId: string, filename: string): Promise<{ url: string; s3Key: string }> {
    const buffer = Buffer.from(pdfBase64, 'base64')
    
    // Use uploadBuffer which accepts a direct key path
    const key = `${tenantId}/${jobId}/${filename}`
    const result = await this.s3Uploader.uploadBuffer(buffer, key, 'application/pdf')
    return { url: result.url, s3Key: result.s3Key }
  }

  async createFromContent(options: PDFContentOptions): Promise<{ success: boolean; pdfBase64?: string; error?: string }> {
    return new Promise((resolve) => {
      try {
        const pythonCmd = resolvePythonCommand()
        const python = spawn(pythonCmd, [
          'lib/pdf_service.py',
          'content',
          options.title,
          options.content,
          options.pageSize || 'A4',
          String(options.marginMm || 20)
        ], {
          cwd: process.cwd()
        })

        let output = ''
        let error = ''

        python.stdout.on('data', (data) => {
          output += data.toString()
        })

        python.stderr.on('data', (data) => {
          error += data.toString()
        })

        python.on('close', (code) => {
          if (code !== 0) {
            resolve({ success: false, error: error || 'Python process failed' })
            return
          }

          try {
            const result = JSON.parse(output)
            resolve({
              success: result.success,
              pdfBase64: result.pdf_base64,
              error: result.error
            })
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse Python output' })
          }
        })
      } catch (e) {
        resolve({ success: false, error: 'Failed to spawn Python process' })
      }
    })
  }

  async createTemplate(options: PDFTemplateOptions): Promise<{ success: boolean; pdfBase64?: string; error?: string }> {
    return new Promise((resolve) => {
      const tempFile = join(process.cwd(), `temp_${Date.now()}.json`)
      
      try {
        writeFileSync(tempFile, JSON.stringify(options.fields))
        
        const pythonCmd = resolvePythonCommand()
        const python = spawn(pythonCmd, [
          'lib/pdf_service.py',
          'template',
          options.title,
          tempFile,
          options.pageSize || 'A4',
          String(options.marginMm || 20)
        ], {
          cwd: process.cwd()
        })

        let output = ''
        let error = ''

        python.stdout.on('data', (data) => {
          output += data.toString()
        })

        python.stderr.on('data', (data) => {
          error += data.toString()
        })

        python.on('close', (code) => {
          // Clean up temp file
          try {
            unlinkSync(tempFile)
          } catch (e) {
            // Ignore cleanup errors
          }
          
          if (code !== 0) {
            resolve({ success: false, error: error || 'Python process failed' })
            return
          }

          try {
            const result = JSON.parse(output)
            // Map Python response to expected format
            resolve({
              success: result.success,
              pdfBase64: result.pdf_base64,
              error: result.error
            })
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse Python output' })
          }
        })
      } catch (e) {
        resolve({ success: false, error: 'Failed to create temp file' })
      }
    })
  }

  async fillPDF(options: PDFFillOptions): Promise<{ success: boolean; pdfBase64?: string; error?: string }> {
    return new Promise((resolve) => {
      const tempFile = join(process.cwd(), `temp_${Date.now()}.json`)
      
      try {
        writeFileSync(tempFile, JSON.stringify(options.data))
        
        const pythonCmd = resolvePythonCommand()
        const python = spawn(pythonCmd, [
          'lib/pdf_service.py',
          'fill',
          options.pdfBase64,
          tempFile
        ], {
          cwd: process.cwd()
        })

        let output = ''
        let error = ''

        python.stdout.on('data', (data) => {
          output += data.toString()
        })

        python.stderr.on('data', (data) => {
          error += data.toString()
        })

        python.on('close', (code) => {
          // Clean up temp file
          try {
            unlinkSync(tempFile)
          } catch (e) {
            // Ignore cleanup errors
          }
          
          if (code !== 0) {
            resolve({ success: false, error: error || 'Python process failed' })
            return
          }

          try {
            const result = JSON.parse(output)
            // Map Python response to expected format
            resolve({
              success: result.success,
              pdfBase64: result.pdf_base64,
              error: result.error
            })
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse Python output' })
          }
        })
      } catch (e) {
        resolve({ success: false, error: 'Failed to create temp file' })
      }
    })
  }

    async generateFromTemplate(options: PDFTemplateGenerateOptions): Promise<{ success: boolean; pdfBase64?: string; error?: string }> {
    return new Promise((resolve) => {
      const templateFile = join(process.cwd(), `temp_template_${Date.now()}.json`)
      const dataFile = join(process.cwd(), `temp_data_${Date.now()}.json`)
      
      try {
        writeFileSync(templateFile, JSON.stringify(options.templateConfig))
        writeFileSync(dataFile, JSON.stringify(options.data))

        const pythonCmd = resolvePythonCommand()
        const python = spawn(pythonCmd, [
          'lib/pdf_service.py',
          'generate',
          templateFile,
          dataFile,
          options.pageSize || options.templateConfig.pageSize || 'A4',
          String(options.marginMm || options.templateConfig.marginMm || 20)
        ], {
          cwd: process.cwd()
        })

        let output = ''
        let error = ''

        python.stdout.on('data', (data) => {
          output += data.toString()
        })

        python.stderr.on('data', (data) => {
          error += data.toString()
        })

        python.on('close', (code) => {
          // Clean up temp files
          try {
            unlinkSync(templateFile)
            unlinkSync(dataFile)
          } catch (e) {
            // Ignore cleanup errors
          }

          if (code !== 0) {
            resolve({ success: false, error: error || 'Python process failed' })
            return
          }

          try {
            const result = JSON.parse(output)
            resolve({
              success: result.success,
              pdfBase64: result.pdf_base64,
              error: result.error
            })
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse Python output' })
          }
        })
      } catch (e) {
        resolve({ success: false, error: 'Failed to create temp files' })
      }
    })
  }

  async generateAndUploadPDF(
    tenantId: string,
    jobId: string,
    recordId: string,
    fieldName: string,
    options: PDFTemplateOptions | PDFFillOptions,
    recordData: Record<string, any>
  ): Promise<{ url: string; s3Key: string }> {
    let result: { success: boolean; pdfBase64?: string; error?: string }        

    if ('pdfBase64' in options) {
      result = await this.fillPDF(options)
    } else {
      result = await this.createTemplate(options)
    }

    if (!result.success || !result.pdfBase64) {
      throw new Error(result.error || 'PDF generation failed')
    }

    const pdfBuffer = Buffer.from(result.pdfBase64, 'base64')
    const s3Key = `${tenantId}/${jobId}/${recordId}_${fieldName}.pdf`

    const uploadResult = await this.s3Uploader.uploadBuffer(
      pdfBuffer,
      s3Key,
      'application/pdf'
    )

    return {
      url: uploadResult.url,
      s3Key: uploadResult.s3Key
    }
  }
}

