"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, FileText, Trash2 } from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toast } from "sonner"
import { UI_CONFIG } from "@/lib/ui-config"

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
  job_id?: string
}

export default function ExportsPage() {
  const [exports, setExports] = useState<Export[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; exportId: string; exportName: string }>({
    open: false,
    exportId: "",
    exportName: "",
  })

  useEffect(() => {
    loadExports()
  }, [])

  const loadExports = async () => {
    try {
      console.log('[Exports] Loading exports...')
      
      const response = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'exports',
          columns: 'exports.id, exports.name, exports.format, exports.status, exports.file_url, exports.file_size, exports.record_count, exports.created_at, exports.error_message, exports.job_id',
          orderBy: { column: 'exports.created_at', ascending: false }
        })
      })

      if (!response.ok) {
        throw new Error('Failed to load exports')
      }

      const result = await response.json()
      console.log('[Exports] Received', (result.data || []).length, 'exports')
      
      // Transform to match expected structure (we'll fetch job/schema names separately if needed)
      const exportsData = result.data || []
      setExports(exportsData)
    } catch (error) {
      console.error("Error loading exports:", error)
      toast.error("Failed to load exports")
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

  const deleteExport = async (exportId: string, exportName: string) => {
    setDeleteDialog({ open: true, exportId, exportName })
  }

  const confirmDelete = async () => {
    try {
      const response = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          table: 'exports',
          where: { op: 'eq', column: 'id', value: deleteDialog.exportId }
        })
      })

      if (!response.ok) {
        throw new Error('Failed to delete export')
      }

      setExports(exports.filter((e) => e.id !== deleteDialog.exportId))
      toast.success(`Export "${deleteDialog.exportName}" deleted successfully`)
    } catch (error) {
      console.error("Error deleting export:", error)
      toast.error("Failed to delete export")
    } finally {
      setDeleteDialog({ open: false, exportId: "", exportName: "" })
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
      <div className={`max-w-7xl mx-auto ${UI_CONFIG.spacing.page.full}`}>
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-6"></div>
          <div className={`grid ${UI_CONFIG.grid.cols.default} ${UI_CONFIG.grid.gap.medium}`}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`max-w-7xl mx-auto ${UI_CONFIG.spacing.page.full}`}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Exports</h1>
        <p className="text-muted-foreground">Manage and download your exported data files</p>
      </div>

      {exports.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText className="h-12 w-12" />
            </EmptyMedia>
            <EmptyTitle>No exports yet</EmptyTitle>
            <EmptyDescription>
              Create your first export from a completed job to download your generated data
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="lg">
              <Link href="/dashboard/jobs">View Jobs</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className={`grid ${UI_CONFIG.grid.cols.default} ${UI_CONFIG.grid.gap.medium}`}>
          {exports.map((exportRecord) => (
            <Card key={exportRecord.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{exportRecord.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {exportRecord.format.toUpperCase()} Export
                    </CardDescription>
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
                    <Button variant="ghost" size="sm" onClick={() => deleteExport(exportRecord.id, exportRecord.name)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
        title="Delete Export"
        description={`Are you sure you want to delete "${deleteDialog.exportName}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
