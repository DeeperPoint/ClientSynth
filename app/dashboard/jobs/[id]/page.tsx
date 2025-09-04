"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft,
  RotateCcw,
  Download,
  RefreshCw,
  Play,
  Pause,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { formatDistanceToNow } from "date-fns"

interface Job {
  id: string
  name: string
  status: string
  progress: number
  total_records: number
  generated_records: number
  created_at: string
  updated_at: string
  started_at?: string
  completed_at?: string
  error_message?: string
  config: any
  schemas: {
    id: string
    name: string
    description: string
    schema_definition: any
  }
  profiles: {
    full_name: string
  }
}

interface JobLog {
  id: string
  level: string
  message: string
  metadata: any
  created_at: string
}

interface GeneratedData {
  id: string
  record_data: any
  record_index: number
  created_at: string
}

interface ProgressStats {
  recordsPerMinute: number
  estimatedTimeRemaining: number
  currentPhase: string
  lastUpdateTime: Date
}

export default function JobDetailPage() {
  const [job, setJob] = useState<Job | null>(null)
  const [logs, setLogs] = useState<JobLog[]>([])
  const [sampleData, setSampleData] = useState<GeneratedData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [progressStats, setProgressStats] = useState<ProgressStats>({
    recordsPerMinute: 0,
    estimatedTimeRemaining: 0,
    currentPhase: "Initializing",
    lastUpdateTime: new Date(),
  })
  const [isLiveMode, setIsLiveMode] = useState(true)
  const previousProgress = useRef<{ records: number; time: Date } | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const params = useParams()
  const supabase = createClient()

  useEffect(() => {
    loadJobDetails()

    const jobSubscription = supabase
      .channel(`job_${params.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${params.id}`,
        },
        (payload) => {
          console.log("[v0] Job update received:", payload)
          handleJobUpdate(payload.new as Job)
        },
      )
      .subscribe()

    const logsSubscription = supabase
      .channel(`job_logs_${params.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "job_logs",
          filter: `job_id=eq.${params.id}`,
        },
        (payload) => {
          console.log("[v0] New log received:", payload)
          handleNewLog(payload.new as JobLog)
        },
      )
      .subscribe()

    const dataSubscription = supabase
      .channel(`generated_data_${params.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "generated_data",
          filter: `job_id=eq.${params.id}`,
        },
        () => {
          loadSampleData()
        },
      )
      .subscribe()

    return () => {
      jobSubscription.unsubscribe()
      logsSubscription.unsubscribe()
      dataSubscription.unsubscribe()
    }
  }, [params.id])

  useEffect(() => {
    if (isLiveMode && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs, isLiveMode])

  useEffect(() => {
    if (job && job.status === "processing") {
      calculateProgressStats()
    }
  }, [job]) // Updated to use job instead of job?.generated_records and job?.status

  const handleJobUpdate = (updatedJob: Job) => {
    setJob((prev) => {
      if (!prev) return updatedJob

      // Calculate progress stats if records increased
      if (updatedJob.generated_records > prev.generated_records) {
        updateProgressStats(prev.generated_records, updatedJob.generated_records)
      }

      return updatedJob
    })
  }

  const handleNewLog = (newLog: JobLog) => {
    setLogs((prev) => [newLog, ...prev])

    // Update current phase based on log message
    if (newLog.message.includes("Generating")) {
      setProgressStats((prev) => ({ ...prev, currentPhase: "Generating Data" }))
    } else if (newLog.message.includes("image")) {
      setProgressStats((prev) => ({ ...prev, currentPhase: "Generating Images" }))
    } else if (newLog.message.includes("Completed")) {
      setProgressStats((prev) => ({ ...prev, currentPhase: "Completed" }))
    }
  }

  const updateProgressStats = (prevRecords: number, currentRecords: number) => {
    const now = new Date()

    if (previousProgress.current) {
      const timeDiff = (now.getTime() - previousProgress.current.time.getTime()) / 1000 / 60 // minutes
      const recordsDiff = currentRecords - previousProgress.current.records

      if (timeDiff > 0) {
        const recordsPerMinute = recordsDiff / timeDiff
        const remainingRecords = (job?.total_records || 0) - currentRecords
        const estimatedTimeRemaining = remainingRecords / recordsPerMinute

        setProgressStats((prev) => ({
          ...prev,
          recordsPerMinute: Math.round(recordsPerMinute),
          estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
          lastUpdateTime: now,
        }))
      }
    }

    previousProgress.current = { records: currentRecords, time: now }
  }

  const calculateProgressStats = () => {
    if (!job) return

    const startTime = job.started_at ? new Date(job.started_at) : new Date(job.created_at)
    const now = new Date()
    const elapsedMinutes = (now.getTime() - startTime.getTime()) / 1000 / 60

    if (elapsedMinutes > 0 && job.generated_records > 0) {
      const recordsPerMinute = job.generated_records / elapsedMinutes
      const remainingRecords = job.total_records - job.generated_records
      const estimatedTimeRemaining = remainingRecords / recordsPerMinute

      setProgressStats((prev) => ({
        ...prev,
        recordsPerMinute: Math.round(recordsPerMinute),
        estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
      }))
    }
  }

  const loadJobDetails = async () => {
    try {
      console.log("[v0] Loading job details for ID:", params.id)

      const { data, error } = await supabase
        .from("jobs")
        .select(`
          id,
          name,
          status,
          progress,
          total_records,
          generated_records,
          created_at,
          updated_at,
          started_at,
          completed_at,
          error_message,
          config,
          schemas(id, name, description, schema_definition),
          profiles(full_name)
        `)
        .eq("id", params.id)
        .single()

      if (error) {
        console.error("[v0] Error loading job:", error)
        throw error
      }

      if (data && !data.schemas) {
        console.warn("[v0] Job found but associated schema is missing or inaccessible")
        data.schemas = {
          id: "unknown",
          name: "Schema Not Available",
          description: "The associated schema is no longer available",
          schema_definition: { fields: [] },
        }
      }

      console.log("[v0] Job loaded successfully:", data)
      setJob(data)

      await Promise.all([loadLogs(), loadSampleData()])
    } catch (error) {
      console.error("Error loading job details:", error)
      if (error.message?.includes("invalid input syntax for type uuid")) {
        console.error("[v0] Invalid job ID format")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const loadLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("job_logs")
        .select("*")
        .eq("job_id", params.id)
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error
      setLogs(data || [])
    } catch (error) {
      console.error("Error loading logs:", error)
    }
  }

  const loadSampleData = async () => {
    try {
      const { data, error } = await supabase
        .from("generated_data")
        .select("*")
        .eq("job_id", params.id)
        .order("record_index", { ascending: true })
        .limit(10)

      if (error) throw error
      setSampleData(data || [])
    } catch (error) {
      console.error("Error loading sample data:", error)
    }
  }

  const refreshData = async () => {
    setIsRefreshing(true)
    await loadJobDetails()
    setIsRefreshing(false)
  }

  const retryJob = async () => {
    if (!job) return

    try {
      const { error } = await supabase
        .from("jobs")
        .update({
          status: "pending",
          error_message: null,
          progress: 0,
          generated_records: 0,
          started_at: null,
          completed_at: null,
        })
        .eq("id", job.id)

      if (error) throw error
      await loadJobDetails()
    } catch (error) {
      console.error("Error retrying job:", error)
      alert("Failed to retry job")
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200"
      case "processing":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "failed":
        return "bg-red-100 text-red-800 border-red-200"
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4" />
      case "processing":
        return <Zap className="h-4 w-4 animate-pulse" />
      case "failed":
        return <AlertCircle className="h-4 w-4" />
      case "pending":
        return <Clock className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-600 bg-red-50 border-red-200"
      case "warning":
        return "text-yellow-600 bg-yellow-50 border-yellow-200"
      case "info":
        return "text-blue-600 bg-blue-50 border-blue-200"
      default:
        return "text-gray-600 bg-gray-50 border-gray-200"
    }
  }

  const formatDuration = (minutes: number) => {
    if (minutes < 1) return "< 1 min"
    if (minutes < 60) return `${Math.round(minutes)} min`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = Math.round(minutes % 60)
    return `${hours}h ${remainingMinutes}m`
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-48 bg-gray-200 rounded-lg"></div>
              <div className="h-64 bg-gray-200 rounded-lg"></div>
            </div>
            <div className="h-96 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="max-w-7xl mx-auto text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Job Not Found</h1>
        <p className="text-gray-600 mb-6">The job you're looking for doesn't exist or you don't have access to it.</p>
        <Button asChild>
          <Link href="/dashboard/jobs">Back to Jobs</Link>
        </Button>
      </div>
    )
  }

  const fields = job.schemas?.schema_definition?.fields || []

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/jobs">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Jobs
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={refreshData} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant={isLiveMode ? "default" : "outline"} size="sm" onClick={() => setIsLiveMode(!isLiveMode)}>
            {isLiveMode ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {isLiveMode ? "Live" : "Paused"}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-2">
              {job.name}
            </h1>
            <p className="text-gray-600">Schema: {job.schemas?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={`${getStatusColor(job.status)} text-sm px-3 py-1 border flex items-center gap-2`}>
              {getStatusIcon(job.status)}
              {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            </Badge>
            {job.status === "failed" && (
              <Button onClick={retryJob} size="sm" variant="outline">
                <RotateCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            )}
            {job.status === "completed" && (
              <Button asChild size="sm">
                <Link href={`/dashboard/jobs/${job.id}/export`}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-2 border-purple-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-500" />
                Real-time Progress
              </CardTitle>
              <CardDescription>Live generation statistics and progress tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{job.generated_records.toLocaleString()}</div>
                    <div className="text-sm text-gray-500">Generated</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{job.total_records.toLocaleString()}</div>
                    <div className="text-sm text-gray-500">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-teal-600">{progressStats.recordsPerMinute}</div>
                    <div className="text-sm text-gray-500">Records/min</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {job.status === "processing" ? formatDuration(progressStats.estimatedTimeRemaining) : "—"}
                    </div>
                    <div className="text-sm text-gray-500">ETA</div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Progress</span>
                    <span className="text-sm text-gray-600">
                      {job.generated_records} / {job.total_records} ({job.progress}%)
                    </span>
                  </div>
                  <Progress value={job.progress} className="h-4" />
                </div>

                {job.status === "processing" && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-blue-900">Current Phase</span>
                    </div>
                    <p className="text-sm text-blue-800">{progressStats.currentPhase}</p>
                  </div>
                )}

                {job.error_message && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h4 className="font-medium text-red-900 mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Error Details
                    </h4>
                    <p className="text-sm text-red-800">{job.error_message}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="logs" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="logs" className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${logs.length > 0 && isLiveMode ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
                    ></div>
                    Live Logs ({logs.length})
                  </TabsTrigger>
                  <TabsTrigger value="sample">Sample Data ({sampleData.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="logs" className="mt-6">
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {logs.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">No logs available</div>
                    ) : (
                      <>
                        {logs.map((log) => (
                          <div
                            key={log.id}
                            className={`border-l-4 pl-4 py-3 rounded-r-lg ${getLogLevelColor(log.level)}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{log.level.toUpperCase()}</span>
                              <span className="text-xs opacity-75">
                                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="text-sm">{log.message}</p>
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs cursor-pointer opacity-75">Details</summary>
                                <pre className="text-xs mt-1 opacity-75 overflow-x-auto">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                        <div ref={logsEndRef} />
                      </>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="sample" className="mt-6">
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {sampleData.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">No sample data available</div>
                    ) : (
                      sampleData.map((record) => (
                        <div
                          key={record.id}
                          className="bg-gradient-to-r from-purple-50 to-teal-50 border border-purple-100 rounded-lg p-4"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-gray-900">Record #{record.record_index + 1}</span>
                            <span className="text-xs text-gray-500">
                              {formatDistanceToNow(new Date(record.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {Object.entries(record.record_data).map(([key, value]) => (
                              <div key={key}>
                                <div className="text-xs text-gray-500 mb-1 font-medium">{key}</div>
                                <div className="text-sm text-gray-900 truncate bg-white px-2 py-1 rounded border">
                                  {String(value)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Job Details Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-gray-500 mb-1">Created By</div>
                <div className="font-medium">{job.profiles?.full_name || "Unknown"}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">Created</div>
                <div className="font-medium">{formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</div>
              </div>
              {job.started_at && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">Started</div>
                  <div className="font-medium">
                    {formatDistanceToNow(new Date(job.started_at), { addSuffix: true })}
                  </div>
                </div>
              )}
              {job.completed_at && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">Completed</div>
                  <div className="font-medium">
                    {formatDistanceToNow(new Date(job.completed_at), { addSuffix: true })}
                  </div>
                </div>
              )}
              <div>
                <div className="text-sm text-gray-500 mb-1">Last Updated</div>
                <div className="font-medium">{formatDistanceToNow(new Date(job.updated_at), { addSuffix: true })}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">Schema</div>
                <div className="font-medium">
                  {job.schemas?.id === "unknown" ? (
                    <span className="text-red-600">{job.schemas.name}</span>
                  ) : (
                    <Link
                      href={`/dashboard/schemas/${job.schemas?.id}`}
                      className="text-purple-600 hover:text-purple-700"
                    >
                      {job.schemas?.name}
                    </Link>
                  )}
                </div>
              </div>
              {job.config?.text_model && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">AI Model</div>
                  <div className="font-medium text-sm bg-purple-50 px-2 py-1 rounded border">
                    {job.config.text_model}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schema Fields</CardTitle>
              <CardDescription>{fields.length} fields in this schema</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {fields.map((field: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <div className="font-medium text-sm">{field.name}</div>
                      <div className="text-xs text-gray-500">{field.type}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {field.required && (
                        <Badge variant="secondary" className="text-xs">
                          Required
                        </Badge>
                      )}
                      {["name", "email", "company", "text", "image"].includes(field.type) && (
                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                          AI
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
