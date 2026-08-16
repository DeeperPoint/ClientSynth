"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft,
  Download,
  FileText,
  Database,
  Table,
  Code,
  FileCode,
  BarChart,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Users,
  Share2,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"

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
  {
    value: "csv",
    label: "CSV",
    description: "Universal format, Excel compatible",
    icon: Table,
    maxRecords: 1000000,
    recommended: true,
  },
  {
    value: "json",
    label: "JSON",
    description: "Web-friendly, API ready",
    icon: Code,
    maxRecords: 100000,
    recommended: true,
  },
  {
    value: "xlsx",
    label: "Excel",
    description: "Native Excel format with formatting",
    icon: FileText,
    maxRecords: 500000,
    recommended: false,
  },
  {
    value: "sql",
    label: "SQL",
    description: "Database INSERT statements",
    icon: Database,
    maxRecords: 1000000,
    recommended: false,
  },
  {
    value: "xml",
    label: "XML",
    description: "Structured markup language",
    icon: FileCode,
    maxRecords: 100000,
    recommended: false,
  },
  {
    value: "parquet",
    label: "Parquet",
    description: "Analytics optimized columnar format",
    icon: BarChart,
    maxRecords: 10000000,
    recommended: false,
  },
  {
    value: "population",
    label: "Cosolvent Population",
    description: "Watermarked synthetic population file for Cosolvent ingest",
    icon: Users,
    maxRecords: 100000,
    recommended: false,
  },
  {
    value: "cosolvent",
    label: "Cosolvent Live Stream",
    description: "Register records directly with a running Cosolvent instance",
    icon: Share2,
    maxRecords: 100000,
    recommended: false,
  },
]

