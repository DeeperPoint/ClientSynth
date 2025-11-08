"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FileText, Upload, Download, Trash2, AlertCircle, CheckCircle } from "lucide-react"
import { ExampleFileUpload } from "@/components/example-file-upload"
import { toast } from "sonner"

interface ExampleFile {
  id: string
  file_name: string
  file_type: string
  file_size: number
  created_at: string
  uploaded_by_name: string
}

interface ExampleData {
  field_name: string
  unique_values: number
  total_examples: number
}

interface ExampleFilesManagerProps {
  schemaId: string
  schemaFieldNames: string[]
}

export function ExampleFilesManager({ schemaId, schemaFieldNames }: ExampleFilesManagerProps) {
  const [files, setFiles] = useState<ExampleFile[]>([])
  const [examples, setExamples] = useState<ExampleData[]>([])
  const [examplesPerFile, setExamplesPerFile] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  useEffect(() => {
    loadExampleFiles()
  }, [schemaId])

  const loadExampleFiles = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/schemas/${schemaId}/examples/upload`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to load example files")
      }

      const data = await response.json()
      setFiles(data.files || [])
      setExamples(data.examples || [])
      const perFile: Record<string, number> = {}
      ;(data.examplesPerFile || []).forEach((row: { example_file_id: string; total_examples: number }) => {
        perFile[row.example_file_id] = Number(row.total_examples) || 0
      })
      setExamplesPerFile(perFile)
    } catch (error) {
      console.error("Error loading example files:", error)
      setError(error instanceof Error ? error.message : "Failed to load example files")
    } finally {
      setIsLoading(false)
    }
  }

  const handleUploadComplete = (fileId: string) => {
    toast.success("Example file uploaded successfully!")
    setShowUpload(false)
    loadExampleFiles() // Refresh the list
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType) {
      case "csv":
        return "📊"
      case "json":
        return "📋"
      case "xlsx":
      case "xls":
        return "📈"
      default:
        return "📄"
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="space-y-2">
              <div className="h-3 bg-muted rounded"></div>
              <div className="h-3 bg-muted rounded w-3/4"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Example Files
              </CardTitle>
              <CardDescription>
                Uploaded example data for this schema
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {files.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No example files uploaded</p>
              <p className="text-sm">Upload example data to guide AI generation</p>
            </div>
          ) : (
            <div className="space-y-4">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getFileTypeIcon(file.file_type)}</span>
                    <div>
                      <div className="font-medium">{file.file_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatFileSize(file.file_size)} • {file.file_type.toUpperCase()} • 
                        Uploaded by {file.uploaded_by_name} • {new Date(file.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {examplesPerFile[file.id] ?? 0} examples
                    </Badge>
                    <Button variant="ghost" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {examples.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <h4 className="font-medium mb-3">Example Data Summary</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {examples.map((example) => (
                  <div key={example.field_name} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <div className="font-medium text-sm">{example.field_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {example.unique_values} unique values
                      </div>
                    </div>
                    <Badge variant="outline">
                      {example.total_examples} total
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
