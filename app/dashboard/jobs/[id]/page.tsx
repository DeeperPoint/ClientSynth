"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, RotateCcw, Download, RefreshCw } from "lucide-react"
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

export default function JobDetailPage() {
  const [job, setJob] = useState<Job | null>(null)
  const [logs, setLogs] = useState<JobLog[]>([])
  const [sampleData, setSampleData] = useState<GeneratedData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const params = useParams()
  const supabase = createClient()

  useEffect(() => {
    loadJobDetails()

    // Set up real-time subscription
    const subscription = supabase
      .channel(`job_${params.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `id=eq.${params.id}` }, () => {
        loadJobDetails()
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "job_logs", filter: `job_id=eq.${params.id}` },
        () => {
          loadLogs()
        },
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [params.id])

  const loadJobDetails = async () => {
    try {
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
          error_message,
          config,
          schemas(id, name, description, schema_definition),
          profiles(full_name)
        `)
        .eq("id", params.id)
        .single()

      if (error) throw error
      setJob(data)

      // Load logs and sample data
      await Promise.all([loadLogs(), loadSampleData()])
    } catch (error) {
      console.error("Error loading job details:", error)
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
        .update({ status: "pending", error_message: null, progress: 0, generated_records: 0 })
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
        return "bg-green-100 text-green-800"
      case "running":
        return "bg-blue-100 text-blue-800"
      case "failed":
        return "bg-red-100 text-red-800"
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-600"
      case "warning":
        return "text-yellow-600"
      case "info":
        return "text-blue-600"
      default:
        return "text-gray-600"
    }
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
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{job.name}</h1>
            <p className="text-gray-600">Schema: {job.schemas?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={`${getStatusColor(job.status)} text-sm px-3 py-1`}>
              {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            </Badge>
            {job.status === "failed" && (
              <Button onClick={retryJob} size="sm">
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
          {/* Progress Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Progress Overview</CardTitle>
              <CardDescription>Current status and generation progress</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{job.generated_records.toLocaleString()}</div>
                    <div className="text-sm text-gray-500">Records Generated</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{job.total_records.toLocaleString()}</div>
                    <div className="text-sm text-gray-500">Total Records</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{job.progress}%</div>
                    <div className="text-sm text-gray-500">Complete</div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Progress</span>
                    <span className="text-sm text-gray-600">
                      {job.generated_records} / {job.total_records}
                    </span>
                  </div>
                  <Progress value={job.progress} className="h-3" />
                </div>

                {job.error_message && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h4 className="font-medium text-red-900 mb-2">Error Details</h4>
                    <p className="text-sm text-red-800">{job.error_message}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabs for Logs and Sample Data */}
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="logs" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="logs">Job Logs ({logs.length})</TabsTrigger>
                  <TabsTrigger value="sample">Sample Data ({sampleData.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="logs" className="mt-6">
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {logs.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">No logs available</div>
                    ) : (
                      logs.map((log) => (
                        <div key={log.id} className="border-l-4 border-gray-200 pl-4 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-sm font-medium ${getLogLevelColor(log.level)}`}>
                              {log.level.toUpperCase()}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{log.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="sample" className="mt-6">
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {sampleData.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">No sample data available</div>
                    ) : (
                      sampleData.map((record) => (
                        <div key={record.id} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-gray-900">Record #{record.record_index + 1}</span>
                            <span className="text-xs text-gray-500">
                              {formatDistanceToNow(new Date(record.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {Object.entries(record.record_data).map(([key, value]) => (
                              <div key={key}>
                                <div className="text-xs text-gray-500 mb-1">{key}</div>
                                <div className="text-sm text-gray-900 truncate">{String(value)}</div>
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
              <div>
                <div className="text-sm text-gray-500 mb-1">Last Updated</div>
                <div className="font-medium">{formatDistanceToNow(new Date(job.updated_at), { addSuffix: true })}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">Schema</div>
                <div className="font-medium">
                  <Link href={`/dashboard/schemas/${job.schemas?.id}`} className="text-blue-600 hover:text-blue-700">
                    {job.schemas?.name}
                  </Link>
                </div>
              </div>
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
                    {field.required && (
                      <Badge variant="secondary" className="text-xs">
                        Required
                      </Badge>
                    )}
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
