import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export interface LocalFileStorageResult {
  key: string
  url: string
  publicUrl: string
  bucket: string
  md5: string
  size: number
  metadata: {
    size: number
    contentType: string
    md5: string
  }
}

export class LocalFileStorage {
  private storageDir: string

  constructor() {
    this.storageDir = path.join(process.cwd(), 'uploads', 'example-files')
    this.ensureStorageDir()
  }

  private ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true })
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    options: {
      tenantId: string
      schemaId: string
      fileName: string
      contentType?: string
      md5Hash?: string
    },
  ): Promise<LocalFileStorageResult> {
    const { tenantId, schemaId, fileName, contentType = "application/octet-stream", md5Hash } = options

    // Generate MD5 hash if not provided
    const fileMd5Hash = md5Hash || crypto.createHash("md5").update(fileBuffer).digest("hex")

    // Create structured directory path
    const timestamp = new Date().toISOString().split("T")[0]
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const relativePath = `${tenantId}/${timestamp}/${schemaId}/${fileName}-${fileMd5Hash.substring(0, 8)}-${randomSuffix}`
    const fullPath = path.join(this.storageDir, relativePath)

    // Ensure directory exists
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Write file
    fs.writeFileSync(fullPath, fileBuffer)

    // Generate URL (for development, this would be a local file URL)
    const url = `/api/files/${relativePath}`
    const publicUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}${url}`

    console.log(`[LocalFileStorage] Successfully stored file: ${fullPath}`)

    return {
      key: relativePath,
      url: publicUrl,
      publicUrl,
      bucket: 'local-storage',
      md5: fileMd5Hash,
      size: fileBuffer.length,
      metadata: {
        size: fileBuffer.length,
        contentType,
        md5: fileMd5Hash,
      },
    }
  }

  async getFile(key: string): Promise<Buffer | null> {
    const fullPath = path.join(this.storageDir, key)
    
    if (!fs.existsSync(fullPath)) {
      return null
    }

    return fs.readFileSync(fullPath)
  }

  async deleteFile(key: string): Promise<boolean> {
    const fullPath = path.join(this.storageDir, key)
    
    if (!fs.existsSync(fullPath)) {
      return false
    }

    fs.unlinkSync(fullPath)
    return true
  }
}
