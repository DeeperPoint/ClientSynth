"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
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
  const supabase = createClient()

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      // Get current user and tenant
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Load stats
      const [schemasResult, jobsResult, exportsResult] = await Promise.all([
        supabase.from("schemas").select("id", { count: "exact" }),
        supabase.from("jobs").select("id, status", { count: "exact" }),
        supabase.from("exports").select("id", { count: "exact" }),
      ])

      const completedJobs = jobsResult.data?.filter((job) => job.status === "completed").length || 0

      setStats({
        schemas: schemasResult.count || 0,
        jobs: jobsResult.count || 0,
        completedJobs,
        exports: exportsResult.count || 0,
      })

      // Load recent activity
      const { data: recentSchemas } = await supabase
        .from("schemas")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
        .limit(3)

      const { data: recentJobs } = await supabase
        .from("jobs")
        .select("id, schema_name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(3)

      const { data: recentExports } = await supabase
        .from("exports")
        .select("id, job_id, format, created_at")
        .order("created_at", { ascending: false })
        .limit(2)

      const activities: RecentActivity[] = [
        ...(recentSchemas?.map((schema) => ({
          id: schema.id,
          type: "schema" as const,
          title: `Schema "${schema.name}" created`,
          created_at: schema.created_at,
        })) || []),
        ...(recentJobs?.map((job) => ({
          id: job.id,
          type: "job" as const,
          title: `Generation job for "${job.schema_name}"`,
          status: job.status,
          created_at: job.created_at,
        })) || []),
        ...(recentExports?.map((exp) => ({
          id: exp.id,
          type: "export" as const,
          title: `Data exported as ${exp.format.toUpperCase()}`,
          created_at: exp.created_at,
        })) || []),
      ]

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
