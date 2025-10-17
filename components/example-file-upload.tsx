"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { FileText, Upload, CheckCircle, AlertCircle, X, Download } from "lucide-react"
import { FileParser } from "@/lib/file-parser"
import { toast } from "sonner"

interface ExampleFileUploadProps {
  schemaId: string
  schemaFieldNames: string[]
  onUploadComplete?: (fileId: string) => void
}

interface ParsedFileData {
  fieldNames: string[]
  totalRows: number
  suggestions: Record<string, string | null>
}

export function ExampleFileUpload({ schemaId, schemaFieldNames, onUploadComplete }: ExampleFileUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [parsedData, setParsedData] = useState<ParsedFileData | null>(null)
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setError(null)
    setSelectedFile(file)
    setIsUploading(true)
    setUploadProgress(0)

    try {
      // Validate file
      const fileParser = new FileParser()
      const validation = fileParser.validateFile(file)
      if (!validation.valid) {
        setError(validation.error || "Invalid file")
        return
      }

      // Parse file
      setUploadProgress(25)
      const parseResult = await fileParser.parseFile(file)
      
      if (!parseResult.success) {
        setError(parseResult.error || "Failed to parse file")
        return
      }

      setUploadProgress(50)

      // Get field mapping suggestions
      const suggestions = fileParser.getFieldMappingSuggestions(
        parseResult.fieldNames,
        schemaFieldNames
      )

      setParsedData({
        fieldNames: parseResult.fieldNames,
        totalRows: parseResult.totalRows,
        suggestions
      })

      // Pre-populate mappings with suggestions
      const mappings: Record<string, string> = {}
      parseResult.fieldNames.forEach(fieldName => {
        const suggestion = suggestions[fieldName]
        if (suggestion) {
          mappings[fieldName] = suggestion
        }
      })
      setFieldMappings(mappings)

      setUploadProgress(100)
      setIsUploading(false)

    } catch (error) {
      console.error("Parse error:", error)
      setError(error instanceof Error ? error.message : "Failed to parse file")
      toast.error("Failed to parse file")
      setIsUploading(false)
    }
  }, [schemaFieldNames])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false,
    disabled: isUploading
  })

  const handleFieldMappingChange = (exampleField: string, schemaField: string) => {
    setFieldMappings(prev => ({
      ...prev,
      [exampleField]: schemaField
    }))
  }

  const resetUpload = () => {
    setSelectedFile(null)
    setParsedData(null)
    setFieldMappings({})
    setError(null)
    setUploadProgress(0)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Upload Example File
          </CardTitle>
          <CardDescription>
            Upload a file with example data to guide AI generation. Supported formats: CSV, JSON, Excel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!parsedData ? (
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
                ${isUploading ? "opacity-50 cursor-not-allowed" : "hover:border-primary hover:bg-primary/5"}
              `}
            >
              <input {...getInputProps()} />
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                {isDragActive ? "Drop the file here" : "Drag & drop a file here, or click to select"}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                CSV, JSON, or Excel files up to 10MB
              </p>
              <Button variant="outline" disabled={isUploading}>
                Choose File
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="font-medium">File parsed successfully</span>
                </div>
                <Button variant="ghost" size="sm" onClick={resetUpload}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Fields found:</span> {parsedData.fieldNames.length}
                </div>
                <div>
                  <span className="font-medium">Rows:</span> {parsedData.totalRows}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium">Field Mapping</Label>
                <p className="text-sm text-muted-foreground">
                  Map the fields from your file to the schema fields
                </p>
                
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {parsedData.fieldNames.map(fieldName => (
                    <div key={fieldName} className="flex items-center gap-3">
                      <div className="flex-1 text-sm font-medium">{fieldName}</div>
                      <div className="flex-1">
                        <Select
                          value={fieldMappings[fieldName] || "none"}
                          onValueChange={(value) => handleFieldMappingChange(fieldName, value === "none" ? "" : value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select schema field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Skip this field</SelectItem>
                            {schemaFieldNames.map(schemaField => (
                              <SelectItem key={schemaField} value={schemaField}>
                                {schemaField}
                                {parsedData.suggestions[fieldName] === schemaField && (
                                  <Badge variant="secondary" className="ml-2 text-xs">
                                    Suggested
                                  </Badge>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button 
                onClick={async () => {
                  if (!selectedFile) {
                    setError("No file selected")
                    return
                  }

                  setIsUploading(true)
                  setUploadProgress(0)
                  
                  try {
                    setUploadProgress(25)

                    // Upload file with mappings
                    const formData = new FormData()
                    formData.append("file", selectedFile)
                    formData.append("fieldMappings", JSON.stringify(fieldMappings))

                    setUploadProgress(50)

                    const response = await fetch(`/api/schemas/${schemaId}/examples/upload`, {
                      method: "POST",
                      body: formData,
                    })

                    if (!response.ok) {
                        const errorData = await response.json()
                        throw new Error(errorData.error || "Upload failed")
                    }

                    setUploadProgress(100)
                    toast.success("Example file uploaded successfully!")
                    
                    if (onUploadComplete) {
                        const result = await response.json()
                        onUploadComplete(result.fileId)
                    }

                    // Reset the form
                    setSelectedFile(null)
                    setParsedData(null)
                    setFieldMappings({})
                    setError(null)

                  } catch (error) {
                    console.error("Upload error:", error)
                    setError(error instanceof Error ? error.message : "Upload failed")
                    toast.error("Failed to upload example file")
                  } finally {
                    setIsUploading(false)
                  }
                }}
                disabled={isUploading || !selectedFile}
                className="w-full"
              >
                {isUploading ? "Uploading..." : "Upload with Mappings"}
              </Button>
            </div>
          )}

          {isUploading && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
