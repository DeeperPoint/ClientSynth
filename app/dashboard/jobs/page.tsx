"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Play,
  RotateCcw,
  Trash2,
  Eye,
  Search,
  Filter,
  Download,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Zap,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  config: any
  schemas: {
    id: string
    name: string
  }
  profiles: {
    full_name: string
  }
}

type SortField = "created_at" | "name" | "status" | "progress" | "total_records"
type SortOrder = "asc" | "desc"

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([])
  const [selectedJobs, setSelectedJobs] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState<SortField>("created_at")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [dateFilter, setDateFilter] = useState("all")
  const [isRefreshing, setIsRefreshing] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadJobs()

    const subscription = supabase
      .channel("jobs_management")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
        },
        (payload) => {
          console.log("[JobsPage] Job update received:", payload)
          loadJobs()
        },
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    filterAndSortJobs()
  }, [jobs, statusFilter, searchQuery, sortField, sortOrder, dateFilter])

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
          config,
          schemas(id, name),
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

  const filterAndSortJobs = () => {
    let filtered = [...jobs]

    if (statusFilter !== "all") {
      filtered = filtered.filter((job) => job.status === statusFilter)
    }

    if (dateFilter !== "all") {
      const now = new Date()
      const filterDate = new Date()

      switch (dateFilter) {
        case "today":
          filterDate.setHours(0, 0, 0, 0)
          break
        case "week":
          filterDate.setDate(now.getDate() - 7)
          break
        case "month":
          filterDate.setMonth(now.getMonth() - 1)
          break
      }

      if (dateFilter !== "all") {
        filtered = filtered.filter((job) => new Date(job.created_at) >= filterDate)
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (job) =>
          job.name.toLowerCase().includes(query) ||
          job.schemas?.name.toLowerCase().includes(query) ||
          job.profiles?.full_name.toLowerCase().includes(query) ||
          job.id.toLowerCase().includes(query),
      )
    }

    filtered.sort((a, b) => {
      let aValue: any = a[sortField]
      let bValue: any = b[sortField]

      if (sortField === "created_at" || sortField === "updated_at") {
        aValue = new Date(aValue).getTime()
        bValue = new Date(bValue).getTime()
      } else if (typeof aValue === "string") {
        aValue = aValue.toLowerCase()
        bValue = bValue.toLowerCase()
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

    setFilteredJobs(filtered)
  }

  const refreshJobs = async () => {
    setIsRefreshing(true)
    await loadJobs()
    setIsRefreshing(false)
  }

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobs((prev) => (prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]))
  }

  const toggleSelectAll = () => {
    if (selectedJobs.length === filteredJobs.length) {
      setSelectedJobs([])
    } else {
      setSelectedJobs(filteredJobs.map((job) => job.id))
    }
  }

  const bulkDeleteJobs = async () => {
    if (selectedJobs.length === 0) return

    if (!confirm(`Are you sure you want to delete ${selectedJobs.length} job(s)? This action cannot be undone.`)) {
      return
    }

    try {
      const { error } = await supabase.from("jobs").delete().in("id", selectedJobs)

      if (error) throw error

      setSelectedJobs([])
      await loadJobs()
    } catch (error) {
      console.error("Error deleting jobs:", error)
      alert("Failed to delete jobs")
    }
  }

  const bulkRetryJobs = async () => {
    if (selectedJobs.length === 0) return

    try {
      const { error } = await supabase
        .from("jobs")
        .update({
          status: "pending",
          error_message: null,
          progress: 0,
          generated_records: 0,
        })
        .in("id", selectedJobs)

      if (error) throw error

      setSelectedJobs([])
      await loadJobs()
    } catch (error) {
      console.error("Error retrying jobs:", error)
      alert("Failed to retry jobs")
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
      case "processing":
        return <Zap className="h-3 w-3 animate-pulse" />
      case "completed":
        return <CheckCircle className="h-3 w-3" />
      case "failed":
        return <AlertCircle className="h-3 w-3" />
      case "pending":
        return <Clock className="h-3 w-3" />
      default:
        return <Clock className="h-3 w-3" />
    }
  }

  const retryJob = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from("jobs")
        .update({
          status: "pending",
          error_message: null,
          progress: 0,
          generated_records: 0,
        })
        .eq("id", jobId)

      if (error) throw error
      await loadJobs()
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
      await loadJobs()
    } catch (error) {
      console.error("Error deleting job:", error)
      alert("Failed to delete job")
    }
  }

  const getJobStats = () => {
    return {
      total: jobs.length,
      pending: jobs.filter((j) => j.status === "pending").length,
      processing: jobs.filter((j) => j.status === "processing").length,
      completed: jobs.filter((j) => j.status === "completed").length,
      failed: jobs.filter((j) => j.status === "failed").length,
      totalRecords: jobs.reduce((sum, job) => sum + job.total_records, 0),
      generatedRecords: jobs.reduce((sum, job) => sum + job.generated_records, 0),
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const stats = getJobStats()

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-2">
            Job Console
          </h1>
          <p className="text-gray-600">Monitor and manage your data generation jobs</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={refreshJobs} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/dashboard/schemas">
              <Play className="mr-2 h-4 w-4" />
              New Job
            </Link>
          </Button>
        </div>
      </div>

      {/* Enhanced Job Stats */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
        <Card className="border-purple-100">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-500">Total Jobs</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-100">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-sm text-gray-500">Pending</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-100">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
              <div className="text-sm text-gray-500">Processing</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-100">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-sm text-gray-500">Completed</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-100">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-sm text-gray-500">Failed</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-teal-100">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-teal-600">
                {((stats.generatedRecords / Math.max(stats.totalRecords, 1)) * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-gray-500">Overall Progress</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Filters and Controls */}
      <Card className="mb-6 border-2 border-purple-100">
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search jobs, schemas, creators, or job IDs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Select
                value={`${sortField}-${sortOrder}`}
                onValueChange={(value) => {
                  const [field, order] = value.split("-") as [SortField, SortOrder]
                  setSortField(field)
                  setSortOrder(order)
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at-desc">Newest First</SelectItem>
                  <SelectItem value="created_at-asc">Oldest First</SelectItem>
                  <SelectItem value="name-asc">Name A-Z</SelectItem>
                  <SelectItem value="name-desc">Name Z-A</SelectItem>
                  <SelectItem value="progress-desc">Progress High-Low</SelectItem>
                  <SelectItem value="progress-asc">Progress Low-High</SelectItem>
                  <SelectItem value="total_records-desc">Records High-Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedJobs.length > 0 && (
            <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-purple-900">{selectedJobs.length} job(s) selected</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={bulkRetryJobs}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Retry Selected
                  </Button>
                  <Button size="sm" variant="outline" onClick={bulkDeleteJobs}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedJobs([])}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
                <Link href="/dashboard/schemas">Browse Schemas</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Select All Header */}
          <Card className="border-gray-200">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedJobs.length === filteredJobs.length && filteredJobs.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm font-medium text-gray-700">Select All ({filteredJobs.length} jobs)</span>
              </div>
            </CardContent>
          </Card>

          {filteredJobs.map((job) => (
            <Card
              key={job.id}
              className={`hover:shadow-lg transition-all duration-200 ${
                selectedJobs.includes(job.id) ? "ring-2 ring-purple-200 bg-purple-50" : ""
              }`}
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Checkbox
                    checked={selectedJobs.includes(job.id)}
                    onCheckedChange={() => toggleJobSelection(job.id)}
                    className="mt-1"
                  />

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">{job.name}</h3>
                      <Badge className={`${getStatusColor(job.status)} flex items-center gap-1 border`}>
                        {getStatusIcon(job.status)}
                        {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </Badge>
                      {job.config?.text_model && (
                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                          {job.config.text_model.split("/").pop()}
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-sm text-gray-500">Schema</div>
                        <Link
                          href={`/dashboard/schemas/${job.schemas?.id}`}
                          className="font-medium text-purple-600 hover:text-purple-700"
                        >
                          {job.schemas?.name}
                        </Link>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Progress</div>
                        <div className="font-medium">
                          {job.generated_records.toLocaleString()} / {job.total_records.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Created By</div>
                        <div className="font-medium">{job.profiles?.full_name || "Unknown"}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Created</div>
                        <div className="font-medium">
                          {formatDistanceToNow(new Date(job.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Completion</span>
                        <span className="text-sm font-medium">{job.progress}%</span>
                      </div>
                      <Progress value={job.progress} className="h-2" />
                    </div>

                    {/* Error Message */}
                    {job.error_message && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-red-800">{job.error_message}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/jobs/${job.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/jobs/${job.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </Link>
                        </DropdownMenuItem>

                        {job.status === "completed" && (
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/jobs/${job.id}/export`}>
                              <Download className="mr-2 h-4 w-4" />
                              Export Data
                            </Link>
                          </DropdownMenuItem>
                        )}

                        {job.status === "failed" && (
                          <DropdownMenuItem onClick={() => retryJob(job.id)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Retry Job
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />

                        <DropdownMenuItem onClick={() => deleteJob(job.id)} className="text-red-600 focus:text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Job
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
