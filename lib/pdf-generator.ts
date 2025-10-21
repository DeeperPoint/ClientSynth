import { spawn } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { S3Uploader } from './s3-uploader'

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

export class PDFGenerator {
  private s3Uploader = new S3Uploader()

  async createTemplate(options: PDFTemplateOptions): Promise<{ success: boolean; pdfBase64?: string; error?: string }> {
    return new Promise((resolve) => {
      const tempFile = join(process.cwd(), `temp_${Date.now()}.json`)
      
      try {
        writeFileSync(tempFile, JSON.stringify(options.fields))
        
        const python = spawn('python', [
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
        
        const python = spawn('python', [
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

