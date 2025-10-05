"use client"

import { useState, useEffect } from "react"
import { apiFetch } from "@/lib/backend-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, Play, Download, Plus, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react"
import Link from "next/link"

interface DashboardStats {
  schemas: number
  jobs: number
  completedJobs: number
  exports: number
}

interface RecentActivity {
  id: string
  type: "schema" | "job" | "export"
  title: string
  status?: string
  created_at: string
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({ schemas: 0, jobs: 0, completedJobs: 0, exports: 0 })
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      // Load core stats from backend endpoints
      // Schemas
      const schemasRes = await apiFetch("/api/v1/schemas/")
      const schemas = schemasRes.ok ? await schemasRes.json() : []

      // Jobs: Derive counts + completed
      // If a list endpoint doesn't exist, we can synthesize from recent jobs on the server later.
      // For now, try fetching a few latest job IDs if available via a future endpoint; fallback to 0s.
      let jobsCount = 0
      let completedJobs = 0
      try {
        const jobsLatest = await apiFetch("/api/v1/jobs/recent")
        if (jobsLatest.ok) {
          const jobs = await jobsLatest.json()
          jobsCount = jobs.length
          completedJobs = jobs.filter((j: any) => j.status === "completed").length
        }
      } catch {
        // ignore
      }

      // Exports: best-effort until export list exists
      let exportsCount = 0
      try {
        const expRes = await apiFetch("/api/v1/exports/recent")
        if (expRes.ok) {
          const exps = await expRes.json()
          exportsCount = exps.length
        }
      } catch {
        // ignore
      }

      setStats({
        schemas: Array.isArray(schemas) ? schemas.length : 0,
        jobs: jobsCount,
        completedJobs,
        exports: exportsCount,
      })

      // Recent activity (best-effort from available endpoints)
      const activities: RecentActivity[] = []
      if (Array.isArray(schemas)) {
        schemas.slice(0, 3).forEach((s: any) =>
          activities.push({
            id: String(s.id),
            type: "schema",
            title: `Schema "${s.name ?? s.title ?? "Untitled"}" created`,
            created_at: s.created_at ?? new Date().toISOString(),
          }),
        )
      }
      // If recent jobs were available
      try {
        const jobsLatest = await apiFetch("/api/v1/jobs/recent")
        if (jobsLatest.ok) {
          const jobs = await jobsLatest.json()
          jobs.slice(0, 3).forEach((j: any) =>
            activities.push({
              id: String(j.id),
              type: "job",
              title: `Generation job for "${j.schema_name ?? j.name ?? "schema"}"`,
              status: j.status,
              created_at: j.created_at ?? new Date().toISOString(),
            }),
          )
        }
      } catch {}

      // If recent exports were available
      try {
        const expRes = await apiFetch("/api/v1/exports/recent")
        if (expRes.ok) {
          const exps = await expRes.json()
          exps.slice(0, 2).forEach((e: any) =>
            activities.push({
              id: String(e.id),
              type: "export",
              title: `Data exported as ${(e.format ?? "").toString().toUpperCase()}`,
              created_at: e.created_at ?? new Date().toISOString(),
            }),
          )
        }
      } catch {}

      activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setRecentActivity(activities.slice(0, 5))
    } catch (error) {
      console.error("Error loading dashboard data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "running":
        return <Clock className="h-4 w-4 text-blue-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "schema":
        return <FileText className="h-4 w-4 text-blue-500" />
      case "job":
        return <Play className="h-4 w-4 text-green-500" />
      case "export":
        return <Download className="h-4 w-4 text-purple-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">
          Generate realistic synthetic client profiles with AI-powered data generation and export capabilities.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Schemas</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.schemas}</div>
            <p className="text-xs text-muted-foreground">Data structures designed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Generation Jobs</CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.jobs}</div>
            <p className="text-xs text-muted-foreground">{stats.completedJobs} completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Exports</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.exports}</div>
            <p className="text-xs text-muted-foreground">Data files generated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.jobs > 0 ? Math.round((stats.completedJobs / stats.jobs) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">Job completion rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Schema Studio
            </CardTitle>
            <CardDescription>Design and manage your data schemas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/dashboard/schemas">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Schema
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/schemas">View All</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Job Console
            </CardTitle>
            <CardDescription>Monitor generation progress and results</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/jobs">View Jobs</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Exports
            </CardTitle>
            <CardDescription>Download and manage your generated data</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/exports">View Exports</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest schemas, jobs, and exports</CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivity.length > 0 ? (
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={`${activity.type}-${activity.id}`} className="flex items-center gap-3 p-3 rounded-lg border">
                  {getActivityIcon(activity.type)}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(activity.created_at).toLocaleDateString()} at{" "}
                      {new Date(activity.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                  {activity.status && (
                    <div className="flex items-center gap-2">
                      {getStatusIcon(activity.status)}
                      <Badge variant={activity.status === "completed" ? "default" : "secondary"}>
                        {activity.status}
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">No activity yet. Create your first schema to get started!</p>
              <Button asChild>
                <Link href="/dashboard/schemas/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Schema
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
