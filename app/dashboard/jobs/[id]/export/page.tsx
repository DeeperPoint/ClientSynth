"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Download, FileText, Database, Table, Code } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

interface Job {
  id: string
  name: string
  status: string
  total_records: number
  generated_records: number
  schemas: {
    id: string
    name: string
    schema_definition: any
  }
}

interface ExportRecord {
  id: string
  name: string
  format: string
  status: string
  file_url?: string
  file_size?: number
  record_count?: number
  created_at: string
  error_message?: string
}

const EXPORT_FORMATS = [
  { value: "csv", label: "CSV", description: "Comma-separated values", icon: Table },
  { value: "json", label: "JSON", description: "JavaScript Object Notation", icon: Code },
  { value: "xlsx", label: "Excel", description: "Microsoft Excel format", icon: FileText },
  { value: "sql", label: "SQL", description: "SQL INSERT statements", icon: Database },
]

export default function ExportPage() {
  const [job, setJob] = useState<Job | null>(null)
  const [exports, setExports] = useState<ExportRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)

  // Export form state
  const [exportName, setExportName] = useState("")
  const [format, setFormat] = useState("csv")
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [recordLimit, setRecordLimit] = useState("")

  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadJobAndExports()
  }, [params.id])

  const loadJobAndExports = async () => {
    try {
      // Load job details
      const { data: jobData, error: jobError } = await supabase
        .from("jobs")
        .select(`
          id,
          name,
          status,
          total_records,
          generated_records,
          schemas(id, name, schema_definition)
        `)
        .eq("id", params.id)
        .single()

      if (jobError) throw jobError
      setJob(jobData)
      setExportName(`${jobData.name} Export`)

      // Initialize selected fields with all fields
      const fields = jobData.schemas?.schema_definition?.fields || []
      setSelectedFields(fields.map((f: any) => f.name))

      // Load existing exports
      const { data: exportsData, error: exportsError } = await supabase
        .from("exports")
        .select("*")
        .eq("job_id", params.id)
        .order("created_at", { ascending: false })

      if (exportsError) throw exportsError
      setExports(exportsData || [])
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const createExport = async () => {
    if (!job || !exportName.trim() || !format) return

    setIsExporting(true)
    try {
      const filters: any = {}

      if (selectedFields.length > 0) {
        filters.fields = selectedFields
      }

      if (recordLimit && Number.parseInt(recordLimit) > 0) {
        filters.limit = Number.parseInt(recordLimit)
      }

      const response = await fetch("/api/exports/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.id,
          name: exportName.trim(),
          format,
          filters,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to create export")
      }

      // Reload exports
      await loadJobAndExports()

      // Reset form
      setExportName(`${job.name} Export`)
      setFormat("csv")
      setRecordLimit("")
    } catch (error) {
      console.error("Error creating export:", error)
      alert("Failed to create export. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  const downloadExport = (exportRecord: ExportRecord) => {
    if (!exportRecord.file_url) return

    const link = document.createElement("a")
    link.href = exportRecord.file_url
    link.download = `${exportRecord.name}.${exportRecord.format}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const toggleField = (fieldName: string) => {
    setSelectedFields((prev) => (prev.includes(fieldName) ? prev.filter((f) => f !== fieldName) : [...prev, fieldName]))
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown"
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i]
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-96 bg-gray-200 rounded-lg"></div>
            <div className="h-96 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Job Not Found</h1>
        <p className="text-gray-600">The job you're looking for doesn't exist.</p>
      </div>
    )
  }

  if (job.status !== "completed") {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Export Not Available</h1>
        <p className="text-gray-600 mb-6">This job must be completed before you can export the data.</p>
        <Button asChild>
          <Link href={`/dashboard/jobs/${job.id}`}>View Job Details</Link>
        </Button>
      </div>
    )
  }

  const fields = job.schemas?.schema_definition?.fields || []

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/jobs/${job.id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Job
            </Link>
          </Button>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Export Data: {job.name}</h1>
        <p className="text-gray-600">{job.generated_records.toLocaleString()} records available for export</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Create New Export</CardTitle>
            <CardDescription>Configure your data export settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-2">
              <Label htmlFor="export-name">Export Name</Label>
              <Input
                id="export-name"
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
                placeholder="Enter export name"
              />
            </div>

            <div className="grid gap-2">
              <Label>Export Format</Label>
              <div className="grid grid-cols-2 gap-2">
                {EXPORT_FORMATS.map((fmt) => {
                  const Icon = fmt.icon
                  return (
                    <div
                      key={fmt.value}
                      className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                        format === fmt.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                      }`}
                      onClick={() => setFormat(fmt.value)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4" />
                        <span className="font-medium text-sm">{fmt.label}</span>
                      </div>
                      <p className="text-xs text-gray-500">{fmt.description}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>
                Fields to Export ({selectedFields.length} of {fields.length})
              </Label>
              <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-2">
                {fields.map((field: any) => (
                  <div key={field.name} className="flex items-center space-x-2">
                    <Checkbox
                      id={field.name}
                      checked={selectedFields.includes(field.name)}
                      onCheckedChange={() => toggleField(field.name)}
                    />
                    <Label htmlFor={field.name} className="text-sm font-normal cursor-pointer">
                      {field.name}
                      <span className="text-xs text-gray-500 ml-2">({field.type})</span>
                    </Label>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedFields(fields.map((f: any) => f.name))}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedFields([])}>
                  Select None
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="record-limit">Record Limit (optional)</Label>
              <Input
                id="record-limit"
                type="number"
                min="1"
                max={job.generated_records}
                value={recordLimit}
                onChange={(e) => setRecordLimit(e.target.value)}
                placeholder={`Max ${job.generated_records.toLocaleString()}`}
              />
              <p className="text-xs text-gray-500">Leave empty to export all records</p>
            </div>

            <Button
              onClick={createExport}
              disabled={isExporting || !exportName.trim() || selectedFields.length === 0}
              className="w-full"
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Creating Export..." : "Create Export"}
            </Button>
          </CardContent>
        </Card>

        {/* Export History */}
        <Card>
          <CardHeader>
            <CardTitle>Export History</CardTitle>
            <CardDescription>Previous exports for this job ({exports.length})</CardDescription>
          </CardHeader>
          <CardContent>
            {exports.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Download className="mx-auto h-8 w-8 mb-2" />
                <p>No exports created yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {exports.map((exportRecord) => (
                  <div key={exportRecord.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-medium text-sm">{exportRecord.name}</h4>
                        <p className="text-xs text-gray-500">
                          {new Date(exportRecord.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge
                        variant={
                          exportRecord.status === "completed"
                            ? "default"
                            : exportRecord.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {exportRecord.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                      <div>Format: {exportRecord.format.toUpperCase()}</div>
                      <div>Records: {exportRecord.record_count?.toLocaleString() || "Unknown"}</div>
                      <div>Size: {formatFileSize(exportRecord.file_size)}</div>
                    </div>

                    {exportRecord.error_message && (
                      <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
                        <p className="text-xs text-red-800">{exportRecord.error_message}</p>
                      </div>
                    )}

                    {exportRecord.status === "completed" && exportRecord.file_url && (
                      <Button size="sm" onClick={() => downloadExport(exportRecord)} className="w-full">
                        <Download className="mr-2 h-3 w-3" />
                        Download
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
