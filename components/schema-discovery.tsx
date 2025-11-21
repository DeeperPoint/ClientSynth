"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  X,
  Save
} from "lucide-react"
import { useRouter } from "next/navigation"

interface DiscoveredField {
  id: string
  name: string
  type: string
  description: string
  required: boolean
  constraints?: {
    min?: number
    max?: number
    options?: string[]
    format?: string
  }
}

interface DiscoveredSchema {
  fields: DiscoveredField[]
  metadata: {
    version: string
    discovered_at: string
    confidence: number
    sourceFile: string
  }
}

export function SchemaDiscovery() {
  const [file, setFile] = useState<File | null>(null)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveredSchema, setDiscoveredSchema] = useState<DiscoveredSchema | null>(null)
  const [schemaName, setSchemaName] = useState("")
  const [schemaDescription, setSchemaDescription] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [useLLM, setUseLLM] = useState(true)
  const router = useRouter()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setDiscoveredSchema(null)
      setError(null)
      setWarnings([])
      
      // Auto-generate schema name from filename
      const baseName = selectedFile.name.replace(/\.[^/.]+$/, "")
      setSchemaName(baseName || "Discovered Schema")
    }
  }

  const handleDiscover = async () => {
    if (!file) {
      setError("Please select a file first")
      return
    }

    setIsDiscovering(true)
    setError(null)
    setWarnings([])

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("useLLM", useLLM.toString())

      const response = await fetch("/api/schemas/discover", {
        method: "POST",
        body: formData
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Schema discovery failed")
      }

      setDiscoveredSchema(data.schema)
      setWarnings(data.warnings || [])
      
      // Auto-fill description if empty
      if (!schemaDescription && data.schema) {
        setSchemaDescription(
          `Schema automatically discovered from ${data.schema.metadata.sourceFile}. ` +
          `Confidence: ${(data.schema.metadata.confidence * 100).toFixed(1)}%`
        )
      }

    } catch (err) {
      console.error("Discovery error:", err)
      setError(err instanceof Error ? err.message : "Failed to discover schema")
    } finally {
      setIsDiscovering(false)
    }
  }

  const handleCreateSchema = async () => {
    if (!discoveredSchema || !schemaName.trim()) {
      setError("Please provide a schema name")
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch("/api/schemas/discover/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: schemaName.trim(),
          description: schemaDescription.trim() || null,
          discoveredSchema,
          saveExampleData: false
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create schema")
      }

      // Redirect to schema detail page
      router.push(`/dashboard/schemas/${data.schema.id}`)

    } catch (err) {
      console.error("Create error:", err)
      setError(err instanceof Error ? err.message : "Failed to create schema")
    } finally {
      setIsCreating(false)
    }
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      email: "bg-blue-100 text-blue-800",
      phone: "bg-green-100 text-green-800",
      name: "bg-purple-100 text-purple-800",
      address: "bg-orange-100 text-orange-800",
      company: "bg-pink-100 text-pink-800",
      job_title: "bg-indigo-100 text-indigo-800",
      date: "bg-yellow-100 text-yellow-800",
      number: "bg-cyan-100 text-cyan-800",
      boolean: "bg-gray-100 text-gray-800",
      text: "bg-slate-100 text-slate-800"
    }
    return colors[type] || "bg-gray-100 text-gray-800"
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Automatic Schema Discovery</h1>
        <p className="text-muted-foreground">
          Upload a data file and automatically discover its schema structure.
        </p>
      </div>

      {/* File Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Data File</CardTitle>
          <CardDescription>
            Upload CSV, JSON, Excel, PDF, DOCX, or other supported formats
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Select File</Label>
            <div className="flex items-center gap-4">
              <Input
                id="file"
                type="file"
                accept=".csv,.json,.xlsx,.xls,.pdf,.docx,.doc,.txt,.xml"
                onChange={handleFileChange}
                className="flex-1"
                disabled={isDiscovering}
              />
              {file && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{file.name}</span>
                  <span className="text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="useLLM"
              checked={useLLM}
              onChange={(e) => setUseLLM(e.target.checked)}
              className="rounded border-gray-300"
            />
            <Label htmlFor="useLLM" className="cursor-pointer">
              Use AI for field descriptions (recommended)
            </Label>
          </div>

          <Button
            onClick={handleDiscover}
            disabled={!file || isDiscovering}
            className="w-full sm:w-auto"
          >
            {isDiscovering ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Discovering Schema...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Discover Schema
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error/Warnings */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Discovered Schema Preview */}
      {discoveredSchema && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Discovered Schema
                <Badge variant="secondary" className="ml-auto">
                  {(discoveredSchema.metadata.confidence * 100).toFixed(1)}% confidence
                </Badge>
              </CardTitle>
              <CardDescription>
                Found {discoveredSchema.fields.length} field(s) in {discoveredSchema.metadata.sourceFile}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {discoveredSchema.fields.map((field) => (
                  <Card key={field.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{field.name}</h4>
                          <Badge className={getTypeColor(field.type)}>
                            {field.type}
                          </Badge>
                          {field.required && (
                            <Badge variant="outline">Required</Badge>
                          )}
                        </div>
                        {field.description && (
                          <p className="text-sm text-muted-foreground">
                            {field.description}
                          </p>
                        )}
                        {field.constraints && (
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {field.constraints.options && (
                              <span>
                                Options: {field.constraints.options.slice(0, 5).join(", ")}
                                {field.constraints.options.length > 5 && "..."}
                              </span>
                            )}
                            {field.constraints.min !== undefined && (
                              <span>Min: {field.constraints.min}</span>
                            )}
                            {field.constraints.max !== undefined && (
                              <span>Max: {field.constraints.max}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Schema Creation Form */}
          <Card>
            <CardHeader>
              <CardTitle>Create Schema</CardTitle>
              <CardDescription>
                Review the discovered schema and provide a name to create it
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="schemaName">Schema Name *</Label>
                <Input
                  id="schemaName"
                  value={schemaName}
                  onChange={(e) => setSchemaName(e.target.value)}
                  placeholder="My Schema"
                  disabled={isCreating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="schemaDescription">Description</Label>
                <Textarea
                  id="schemaDescription"
                  value={schemaDescription}
                  onChange={(e) => setSchemaDescription(e.target.value)}
                  placeholder="Optional description for this schema"
                  rows={3}
                  disabled={isCreating}
                />
              </div>

              <Button
                onClick={handleCreateSchema}
                disabled={!schemaName.trim() || isCreating}
                className="w-full sm:w-auto"
                size="lg"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Schema...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Create Schema
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

