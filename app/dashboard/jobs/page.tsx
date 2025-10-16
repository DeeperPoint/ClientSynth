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
  Sparkles,
  TrendingUp,
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
import { UI_CONFIG } from "@/lib/ui-config"

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
    // Fallback polling (realtime channel not available post-migration)
    const intervalId = setInterval(loadJobs, 5000)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    filterAndSortJobs()
  }, [jobs, statusFilter, searchQuery, sortField, sortOrder, dateFilter])

  const loadJobs = async () => {
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, name, status, progress, total_records, generated_records, created_at, updated_at, error_message, config"
        )
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
    if (selectedJobs.length === filteredJobs.length && filteredJobs.length > 0) {
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
      case "running":
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
      processing: jobs.filter((j) => j.status === "processing" || j.status === "running").length,
      completed: jobs.filter((j) => j.status === "completed").length,
      failed: jobs.filter((j) => j.status === "failed").length,
      totalRecords: jobs.reduce((sum, job) => sum + job.total_records, 0),
      generatedRecords: jobs.reduce((sum, job) => sum + job.generated_records, 0),
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <div className={`max-w-7xl mx-auto ${UI_CONFIG.spacing.page.full}`}>
          <div className={`animate-pulse ${UI_CONFIG.spacing.section.large}`}>
            <div className="h-12 bg-gradient-to-r from-primary/20 to-accent/20 rounded-2xl w-1/3"></div>
            <div className={`grid grid-cols-1 md:grid-cols-6 ${UI_CONFIG.grid.gap.medium}`}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-32 bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl animate-pulse"
                ></div>
              ))}
            </div>
            <div className={UI_CONFIG.spacing.section.medium}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-40 bg-gradient-to-r from-primary/5 to-accent/5 rounded-2xl animate-pulse"
                ></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const stats = getJobStats()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className={`max-w-7xl mx-auto ${UI_CONFIG.spacing.page.full}`}>
        <div className="flex items-center justify-between mb-12">
          <div className={UI_CONFIG.spacing.section.small}>
            <div className={`flex items-center ${UI_CONFIG.spacing.card.gap}`}>
              <div className="p-3 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-xl">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-black bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse">
                  Job Console
                </h1>
                <p className="text-xl text-muted-foreground mt-2">Monitor and manage your data generation jobs</p>
              </div>
            </div>
          </div>
          <div className={`flex items-center ${UI_CONFIG.spacing.card.gap}`}>
            <Button
              variant="outline"
              onClick={refreshJobs}
              disabled={isRefreshing}
              className="border-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 bg-transparent"
            >
              <RefreshCw className={`mr-2 h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              asChild
              className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-105 px-8 py-6 text-lg font-semibold"
            >
              <Link href="/dashboard/schemas">
                <Play className="mr-3 h-5 w-5" />
                Create New Job
              </Link>
            </Button>
          </div>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-6 ${UI_CONFIG.grid.gap.medium} mb-12`}>
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:scale-105 group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <CardContent className="pt-8 pb-8 relative z-10">
              <div className="text-center">
                <TrendingUp className="h-8 w-8 text-primary mx-auto mb-3" />
                <div className="text-3xl font-black text-foreground mb-1">{stats.total}</div>
                <div className="text-sm font-medium text-muted-foreground">Total Jobs</div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-50/80 to-amber-100/40 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:scale-105 group border-amber-200/50">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-200/20 to-amber-300/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <CardContent className="pt-8 pb-8 relative z-10">
              <div className="text-center">
                <Clock className="h-8 w-8 text-amber-600 mx-auto mb-3" />
                <div className="text-3xl font-black text-amber-700 mb-1">{stats.pending}</div>
                <div className="text-sm font-medium text-amber-600">Pending</div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-50/80 to-blue-100/40 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:scale-105 group border-blue-200/50">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-200/20 to-blue-300/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <CardContent className="pt-8 pb-8 relative z-10">
              <div className="text-center">
                <Zap className="h-8 w-8 text-blue-600 mx-auto mb-3 animate-pulse" />
                <div className="text-3xl font-black text-blue-700 mb-1">{stats.processing}</div>
                <div className="text-sm font-medium text-blue-600">Processing</div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:scale-105 group border-emerald-200/50">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-200/20 to-emerald-300/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <CardContent className="pt-8 pb-8 relative z-10">
              <div className="text-center">
                <CheckCircle className="h-8 w-8 text-emerald-600 mx-auto mb-3" />
                <div className="text-3xl font-black text-emerald-700 mb-1">{stats.completed}</div>
                <div className="text-sm font-medium text-emerald-600">Completed</div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-red-50/80 to-red-100/40 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:scale-105 group border-red-200/50">
            <div className="absolute inset-0 bg-gradient-to-br from-red-200/20 to-red-300/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <CardContent className="pt-8 pb-8 relative z-10">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-3" />
                <div className="text-3xl font-black text-red-700 mb-1">{stats.failed}</div>
                <div className="text-sm font-medium text-red-600">Failed</div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-purple-50/80 to-purple-100/40 backdrop-blur-xl shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:scale-105 group border-purple-200/50">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-200/20 to-purple-300/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <CardContent className="pt-8 pb-8 relative z-10">
              <div className="text-center">
                <TrendingUp className="h-8 w-8 text-purple-600 mx-auto mb-3" />
                <div className="text-3xl font-black text-purple-700 mb-1">
                  {((stats.generatedRecords / Math.max(stats.totalRecords, 1)) * 100).toFixed(0)}%
                </div>
                <div className="text-sm font-medium text-purple-600">Overall Progress</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className={`mb-12 border-0 bg-gradient-to-r from-white/90 to-white/70 backdrop-blur-2xl shadow-2xl`}>
          <CardContent className="pt-8 pb-8">
            <div className={`flex flex-col lg:flex-row ${UI_CONFIG.grid.gap.medium}`}>
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary" />
                  <Input
                    placeholder="Search jobs, schemas, creators, or job IDs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 h-14 text-lg border-2 border-primary/20 focus:border-primary/50 bg-white/80 backdrop-blur-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-primary/20">
                  <Filter className="h-5 w-5 text-primary" />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-36 border-0 bg-transparent">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="running">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-primary/20">
                  <Calendar className="h-5 w-5 text-primary" />
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-36 border-0 bg-transparent">
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

                <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-primary/20">
                  <Select
                    value={`${sortField}-${sortOrder}`}
                    onValueChange={(value) => {
                      const [field, order] = value.split("-") as [SortField, SortOrder]
                      setSortField(field)
                      setSortOrder(order)
                    }}
                  >
                    <SelectTrigger className="w-44 border-0 bg-transparent">
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

              {selectedJobs.length > 0 && (
                <div
                  className={`mt-8 ${UI_CONFIG.spacing.card.padding} bg-gradient-to-r from-primary/10 to-accent/10 border-2 border-primary/30 ${UI_CONFIG.border.radius.large} backdrop-blur-sm`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                      {selectedJobs.length} job(s) selected
                    </span>
                    <div className={`flex items-center ${UI_CONFIG.spacing.card.gap}`}>
                      <Button
                        size="lg"
                        variant="outline"
                        onClick={bulkRetryJobs}
                        className="border-2 border-primary/30 hover:bg-primary/10 bg-transparent"
                      >
                        <RotateCcw className="mr-2 h-5 w-5" />
                        Retry Selected
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        onClick={bulkDeleteJobs}
                        className="border-2 border-red-300 hover:bg-red-50 text-red-600 bg-transparent"
                      >
                        <Trash2 className="mr-2 h-5 w-5" />
                        Delete Selected
                      </Button>
                      <Button
                        size="lg"
                        variant="ghost"
                        onClick={() => setSelectedJobs([])}
                        className="hover:bg-white/50"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {filteredJobs.length === 0 ? (
          <Card className={`border-0 bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-2xl shadow-2xl`}>
            <CardContent className="pt-16 pb-16 text-center">
              <div
                className={`${UI_CONFIG.spacing.card.padding} ${UI_CONFIG.border.radius.large} bg-gradient-to-br from-primary/10 to-accent/10 w-fit mx-auto mb-6`}
              >
                <Play className="mx-auto h-16 w-16 text-primary" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">
                {jobs.length === 0 ? "No jobs yet" : "No jobs match your filters"}
              </h3>
              <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
                {jobs.length === 0
                  ? "Create your first data generation job from a schema"
                  : "Try adjusting your search or filter criteria"}
              </p>
              {jobs.length === 0 && (
                <Button
                  asChild
                  className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-105 px-8 py-6 text-lg font-semibold"
                >
                  <Link href="/dashboard/schemas">Browse Schemas</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className={UI_CONFIG.spacing.section.large}>
            <Card className={`border-0 bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-2xl shadow-xl`}>
              <CardContent className="pt-6 pb-6">
                <div className={`flex items-center ${UI_CONFIG.spacing.card.gap}`}>
                  <Checkbox
                    checked={selectedJobs.length === filteredJobs.length && filteredJobs.length > 0}
                    onCheckedChange={toggleSelectAll}
                    className="scale-125"
                  />
                  <span className="text-lg font-bold text-foreground">Select All ({filteredJobs.length} jobs)</span>
                </div>
              </CardContent>
            </Card>

            {filteredJobs.map((job) => (
              <Card
                key={job.id}
                className={`border-0 bg-gradient-to-r from-white/90 to-white/70 backdrop-blur-2xl shadow-2xl hover:shadow-3xl ${UI_CONFIG.animation.transition} transform hover:scale-[1.02] ${
                  selectedJobs.includes(job.id)
                    ? "ring-4 ring-primary/40 bg-gradient-to-r from-primary/5 to-accent/5"
                    : ""
                }`}
              >
                <CardContent className="pt-8 pb-8">
                  <div className={`flex items-start ${UI_CONFIG.grid.gap.medium}`}>
                    <Checkbox
                      checked={selectedJobs.includes(job.id)}
                      onCheckedChange={() => toggleJobSelection(job.id)}
                      className="mt-2 scale-125"
                    />

                    <div className="flex-1">
                      <div className={`flex items-center ${UI_CONFIG.spacing.card.gap} mb-4`}>
                        <h3 className="text-2xl font-bold text-foreground">{job.name}</h3>
                        <Badge
                          className={`${getStatusColor(job.status)} flex items-center gap-2 border-2 px-4 py-2 text-sm font-semibold`}
                        >
                          {getStatusIcon(job.status)}
                          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                        </Badge>
                        {job.config?.text_model && (
                          <Badge className="bg-gradient-to-r from-accent/20 to-accent/10 text-accent border-2 border-accent/30 px-4 py-2 font-semibold">
                            {job.config.text_model.split("/").pop()}
                          </Badge>
                        )}
                      </div>

                      <div className={`grid grid-cols-1 md:grid-cols-4 ${UI_CONFIG.spacing.card.gap} mb-4`}>
                        <div>
                          <div className="text-sm text-muted-foreground">Schema</div>
                          <Link
                            href={`/dashboard/schemas/${job.schemas?.id}`}
                            className="font-medium text-primary hover:text-primary/80 transition-colors"
                          >
                            {job.schemas?.name}
                          </Link>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Progress</div>
                          <div className="font-medium text-foreground">
                            {job.generated_records.toLocaleString()} / {job.total_records.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Created By</div>
                          <div className="font-medium text-foreground">{job.profiles?.full_name || "Unknown"}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Created</div>
                          <div className="font-medium text-foreground">
                            {formatDistanceToNow(new Date(job.created_at), {
                              addSuffix: true,
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-lg font-semibold text-muted-foreground">Completion Progress</span>
                          <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                            {job.progress}%
                          </span>
                        </div>
                        <Progress value={job.progress} className="h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r from-primary to-accent ${UI_CONFIG.animation.transition} rounded-full`}
                            style={{ width: `${job.progress}%` }}
                          />
                        </Progress>
                      </div>

                      {job.error_message && (
                        <div
                          className={`bg-destructive/5 border border-destructive/20 ${UI_CONFIG.border.radius.large} ${UI_CONFIG.spacing.card.padding} mb-4`}
                        >
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                            <div className="text-sm text-destructive">{job.error_message}</div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={`flex items-center ${UI_CONFIG.spacing.card.gap}`}>
                      <Button
                        variant="outline"
                        size="lg"
                        asChild
                        className="border-2 border-primary/30 hover:bg-primary/10 bg-transparent"
                      >
                        <Link href={`/dashboard/jobs/${job.id}`}>
                          <Eye className="h-5 w-5" />
                        </Link>
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="lg"
                            className="border-2 border-primary/30 hover:bg-primary/10 bg-transparent"
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/jobs/${job.id}`}>
                              <Eye className="mr-2 h-5 w-5" />
                              View Details
                            </Link>
                          </DropdownMenuItem>

                          {job.status === "completed" && (
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/jobs/${job.id}/export`}>
                                <Download className="mr-2 h-5 w-5" />
                                Export Data
                              </Link>
                            </DropdownMenuItem>
                          )}

                          {job.status === "failed" && (
                            <DropdownMenuItem onClick={() => retryJob(job.id)}>
                              <RotateCcw className="mr-2 h-5 w-5" />
                              Retry Job
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            onClick={() => deleteJob(job.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-5 w-5" />
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
    </div>
  )
}
