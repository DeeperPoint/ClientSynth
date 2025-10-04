"use client"

import { useState, useEffect } from "react"
import { apiFetch } from "@/lib/backend-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, FileText, Trash2 } from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"

interface Export {
  id: string
  name: string
  format: string
  status: string
  file_url?: string
  file_size?: number
  record_count?: number
  created_at: string
  error_message?: string
  jobs: {
    id: string
    name: string
  }
  schemas: {
    name: string
  }
}

export default function ExportsPage() {
  const [exports, setExports] = useState<Export[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // TODO: Replace this page's data with backend endpoints when available

  useEffect(() => {
    loadExports()
  }, [])

  const loadExports = async () => {
    try {
      // Try a backend endpoint for listing exports; fallback to empty list
      const res = await apiFetch("/api/v1/exports/recent")
      if (res.ok) {
        const items = await res.json()
        setExports(items || [])
      } else {
        setExports([])
      }
    } catch (error) {
      console.error("Error loading exports:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const downloadExport = (exportRecord: Export) => {
    if (!exportRecord.file_url) return

    const link = document.createElement("a")
    link.href = exportRecord.file_url
    link.download = `${exportRecord.name}.${exportRecord.format}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const deleteExport = async (exportId: string) => {
    if (!confirm("Are you sure you want to delete this export?")) return

    try {
      const res = await apiFetch(`/api/v1/exports/${exportId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete export")
      loadExports()
    } catch (error) {
      console.error("Error deleting export:", error)
      alert("Failed to delete export")
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown"
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i]
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Exports</h1>
        <p className="text-gray-600">Manage and download your exported data files</p>
      </div>

      {exports.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No exports yet</h3>
            <p className="text-gray-600 mb-6">Create your first export from a completed job</p>
            <Button asChild>
              <Link href="/dashboard/jobs">View Jobs</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exports.map((exportRecord) => (
            <Card key={exportRecord.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{exportRecord.name}</CardTitle>
                    <CardDescription className="mt-1">From: {exportRecord.jobs?.name}</CardDescription>
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
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Format:</span>
                      <div className="font-medium">{exportRecord.format.toUpperCase()}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Records:</span>
                      <div className="font-medium">{exportRecord.record_count?.toLocaleString() || "Unknown"}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Size:</span>
                      <div className="font-medium">{formatFileSize(exportRecord.file_size)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Created:</span>
                      <div className="font-medium">
                        {formatDistanceToNow(new Date(exportRecord.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>

                  {exportRecord.error_message && (
                    <div className="bg-red-50 border border-red-200 rounded p-2">
                      <p className="text-xs text-red-800">{exportRecord.error_message}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {exportRecord.status === "completed" && exportRecord.file_url && (
                      <Button size="sm" onClick={() => downloadExport(exportRecord)} className="flex-1">
                        <Download className="mr-2 h-3 w-3" />
                        Download
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => deleteExport(exportRecord.id)}>
                      <Trash2 className="h-3 w-3" />
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
