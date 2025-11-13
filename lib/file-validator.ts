/**
 * File Validator
 * Server-side file validation with magic number checking and virus patterns
 */

export interface FileValidationResult {
  valid: boolean
  error?: string
  detectedType?: string
  mimeType?: string
  isSafe?: boolean
}

export class FileValidator {
  // Magic numbers (file signatures) for common file types
  private static readonly MAGIC_NUMBERS: Record<string, number[][]> = {
    pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
    docx: [[0x50, 0x4B, 0x03, 0x04]], // ZIP signature (DOCX is a ZIP)
    doc: [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]], // Microsoft Office legacy
    xlsx: [[0x50, 0x4B, 0x03, 0x04]], // ZIP signature (XLSX is a ZIP)
    xls: [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]], // Microsoft Office legacy
    png: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]], // PNG
    jpg: [[0xFF, 0xD8, 0xFF]], // JPEG
    jpeg: [[0xFF, 0xD8, 0xFF]], // JPEG
    gif: [[0x47, 0x49, 0x46, 0x38]], // GIF
  }

  // Suspicious file patterns (virus-like extensions)
  private static readonly DANGEROUS_EXTENSIONS = [
    'exe', 'bat', 'cmd', 'scr', 'pif', 'com', 'vbs', 'js', 'jar',
    'msi', 'dll', 'sh', 'ps1', 'app', 'deb', 'rpm', 'dmg'
  ]

  // Suspicious magic numbers (executable files)
  private static readonly DANGEROUS_MAGIC_NUMBERS = [
    [0x4D, 0x5A], // PE executable (MZ)
    [0x7F, 0x45, 0x4C, 0x46], // ELF executable
    [0xCA, 0xFE, 0xBA, 0xBE], // Java class file
    [0xFE, 0xED, 0xFA, 0xCE], // Mach-O executable
  ]

  /**
   * Validate file using magic numbers and security checks
   */
  static async validateFile(file: File | Buffer, fileName?: string, mimeType?: string): Promise<FileValidationResult> {
    try {
      // Get file buffer
      let buffer: Buffer
      // Check if File class exists and file is an instance of it (browser/Node 18+)
      const isFile = typeof File !== 'undefined' && file instanceof File
      if (isFile) {
        buffer = Buffer.from(await (file as File).arrayBuffer())
        fileName = fileName || (file as File).name
        mimeType = mimeType || (file as File).type
      } else {
        buffer = file as Buffer
      }

      // Check file size
      const maxSize = 50 * 1024 * 1024 // 50MB
      if (buffer.length > maxSize) {
        return {
          valid: false,
          error: `File size (${(buffer.length / 1024 / 1024).toFixed(2)}MB) exceeds 50MB limit`,
          isSafe: false
        }
      }

      if (buffer.length === 0) {
        return {
          valid: false,
          error: 'File is empty',
          isSafe: false
        }
      }

      // Get file extension
      const extension = fileName?.split('.').pop()?.toLowerCase() || ''
      
      // Check for dangerous extensions
      if (this.DANGEROUS_EXTENSIONS.includes(extension)) {
        return {
          valid: false,
          error: `Dangerous file type: .${extension} is not allowed`,
          isSafe: false
        }
      }

      // Check magic numbers for dangerous files
      const header = buffer.slice(0, 16)
      for (const dangerousMagic of this.DANGEROUS_MAGIC_NUMBERS) {
        if (this.matchesMagicNumber(header, dangerousMagic)) {
          return {
            valid: false,
            error: 'File appears to be an executable and is not allowed',
            isSafe: false
          }
        }
      }

      // Detect file type from magic number
      let detectedType: string | undefined
      for (const [type, magicNumbers] of Object.entries(this.MAGIC_NUMBERS)) {
        for (const magic of magicNumbers) {
          if (this.matchesMagicNumber(header, magic)) {
            detectedType = type
            break
          }
        }
        if (detectedType) break
      }

      // Validate extension matches detected type
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
        'application/xml',
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/jpg'
      ]

      // If we have extension but no magic number match, allow text-based files
      if (!detectedType && extension) {
        if (allowedExtensions.includes(extension)) {
          // For text files, verify it's actually text
          if (['txt', 'csv', 'json', 'xml'].includes(extension)) {
            const textSample = buffer.slice(0, 1000).toString('utf-8', 0, 1000)
            if (!this.isValidText(textSample)) {
              return {
                valid: false,
                error: `File extension .${extension} doesn't match file content`,
                isSafe: false
              }
            }
            detectedType = extension
          }
        }
      }

      // Extension validation
      if (extension && !allowedExtensions.includes(extension)) {
        return {
          valid: false,
          error: `File type .${extension} is not supported`,
          isSafe: false
        }
      }

      // MIME type validation (if provided)
      if (mimeType && !allowedMimeTypes.includes(mimeType)) {
        // Allow empty or generic mime types for some file types
        const genericMimeTypes = ['application/octet-stream', '']
        if (!genericMimeTypes.includes(mimeType)) {
          return {
            valid: false,
            error: `MIME type ${mimeType} is not supported`,
            isSafe: false
          }
        }
      }

      // Type mismatch check
      if (detectedType && extension && detectedType !== extension) {
        // Some types share magic numbers (e.g., docx and xlsx both use ZIP signature)
        const compatibleTypes: Record<string, string[]> = {
          'docx': ['docx', 'xlsx'],
          'xlsx': ['docx', 'xlsx'],
        }
        
        if (!compatibleTypes[detectedType]?.includes(extension)) {
          return {
            valid: false,
            error: `File content (${detectedType}) doesn't match extension (.${extension})`,
            isSafe: false
          }
        }
      }

      return {
        valid: true,
        detectedType: detectedType || extension,
        mimeType,
        isSafe: true
      }

    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'File validation failed',
        isSafe: false
      }
    }
  }

  /**
   * Check if buffer matches magic number pattern
   */
  private static matchesMagicNumber(buffer: Buffer, magic: number[]): boolean {
    if (buffer.length < magic.length) return false
    for (let i = 0; i < magic.length; i++) {
      if (buffer[i] !== magic[i]) return false
    }
    return true
  }

  /**
   * Check if text is valid UTF-8 text
   */
  private static isValidText(text: string): boolean {
    // Check for null bytes or control characters that suggest binary data
    if (text.includes('\0')) return false
    
    // Check percentage of printable characters
    const printableCount = text.split('').filter(c => {
      const code = c.charCodeAt(0)
      return (code >= 32 && code <= 126) || (code >= 160) || ['\n', '\r', '\t'].includes(c)
    }).length
    
    const printableRatio = printableCount / text.length
    return printableRatio > 0.8 // At least 80% printable characters
  }

  /**
   * Get file category based on type
   */
  static categorizeFileType(fileType: string): {
    category: 'document' | 'spreadsheet' | 'data' | 'image' | 'text' | 'other'
    icon: string
  } {
    switch (fileType.toLowerCase()) {
      case 'pdf':
      case 'docx':
      case 'doc':
        return { category: 'document', icon: '📄' }
      case 'xlsx':
      case 'xls':
      case 'csv':
        return { category: 'spreadsheet', icon: '📊' }
      case 'json':
      case 'xml':
        return { category: 'data', icon: '📋' }
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return { category: 'image', icon: '🖼️' }
      case 'txt':
        return { category: 'text', icon: '📝' }
      default:
        return { category: 'other', icon: '📎' }
    }
  }
}