/** Formats that push to Cosolvent rather than producing a plain data file. */
const COSOLVENT_FORMATS = ["population", "cosolvent"]

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

  // Cosolvent population export (GAP-10/9)
  const [targetSchemaText, setTargetSchemaText] = useState("")
  const [populationMode, setPopulationMode] = useState<"demo" | "production">("demo")
  const [cosolventBaseUrl, setCosolventBaseUrl] = useState("")
  const [populationResult, setPopulationResult] = useState<{
    stats: Record<string, number>
    rejected: Array<{ recordIndex: number; externalId: string; reasons: string[] }>
  } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const params = useParams()
  // Use Postgres-backed API endpoints

  useEffect(() => {
    loadJobAndExports()
  }, [params.id])

  const loadJobAndExports = async () => {
    try {
      // Load job details (no joins)
      const jobRes = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'jobs',
          columns: 'id, name, status, total_records, generated_records, schema_id',
          where: { op: 'eq', column: 'id', value: params.id },
          single: true,
        })
      })
      const jobJson = await jobRes.json()
      if (!jobRes.ok || !jobJson.data) throw new Error(jobJson.error || 'Job not found')

      // Fetch schema separately
      const schemaRes = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'schemas',
          columns: 'id, name, schema_definition',
          where: { op: 'eq', column: 'id', value: jobJson.data.schema_id },
          single: true,
        })
      })
      const schemaJson = await schemaRes.json()
      const jobData = {
        ...jobJson.data,
        schemas: schemaJson.data || { id: 'unknown', name: 'Schema Not Available', schema_definition: { fields: [] }},
      }

      setJob(jobData)
      setExportName(`${jobData.name} Export`)

      // Initialize selected fields with all fields
      const fields = jobData.schemas?.schema_definition?.fields || []
      setSelectedFields(fields.map((f: any) => f.name))

      // Load existing exports
      const exportsRes = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'exports',
          columns: '*',
          where: { op: 'eq', column: 'job_id', value: params.id },
          orderBy: { column: 'created_at', ascending: false },
        })
      })
      const exportsJson = await exportsRes.json()
      setExports(exportsJson.data || [])
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const createExport = async () => {
    if (!job || !exportName.trim() || !format) return

    setIsExporting(true)
    setFormError(null)
    setPopulationResult(null)
    try {
      const filters: any = {}

      // Field selection narrows a data file, but a population record must match
      // the target profile schema — sending a subset would fail validation.
      if (selectedFields.length > 0 && !COSOLVENT_FORMATS.includes(format)) {
        filters.fields = selectedFields
      }

      if (recordLimit && Number.parseInt(recordLimit) > 0) {
        filters.limit = Number.parseInt(recordLimit)
      }

      if (format === "population") {
        filters.mode = populationMode
        if (targetSchemaText.trim()) {
          try {
            filters.targetSchema = JSON.parse(targetSchemaText)
          } catch {
            throw new Error(
              "The target schema is not valid JSON. Generate it with Cosolvent's " +
                "`python -m cli export-profile-schema <type>`.",
            )
          }
        }
      }

      if (format === "cosolvent" && cosolventBaseUrl.trim()) {
        filters.cosolventBaseUrl = cosolventBaseUrl.trim()
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

      // Surface how many records passed the population validity gate, and why
      // any were held back — otherwise a partial export looks like a success.
      if (result.populationStats) {
        setPopulationResult({ stats: result.populationStats, rejected: result.rejected || [] })
      }

      // Reload exports
      await loadJobAndExports()

      // Reset form
      setExportName(`${job.name} Export`)
      setFormat("csv")
      setRecordLimit("")
    } catch (error) {
      console.error("Error creating export:", error)
      setFormError(error instanceof Error ? error.message : "Failed to create export. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  const downloadExport = (exportRecord: ExportRecord) => {
    if (!exportRecord.file_url) return

    // The format name is not always the file extension — a population export is
    // a JSON file, so ".population" would download something unopenable.
    const extension = exportRecord.format === "population" ? "json" : exportRecord.format

    const link = document.createElement("a")
    link.href = exportRecord.file_url
    link.download = `${exportRecord.name}.${extension}`
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

  function estimateFileSize(): string {
    const recordCount = recordLimit ? Number(recordLimit) : job.generated_records
    const fieldCount = selectedFields.length

    let bytesPerRecord = 0

    switch (format) {
      case "csv":
        bytesPerRecord = fieldCount * 20 // Average 20 bytes per field
        break
      case "json":
        bytesPerRecord = fieldCount * 35 // JSON overhead
        break
      case "xlsx":
        bytesPerRecord = fieldCount * 25 // Excel compression
        break
      case "sql":
        bytesPerRecord = fieldCount * 40 // SQL syntax overhead
        break
      case "xml":
        bytesPerRecord = fieldCount * 50 // XML tag overhead
        break
      case "parquet":
        bytesPerRecord = fieldCount * 15 // Columnar compression
        break
      case "population":
        // Every field is exported (selection does not apply) plus the watermark
        // block, so estimate from the schema rather than the selected subset.
        bytesPerRecord = (job?.schemas?.schema_definition?.fields?.length || fieldCount) * 45 + 160
        break
      case "cosolvent":
        bytesPerRecord = 0 // Streamed to a live instance; no file is produced
        break
    }

    const totalBytes = recordCount * bytesPerRecord
    return formatFileSize(totalBytes)
  }

  function estimateProcessingTime(): string {
    const recordCount = recordLimit ? Number(recordLimit) : job.generated_records

    // Rough estimates based on format complexity
    const recordsPerSecond =
      {
        csv: 10000,
        json: 8000,
        xlsx: 3000,
        sql: 5000,
        xml: 4000,
        parquet: 6000,
        // Signing an HMAC per record, then validating it against the profile schema.
        population: 4000,
        // Bound by a network round-trip to Cosolvent per record, not by local work.
        cosolvent: 50,
      }[format] || 5000

    const seconds = Math.ceil(recordCount / recordsPerSecond)

    if (seconds < 60) return `~${seconds} seconds`
    if (seconds < 3600) return `~${Math.ceil(seconds / 60)} minutes`
    return `~${Math.ceil(seconds / 3600)} hours`
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
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
      <div className="max-w-6xl mx-auto text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Job Not Found</h1>
        <p className="text-gray-600">The job you're looking for doesn't exist.</p>
      </div>
    )
  }

  if (job.generated_records === 0) {
    return (
      <div className="max-w-6xl mx-auto text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Export Not Available</h1>
        <p className="text-gray-600 mb-6">No records have been generated yet. Wait for the job to generate some data first.</p>
        <Button asChild>
          <Link href={`/dashboard/jobs/${job.id}`}>View Job Details</Link>
        </Button>
      </div>
    )
  }

  const fields = job.schemas?.schema_definition?.fields || []

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/jobs/${job.id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Job
            </Link>
          </Button>
        </div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-2">
          Export Data: {job.name}
        </h1>
        <p className="text-gray-600">{job.generated_records.toLocaleString()} records available for export</p>
        {job.status !== "completed" && (
          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
            <p className="text-sm text-yellow-800">
              <strong>Partial export:</strong> This job is currently <strong>{job.status}</strong>. 
              You are exporting {job.generated_records} of {job.total_records} total records.
            </p>
          </div>
        )}
      </div>

      <Tabs defaultValue="create" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create">Create Export</TabsTrigger>
          <TabsTrigger value="history">Export History ({exports.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Export Configuration */}
            <Card className="border-2 border-purple-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-purple-500" />
                  Export Configuration
                </CardTitle>
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

                <div className="grid gap-3">
                  <Label>Export Format</Label>
                  <div className="grid grid-cols-1 gap-3">
                    {EXPORT_FORMATS.map((fmt) => {
                      const Icon = fmt.icon
                      const isRecommended = fmt.recommended
                      const exceedsLimit = job.generated_records > fmt.maxRecords

                      return (
                        <div
                          key={fmt.value}
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${
                            format === fmt.value
                              ? "border-purple-500 bg-purple-50 ring-2 ring-purple-200"
                              : exceedsLimit
                                ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
                                : "border-gray-200 hover:border-purple-300 hover:bg-purple-50"
                          }`}
                          onClick={() => !exceedsLimit && setFormat(fmt.value)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <Icon className="h-5 w-5 text-gray-600" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{fmt.label}</span>
                                  {isRecommended && (
                                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                      Recommended
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{fmt.description}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                  Max: {fmt.maxRecords.toLocaleString()} records
                                </p>
                              </div>
                            </div>
                            {exceedsLimit && <AlertCircle className="h-4 w-4 text-red-500" />}
                          </div>

                          {exceedsLimit && (
                            <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                              Dataset too large for this format. Consider using CSV or Parquet.
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>
                    Fields to Export ({selectedFields.length} of {fields.length})
                  </Label>
                  <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-2 bg-gray-50">
                    {fields.map((field: any) => (
                      <div key={field.name} className="flex items-center space-x-2">
                        <Checkbox
                          id={field.name}
                          checked={selectedFields.includes(field.name)}
                          onCheckedChange={() => toggleField(field.name)}
                        />
                        <Label htmlFor={field.name} className="text-sm font-normal cursor-pointer flex-1">
                          <div className="flex items-center justify-between">
                            <span>{field.name}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {field.type}
                              </Badge>
                              {["name", "email", "company", "text", "image"].includes(field.type) && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-purple-50 text-purple-700 border-purple-200"
                                >
                                  AI
                                </Badge>
                              )}
                            </div>
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedFields(fields.map((f: any) => f.name))}
                    >
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

                {format === "population" && (
                  <div className="space-y-4 rounded-lg border border-purple-200 bg-purple-50/50 p-4">
                    <div className="space-y-2">
                      <Label htmlFor="population-mode">Mode</Label>
                      <select
                        id="population-mode"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={populationMode}
                        onChange={(e) => setPopulationMode(e.target.value as "demo" | "production")}
                      >
                        <option value="demo">Demo — watermark every record (synthetic)</option>
                        <option value="production">Production — no watermark (clean cutover)</option>
                      </select>
                      <p className="text-xs text-gray-500">
                        {populationMode === "demo"
                          ? "Cosolvent requires a valid synthetic watermark in demo mode."
                          : "Cosolvent rejects watermarked records in production mode."}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="target-schema">Target profile schema (optional)</Label>
                      <textarea
                        id="target-schema"
                        className="h-32 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                        value={targetSchemaText}
                        onChange={(e) => setTargetSchemaText(e.target.value)}
                        placeholder={'{\n  "participantType": "producer",\n  "fields": [ ... ]\n}'}
                      />
                      <p className="text-xs text-gray-500">
                        Paste the descriptor from Cosolvent&apos;s{" "}
                        <code className="rounded bg-gray-100 px-1">
                          python -m cli export-profile-schema &lt;type&gt;
                        </code>
                        . With it, values are coerced to the marketplace&apos;s field types and
                        schema violations are caught here instead of at ingest.
                      </p>
                    </div>
                  </div>
                )}

                {format === "cosolvent" && (
                  <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/50 p-4">
                    <Label htmlFor="cosolvent-url">Cosolvent base URL</Label>
                    <Input
                      id="cosolvent-url"
                      value={cosolventBaseUrl}
                      onChange={(e) => setCosolventBaseUrl(e.target.value)}
                      placeholder="http://localhost:8003"
                    />
                    <p className="text-xs text-gray-500">
                      Streams each record to a running instance. Falls back to the
                      COSOLVENT_BASE_URL environment variable when left empty.
                    </p>
                  </div>
                )}

                {formError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {populationResult && (
                  <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                    <div className="font-medium">
                      Exported {populationResult.stats.exported} of {populationResult.stats.total} record(s)
                    </div>
                    <div className="text-xs text-gray-600">
                      coerced {populationResult.stats.coerced} &middot; dropped fields{" "}
                      {populationResult.stats.droppedFields} &middot; warnings {populationResult.stats.warnings}
                    </div>
                    {populationResult.rejected.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-amber-700">
                          {populationResult.rejected.length} record(s) held back:
                        </div>
                        <ul className="space-y-0.5 text-xs text-amber-700">
                          {populationResult.rejected.slice(0, 5).map((r) => (
                            <li key={r.externalId}>
                              #{r.recordIndex} {r.externalId}: {r.reasons.join("; ")}
                            </li>
                          ))}
                        </ul>
                        {populationResult.rejected.length > 5 && (
                          <div className="text-xs text-gray-500">
                            ...and {populationResult.rejected.length - 5} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={createExport}
                  disabled={
                    isExporting ||
                    !exportName.trim() ||
                    (selectedFields.length === 0 && !COSOLVENT_FORMATS.includes(format))
                  }
                  className="w-full bg-gradient-to-r from-purple-600 to-teal-500 hover:from-purple-700 hover:to-teal-700"
                >
                  {isExporting ? (
                    <>
                      <Zap className="mr-2 h-4 w-4 animate-pulse" />
                      Creating Export...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Create Export
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Export Preview */}
            <Card className="border-2 border-teal-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-teal-500" />
                  Export Preview
                </CardTitle>
                <CardDescription>Preview of your export configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gradient-to-r from-purple-50 to-teal-50 p-4 rounded-lg border">
                  <h4 className="font-medium text-sm mb-3">Export Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Name:</span>
                      <span className="font-medium">{exportName || "Untitled Export"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Format:</span>
                      <span className="font-medium">{format.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Fields:</span>
                      <span className="font-medium">{selectedFields.length} selected</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Records:</span>
                      <span className="font-medium">
                        {recordLimit ? Number(recordLimit).toLocaleString() : job.generated_records.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedFields.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Selected Fields</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedFields.slice(0, 10).map((field) => (
                        <Badge key={field} variant="outline" className="text-xs">
                          {field}
                        </Badge>
                      ))}
                      {selectedFields.length > 10 && (
                        <Badge variant="outline" className="text-xs">
                          +{selectedFields.length - 10} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
                  <strong>Estimated file size:</strong> {estimateFileSize()} <br />
                  <strong>Processing time:</strong> {estimateProcessingTime()}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          {/* Export History */}
          <Card>
            <CardHeader>
              <CardTitle>Export History</CardTitle>
              <CardDescription>Previous exports for this job ({exports.length})</CardDescription>
            </CardHeader>
            <CardContent>
              {exports.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Download className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No exports created yet</h3>
                  <p className="mb-4">Create your first export to get started</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {exports.map((exportRecord) => (
                    <Card key={exportRecord.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-3">
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
                            className="flex items-center gap-1"
                          >
                            {exportRecord.status === "completed" && <CheckCircle className="h-3 w-3" />}
                            {exportRecord.status === "failed" && <AlertCircle className="h-3 w-3" />}
                            {exportRecord.status === "processing" && <Clock className="h-3 w-3" />}
                            {exportRecord.status}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                          <div>
                            <span className="font-medium">{exportRecord.format.toUpperCase()}</span>
                          </div>
                          <div>{exportRecord.record_count?.toLocaleString() || "Unknown"} records</div>
                          <div className="col-span-2">Size: {formatFileSize(exportRecord.file_size)}</div>
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
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
