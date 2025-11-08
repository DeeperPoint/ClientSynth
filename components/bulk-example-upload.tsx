'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Upload, 
  FileText, 
  Check, 
  X, 
  AlertCircle, 
  RefreshCw, 
  Trash2,
  Download,
  Eye,
  FileImage,
  FileSpreadsheet,
  FileCode,
  File
} from 'lucide-react'
import { UniversalFileParser, type ParsedFileData } from '@/lib/universal-file-parser'

interface BulkUploadFile {
  id: string
  file: File
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  error?: string
  parsedData?: ParsedFileData
  uploadResult?: any
}

interface BulkExampleUploadProps {
  schemaId: string
  schemaFields: Array<{ name: string; type: string; description?: string }>
  onUploadComplete?: () => void
  onFieldsAdded?: (newFields: Array<{ name: string; type: string; description: string }>) => void
}

export function ExampleFileUpload({ 
  schemaId, 
  schemaFields, 
  onUploadComplete,
  onFieldsAdded 
}: BulkExampleUploadProps) {
  const [files, setFiles] = useState<BulkUploadFile[]>([])
  const [isDragActive, setIsDragActive] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [uploadResults, setUploadResults] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const parser = new UniversalFileParser()

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase()
    switch (extension) {
      case 'pdf':
        return <FileText data-testid="file-icon-pdf" className="h-5 w-5 text-red-500" />
      case 'docx':
      case 'doc':
        return <FileText data-testid="file-icon-docx" className="h-5 w-5 text-blue-500" />
      case 'xlsx':
      case 'xls':
        return <FileSpreadsheet className="h-5 w-5 text-green-500" />
      case 'csv':
        return <FileSpreadsheet className="h-5 w-5 text-green-600" />
      case 'json':
        return <FileCode className="h-5 w-5 text-yellow-500" />
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return <FileImage data-testid="file-icon-image" className="h-5 w-5 text-purple-500" />
      default:
        return <File className="h-5 w-5 text-gray-500" />
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // File size check (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      return { valid: false, error: 'File size exceeds 50MB limit' }
    }

    // File type check
    const allowedTypes = [
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

    const allowedExtensions = ['pdf', 'docx', 'doc', 'txt', 'csv', 'json', 'xlsx', 'xls', 'xml', 'png', 'jpg', 'jpeg', 'gif']
    const fileExtension = file.name.split('.').pop()?.toLowerCase()

    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      return { valid: false, error: `File type .${fileExtension} not supported` }
    }

    return { valid: true }
  }

  const handleFilesSelected = useCallback(async (selectedFiles: FileList | File[]) => {
    setError(null)
    const fileArray = Array.from(selectedFiles)
    
    // Validate files
    const validationErrors: string[] = []
    const validFiles: File[] = []
    
    for (const file of fileArray) {
      const validation = validateFile(file)
      if (validation.valid) {
        validFiles.push(file)
      } else {
        validationErrors.push(`${file.name}: ${validation.error}`)
      }
    }

    if (validationErrors.length > 0) {
      setError(`Some files were rejected:\n${validationErrors.join('\n')}`)
    }

    if (validFiles.length === 0) return

    // Check total file count limit
    if (files.length + validFiles.length > 50) {
      setError('Maximum 50 files allowed per batch')
      return
    }

    // Add files to state
    const newFiles: BulkUploadFile[] = validFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'pending',
      progress: 0
    }))

    setFiles(prev => [...prev, ...newFiles])
  }, [files.length])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragActive(false)
    
    const droppedFiles = e.dataTransfer.files
    if (droppedFiles.length > 0) {
      handleFilesSelected(droppedFiles)
    }
  }, [handleFilesSelected])

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const retryFile = async (fileId: string) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status: 'pending', progress: 0, error: undefined }
        : f
    ))
  }

  const handleBulkUpload = async () => {
    if (files.length === 0) return

    setIsUploading(true)
    setError(null)
    setUploadProgress(0)

    try {
      // Prepare form data
      const formData = new FormData()
      files.forEach(fileObj => {
        formData.append('files', fileObj.file)
      })
      formData.append('fieldMappings', JSON.stringify({}))

      // Update file statuses to processing
      setFiles(prev => prev.map(f => ({ ...f, status: 'processing', progress: 10 })))

      const response = await fetch(`/api/schemas/${schemaId}/examples/bulk-upload`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Bulk upload failed')
      }

      const result = await response.json()
      setUploadResults(result)

      // Update file statuses based on results
      setFiles(prev => prev.map(fileObj => {
        const result = result.results.find((r: any) => r.fileName === fileObj.file.name)
        if (result) {
          return {
            ...fileObj,
            status: result.status === 'success' ? 'completed' : 'failed',
            progress: result.status === 'success' ? 100 : 0,
            error: result.error
          }
        }
        return fileObj
      }))

      setUploadProgress(100)

      if (onUploadComplete) {
        onUploadComplete()
      }

    } catch (err) {
      console.error('Bulk upload error:', err)
      setError(err instanceof Error ? err.message : 'Bulk upload failed')
      
      // Mark all files as failed
      setFiles(prev => prev.map(f => ({ 
        ...f, 
        status: 'failed', 
        progress: 0, 
        error: err instanceof Error ? err.message : 'Upload failed' 
      })))
    } finally {
      setIsUploading(false)
    }
  }

  const clearAll = () => {
    setFiles([])
    setUploadResults(null)
    setError(null)
    setUploadProgress(0)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <Check className="h-4 w-4 text-green-500" />
      case 'failed':
        return <X className="h-4 w-4 text-red-500" />
      case 'processing':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
      default:
        return <FileText className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200'
      case 'failed':
        return 'bg-red-50 border-red-200'
      case 'processing':
        return 'bg-blue-50 border-blue-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  return (
    <Card data-testid="bulk-upload-component">
      <CardHeader>
        <CardTitle>Upload Example Files</CardTitle>
        <CardDescription>
          Upload files (PDF, DOCX, TXT, CSV, JSON, Excel, XML, Images) to provide examples for AI generation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Area */}
        {files.length === 0 && (
          <div
            data-testid="drag-drop-area"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300'
            }`}
          >
            <Upload className="mx-auto h-16 w-16 text-gray-400" />
            <div className="mt-4">
              <label htmlFor="bulk-file-upload" className="cursor-pointer">
                <span className="text-primary hover:underline text-lg font-medium">Choose files</span>
                <input
                  ref={fileInputRef}
                  id="bulk-file-upload"
                  data-testid="file-input"
                  type="file"
                  className="hidden"
                  accept="*/*"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFilesSelected(e.target.files)
                    }
                  }}
                />
              </label>
              <span className="text-gray-600 ml-2"> or drag and drop</span>
            </div>
            <p data-testid="upload-instructions" className="mt-2 text-sm text-gray-500">
              Single or multiple files, 50MB each • PDF, DOCX, TXT, CSV, JSON, Excel, XML, Images
            </p>
          </div>
        )}

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Files ({files.length})
              </h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  Add More Files
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  disabled={isUploading}
                >
                  Clear All
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[400px] pr-4">
              <div data-testid="file-list" className="space-y-3">
                {files.map((fileObj) => (
                  <div
                    key={fileObj.id}
                    data-testid={`file-item${fileObj.status === 'failed' ? '-failed' : ''}`}
                    className={`border rounded-lg p-4 transition-colors ${getStatusColor(fileObj.status)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        {getFileIcon(fileObj.file.name)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{fileObj.file.name}</p>
                            <span data-testid="file-status">{getStatusIcon(fileObj.status)}</span>
                            <Badge variant="outline" className="text-xs">
                              {formatFileSize(fileObj.file.size)}
                            </Badge>
                          </div>
                          
                          {fileObj.status === 'processing' && (
                            <div className="mt-2">
                              <Progress data-testid="upload-progress" value={fileObj.progress} className="h-2" />
                              <p className="text-xs text-gray-600 mt-1">
                                Processing... {fileObj.progress}%
                              </p>
                            </div>
                          )}

                          {fileObj.status === 'completed' && fileObj.parsedData && (
                            <div className="mt-2">
                              <p className="text-sm text-green-600">
                                ✅ {fileObj.parsedData.fields.length} fields extracted • {fileObj.parsedData.metadata.recordCount} records
                              </p>
                            </div>
                          )}

                          {fileObj.status === 'failed' && fileObj.error && (
                            <div className="mt-2">
                              <p className="text-sm text-red-600">
                                ❌ {fileObj.error}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        {fileObj.status === 'failed' && (
                          <Button
                            data-testid="retry-button"
                            variant="outline"
                            size="sm"
                            onClick={() => retryFile(fileObj.id)}
                            disabled={isUploading}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {fileObj.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeFile(fileObj.id)}
                            disabled={isUploading}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Uploading files...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {/* Upload Results Summary */}
            {uploadResults && (
              <Alert data-testid="upload-results">
                <Check className="h-4 w-4" />
                <AlertDescription>
                  <strong>Upload Complete!</strong> {uploadResults.completedFiles} files uploaded successfully, {uploadResults.failedFiles} failed.
                  {uploadResults.failedFiles > 0 && ' Check individual file status for details.'}
                </AlertDescription>
              </Alert>
            )}

            {/* Error Message */}
            {error && (
              <Alert variant="destructive" data-testid="error-message">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                data-testid="upload-button"
                onClick={handleBulkUpload}
                disabled={isUploading || files.length === 0}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload All Files ({files.length})
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
