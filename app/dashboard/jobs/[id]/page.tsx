"use client"

import { useState, useEffect, useRef } from "react"
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
  Sparkles,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { useToast } from "@/hooks/use-toast"

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
  const { toast } = useToast()
  const [isTriggering, setIsTriggering] = useState(false)
  
  // Extract persona context from logs
  const personaContext = logs.find(log => 
    log.message.includes("Persona context generated") && 
    log.metadata?.personaContext
  )?.metadata?.personaContext

  const formatRelativeSafe = (iso?: string) => {
    if (!iso) return "—"
    const d = new Date(iso)
    if (isNaN(d.getTime())) return "—"
    return formatDistanceToNow(d, { addSuffix: true })
  }

  const params = useParams()
  const router = useRouter()
  // Use Postgres-backed API endpoints

  useEffect(() => {
    loadJobDetails()
  }, [params.id])

  useEffect(() => {
    if (!isLiveMode) return
    if (job?.status === "completed") return
    const intervalId = setInterval(() => {
      loadJobDetails()
    }, 8000)
    return () => clearInterval(intervalId)
  }, [isLiveMode, job?.status])

  useEffect(() => {
    if (isLiveMode && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs, isLiveMode])

  useEffect(() => {
    if (job && (job.status === "running" || job.status === "processing")) {
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

      const jobRes = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'jobs',
          columns: 'id, name, status, progress, total_records, generated_records, created_at, updated_at, started_at, completed_at, error_message, config, schema_id, created_by',
          where: { op: 'eq', column: 'id', value: params.id },
          single: true,
        })
      })
      const jobJson = await jobRes.json()
      const data = jobJson.data
      if (!jobRes.ok || !data) throw new Error(jobJson.error || 'Job not found')

      // Fetch associated schema and profile to enrich client-side (no joins in shim)
      let schemaObj: any | null = null
      try {
        const schemaRes = await fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'select',
            table: 'schemas',
            columns: 'id, name, description, schema_definition',
            where: { op: 'eq', column: 'id', value: (data as any).schema_id },
            single: true,
          })
        })
        const schemaJson = await schemaRes.json()
        schemaObj = schemaJson.data || null
      } catch {}

      let profileObj: any | null = null
      try {
        if ((data as any).created_by) {
          const profileRes = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'select',
              table: 'profiles',
              columns: 'full_name',
              where: { op: 'eq', column: 'id', value: (data as any).created_by },
              single: true,
            })
          })
          const profileJson = await profileRes.json()
          profileObj = profileJson.data || null
        }
      } catch {}

      const enriched: any = {
        ...data,
        schemas:
          schemaObj || {
            id: "unknown",
            name: "Schema Not Available",
            description: "The associated schema is no longer available",
            schema_definition: { fields: [] },
          },
        profiles: profileObj || { full_name: "Unknown" },
      }

      console.log("[v0] Job loaded successfully:", enriched)
      setJob(enriched)

      if (data.status === "pending") {
        const createdAt = new Date(data.created_at)
        const now = new Date()
        const minutesElapsed = (now.getTime() - createdAt.getTime()) / 1000 / 60

        if (minutesElapsed > 2) {
          console.warn("[v0] Job has been pending for", minutesElapsed, "minutes")
          console.warn("[v0] This may indicate a job processor initialization issue")
        }
      }

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
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'job_logs',
          columns: '*',
          where: { op: 'eq', column: 'job_id', value: params.id },
          orderBy: { column: 'created_at', ascending: false },
          limitCount: 100,
        })
      })
      const json = await res.json()
      setLogs(json.data || [])
    } catch (error) {
      console.error("Error loading logs:", error)
    }
  }

  const loadSampleData = async () => {
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'generated_data',
          columns: '*',
          where: { op: 'eq', column: 'job_id', value: params.id },
          orderBy: { column: 'record_index', ascending: true },
          limitCount: 10,
        })
      })
      const json = await res.json()
      setSampleData(json.data || [])
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
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          table: 'jobs',
          data: {
            status: 'pending',
            error_message: null,
            progress: 0,
            generated_records: 0,
            started_at: null,
            completed_at: null,
          },
          where: { op: 'eq', column: 'id', value: job.id },
        })
      })
      if (!res.ok) throw new Error('Failed to retry job')
      await loadJobDetails()
    } catch (error) {
      console.error("Error retrying job:", error)
      alert("Failed to retry job")
    }
  }

  const triggerJobProcessing = async () => {
    if (!job) return

    setIsTriggering(true)
    try {
      console.log("[v0] Manually triggering job processing for job:", job.id)

      const response = await fetch("/api/jobs/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const result = await response.json()
      console.log("[v0] Trigger result:", result)

      if (result.success) {
        toast({
          title: "Processing Started",
          description: result.processed
            ? "Job processing has been initiated successfully"
            : "No pending jobs found to process",
        })

        // Refresh job details after a short delay
        setTimeout(() => {
          loadJobDetails()
        }, 2000)
      } else {
        toast({
          title: "Processing Failed",
          description: result.error || "Failed to start job processing",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Error triggering job processing:", error)
      toast({
        title: "Error",
        description: "Failed to trigger job processing. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsTriggering(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-chart-3/10 text-chart-3 border-chart-3/20"
      case "running":
        return "bg-primary/10 text-primary border-primary/20"
      case "failed":
        return "bg-destructive/10 text-destructive border-destructive/20"
      case "pending":
        return "bg-chart-4/10 text-chart-4 border-chart-4/20"
      default:
        return "bg-muted text-muted-foreground border-border"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4" />
      case "running":
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
        return "text-destructive bg-destructive/5 border-destructive/20"
      case "warning":
        return "text-chart-4 bg-chart-4/5 border-chart-4/20"
      case "info":
        return "text-primary bg-primary/5 border-primary/20"
      default:
        return "text-muted-foreground bg-muted/50 border-border"
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
        <div className="glass-effect rounded-2xl p-12 max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-foreground mb-2">Job Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The job you're looking for doesn't exist or you don't have access to it.
          </p>
          <Button asChild className="gradient-primary text-white shadow-medium">
            <Link href="/dashboard/jobs">Back to Jobs</Link>
          </Button>
        </div>
      </div>
    )
  }

  const fields = job.schemas?.schema_definition?.fields || []

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/jobs")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Jobs
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
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
              {job.name}
            </h1>
            <p className="text-lg text-muted-foreground">Schema: {job.schemas?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={`${getStatusColor(job.status)} text-sm px-3 py-1 border flex items-center gap-2`}>
              {getStatusIcon(job.status)}
              {job.status ? job.status.charAt(0).toUpperCase() + job.status.slice(1) : "Unknown"}
            </Badge>
            {job.status === "failed" && (
              <Button onClick={retryJob} size="sm" variant="outline">
                <RotateCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            )}
            {job.status === "completed" && (
              <Button asChild size="sm" className="gradient-primary text-white shadow-medium">
                <Link href={`/dashboard/jobs/${job.id}/export`}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="glass-effect shadow-soft hover:shadow-medium transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Zap className="h-5 w-5 text-primary" />
                Real-time Progress
              </CardTitle>
              <CardDescription>Live generation statistics and progress tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{(job.generated_records ?? 0).toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Generated</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">{(job.total_records ?? 0).toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-accent">{progressStats.recordsPerMinute}</div>
                    <div className="text-sm text-muted-foreground">Records/min</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-chart-2">
                      {job.status === "running" || job.status === "processing" ? formatDuration(progressStats.estimatedTimeRemaining) : "—"}
                    </div>
                    <div className="text-sm text-muted-foreground">ETA</div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">Progress</span>
                    <span className="text-sm text-muted-foreground">
                      {(job.generated_records ?? 0)} / {(job.total_records ?? 0)} ({job.progress ?? 0}%)
                    </span>
                  </div>
                  <Progress value={job.progress} className="h-4" />
                </div>

                {(job.status === "running" || job.status === "processing") && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-primary">Current Phase</span>
                    </div>
                    <p className="text-sm text-foreground">{progressStats.currentPhase}</p>
                  </div>
                )}

                {job.error_message && (
                  <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4">
                    <h4 className="font-medium text-destructive mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Error Details
                    </h4>
                    <p className="text-sm text-destructive">{job.error_message}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-effect shadow-soft">
            <CardContent className="pt-6">
              <Tabs defaultValue="logs" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="logs" className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${logs.length > 0 && isLiveMode ? "bg-chart-3 animate-pulse" : "bg-muted-foreground"}`}
                    ></div>
                    Live Logs ({logs.length})
                  </TabsTrigger>
                  <TabsTrigger value="sample">Sample Data ({sampleData.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="logs" className="mt-6">
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {logs.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">No logs available</div>
                    ) : (
                      <>
                        {logs.map((log) => (
                          <div
                            key={log.id}
                            className={`border-l-4 pl-4 py-3 rounded-r-xl ${getLogLevelColor(log.level)}`}
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
                      <div className="text-center py-8 text-muted-foreground">No sample data available</div>
                    ) : (
                      sampleData.map((record) => (
                        <div
                          key={record.id}
                          className="bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/20 rounded-xl p-4"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-foreground">
                              Record #{record.record_index + 1}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(record.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {Object.entries(record.record_data).map(([key, value]) => (
                              <div key={key}>
                                <div className="text-xs text-muted-foreground mb-1 font-medium">{key}</div>
                                <div className="text-sm text-foreground truncate bg-card px-2 py-1 rounded border">
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

        <div className="space-y-6">
          {/* Persona Context Display */}
          {personaContext && (
            <Card className="glass-effect shadow-soft border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Persona Context
                </CardTitle>
                <CardDescription>
                  AI-generated context ensuring consistent data generation across all records
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(personaContext).map(([key, value]) => (
                      <div key={key} className="bg-card/50 border border-primary/10 rounded-lg p-3">
                        <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className="text-sm text-foreground font-medium">
                          {typeof value === 'object' && value !== null ? (
                            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                          ) : (
                            String(value)
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-primary/10">
                    This persona context is used to generate consistent, realistic data across all {job?.total_records || 0} records.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card className="glass-effect shadow-soft">
            <CardHeader>
              <CardTitle className="text-foreground">Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Created By</div>
                <div className="font-medium text-foreground">{job.profiles?.full_name || "Unknown"}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Created</div>
                <div className="font-medium text-foreground">{formatRelativeSafe(job.created_at)}</div>
              </div>
              {job.started_at && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Started</div>
                  <div className="font-medium text-foreground">{formatRelativeSafe(job.started_at)}</div>
                </div>
              )}
              {job.completed_at && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Completed</div>
                  <div className="font-medium text-foreground">{formatRelativeSafe(job.completed_at)}</div>
                </div>
              )}
              <div>
                <div className="text-sm text-muted-foreground mb-1">Last Updated</div>
                <div className="font-medium text-foreground">{formatRelativeSafe(job.updated_at)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Schema</div>
                <div className="font-medium">
                  {job.schemas?.id === "unknown" ? (
                    <span className="text-destructive">{job.schemas.name}</span>
                  ) : (
                    <Link
                      href={`/dashboard/schemas/${job.schemas?.id}`}
                      className="text-primary hover:text-primary/80 transition-colors"
                    >
                      {job.schemas?.name}
                    </Link>
                  )}
                </div>
              </div>
              {job.config?.text_model && (
                <div>
                  <div className="text-sm text-muted-foreground mb-1">AI Model</div>
                  <div className="font-medium text-sm bg-primary/10 text-primary px-3 py-1 rounded-lg border border-primary/20">
                    {job.config.text_model}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-effect shadow-soft">
            <CardHeader>
              <CardTitle className="text-foreground">Schema Fields</CardTitle>
              <CardDescription>{fields.length} fields in this schema</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {fields.map((field: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div>
                      <div className="font-medium text-sm text-foreground">{field.name}</div>
                      <div className="text-xs text-muted-foreground">{field.type}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {field.required && (
                        <Badge variant="secondary" className="text-xs">
                          Required
                        </Badge>
                      )}
                      {["name", "email", "company", "text", "image"].includes(field.type) && (
                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
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

      {job.status === "pending" && (
        <div className="mt-6 bg-chart-4/10 border border-chart-4/20 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <Clock className="h-6 w-6 text-chart-4" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-chart-4 mb-2">Job Pending</h3>
              <p className="text-sm text-foreground mb-4">
                This job is waiting to be processed. In serverless environments, background processing may not start
                automatically. Click the button below to manually start processing.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  onClick={triggerJobProcessing}
                  disabled={isTriggering}
                  className="bg-chart-4 hover:bg-chart-4/90 text-white"
                >
                  {isTriggering ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Start Processing Now
                    </>
                  )}
                </Button>
                <Button onClick={refreshData} variant="outline" size="sm" disabled={isRefreshing}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh Status
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
