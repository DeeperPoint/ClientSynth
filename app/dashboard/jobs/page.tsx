"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Play, Pause, RotateCcw, Trash2, Eye, Search, Filter } from "lucide-react"
import Link from "next/link"
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
  schemas: {
    name: string
  }
  profiles: {
    full_name: string
  }
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const supabase = createClient()

  useEffect(() => {
    loadJobs()
    // Set up real-time subscription for job updates
    const subscription = supabase
      .channel("jobs_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
        loadJobs()
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    filterJobs()
  }, [jobs, statusFilter, searchQuery])

  const loadJobs = async () => {
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
          schemas(name),
          profiles(full_name)
        `)
        .order("created_at", { ascending: false })

      if (error) throw error
      setJobs(data || [])
    } catch (error) {
      console.error("Error loading jobs:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const filterJobs = () => {
    let filtered = jobs

    if (statusFilter !== "all") {
      filtered = filtered.filter((job) => job.status === statusFilter)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (job) =>
          job.name.toLowerCase().includes(query) ||
          job.schemas?.name.toLowerCase().includes(query) ||
          job.profiles?.full_name.toLowerCase().includes(query),
      )
    }

    setFilteredJobs(filtered)
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Play className="h-3 w-3" />
      case "completed":
        return <div className="w-3 h-3 bg-green-500 rounded-full" />
      case "failed":
        return <div className="w-3 h-3 bg-red-500 rounded-full" />
      case "pending":
        return <Pause className="h-3 w-3" />
      default:
        return null
    }
  }

  const retryJob = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from("jobs")
        .update({ status: "pending", error_message: null, progress: 0, generated_records: 0 })
        .eq("id", jobId)

      if (error) throw error
      loadJobs()
    } catch (error) {
      console.error("Error retrying job:", error)
      alert("Failed to retry job")
    }
  }

  const deleteJob = async (jobId: string) => {
    if (!confirm("Are you sure you want to delete this job? This action cannot be undone.")) {
      return
    }

    try {
      const { error } = await supabase.from("jobs").delete().eq("id", jobId)

      if (error) throw error
      loadJobs()
    } catch (error) {
      console.error("Error deleting job:", error)
      alert("Failed to delete job")
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Job Console</h1>
          <p className="text-gray-600">Monitor and manage your data generation jobs</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search jobs, schemas, or creators..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Job Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{jobs.length}</div>
              <div className="text-sm text-gray-500">Total Jobs</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {jobs.filter((j) => j.status === "running").length}
              </div>
              <div className="text-sm text-gray-500">Running</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {jobs.filter((j) => j.status === "completed").length}
              </div>
              <div className="text-sm text-gray-500">Completed</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{jobs.filter((j) => j.status === "failed").length}</div>
              <div className="text-sm text-gray-500">Failed</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <Play className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {jobs.length === 0 ? "No jobs yet" : "No jobs match your filters"}
            </h3>
            <p className="text-gray-600 mb-6">
              {jobs.length === 0
                ? "Create your first data generation job from a schema"
                : "Try adjusting your search or filter criteria"}
            </p>
            {jobs.length === 0 && (
              <Button asChild>
                <Link href="/dashboard/schema">Browse Schemas</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => (
            <Card key={job.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{job.name}</h3>
                      <Badge className={`${getStatusColor(job.status)} flex items-center gap-1`}>
                        {getStatusIcon(job.status)}
                        {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <div className="text-sm text-gray-500">Schema</div>
                        <div className="font-medium">{job.schemas?.name}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Progress</div>
                        <div className="font-medium">
                          {job.generated_records.toLocaleString()} / {job.total_records.toLocaleString()} records
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Created</div>
                        <div className="font-medium">
                          {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Progress</span>
                        <span className="text-sm font-medium">{job.progress}%</span>
                      </div>
                      <Progress value={job.progress} className="h-2" />
                    </div>

                    {/* Error Message */}
                    {job.error_message && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                        <div className="text-sm text-red-800">{job.error_message}</div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/jobs/${job.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>

                    {job.status === "failed" && (
                      <Button variant="ghost" size="sm" onClick={() => retryJob(job.id)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}

                    <Button variant="ghost" size="sm" onClick={() => deleteJob(job.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
