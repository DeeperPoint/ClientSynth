"use client"

import { useState, useEffect } from "react"
// Use API routes to read/write (Postgres)
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, FileText, Calendar, Users, MoreVertical, Edit, Trash2, Play, Sparkles } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { UI_CONFIG } from "@/lib/ui-config"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ConfirmDialog } from "@/components/confirm-dialog"

interface Schema {
  id: string
  name: string
  description: string
  schema_definition: any
  created_at: string
  created_by: string
  profiles?: {
    full_name?: string
  }
}

export default function SchemasPage() {
  const [schemas, setSchemas] = useState<Schema[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; schemaId: string; schemaName: string }>({
    open: false,
    schemaId: "",
    schemaName: "",
  })

  useEffect(() => {
    loadSchemas()
  }, [])

  const loadSchemas = async () => {
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'schemas',
          columns: 'id,name,description,schema_definition,created_at,created_by',
          orderBy: { column: 'created_at', ascending: false },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Failed to load schemas')
      setSchemas(json.data || [])
    } catch (error) {
      console.error("Error loading schemas:", error)
      toast.error("Failed to load schemas")
    } finally {
      setIsLoading(false)
    }
  }

  const deleteSchema = async (schemaId: string, schemaName: string) => {
    setDeleteDialog({ open: true, schemaId, schemaName })
  }

  const confirmDelete = async () => {
    setDeletingId(deleteDialog.schemaId)
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', table: 'schemas', where: { op: 'eq', column: 'id', value: deleteDialog.schemaId } }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || 'Delete failed')
      }

      setSchemas(schemas.filter((s) => s.id !== deleteDialog.schemaId))
      toast.success(`Schema "${deleteDialog.schemaName}" deleted successfully`)
    } catch (error) {
      console.error("Error deleting schema:", error)
      toast.error("Failed to delete schema")
    } finally {
      setDeletingId(null)
      setDeleteDialog({ open: false, schemaId: "", schemaName: "" })
    }
  }

  const getFieldCount = (schemaDefinition: any) => {
    return schemaDefinition?.fields?.length || 0
  }

  const hasImageFields = (schemaDefinition: any) => {
    return schemaDefinition?.fields?.some((field: any) => field.type === "image") || false
  }

  if (isLoading) {
    return (
      <div className={`max-w-7xl mx-auto ${UI_CONFIG.spacing.page.full}`}>
        <div className={`animate-pulse ${UI_CONFIG.spacing.section.medium}`}>
          <div className="h-10 bg-muted rounded-lg w-1/3"></div>
          <div className={`grid ${UI_CONFIG.grid.cols.default} ${UI_CONFIG.grid.gap.medium}`}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-muted rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`max-w-7xl mx-auto ${UI_CONFIG.spacing.page.full}`}>
      <div className="flex items-center justify-between mb-10">
        <div className={UI_CONFIG.spacing.section.small}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Schema Studio
          </h1>
          <p className="text-lg text-muted-foreground">Design and manage your synthetic data generation schemas</p>
        </div>
        <Button
          asChild
          size="lg"
          className={`gradient-primary text-white shadow-medium hover:shadow-soft ${UI_CONFIG.animation.transition}`}
        >
          <Link href="/dashboard/schema/new">
            <Plus className="mr-2 h-5 w-5" />
            Create Schema
          </Link>
        </Button>
      </div>

      {schemas.length === 0 ? (
        <Empty className="glass-effect border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText className="h-12 w-12 text-primary" />
            </EmptyMedia>
            <EmptyTitle>No schemas yet</EmptyTitle>
            <EmptyDescription>
              Get started by creating your first data generation schema to define the structure of your synthetic data
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="lg" className="gradient-primary text-white shadow-medium">
              <Link href="/dashboard/schema/new">
                <Plus className="mr-2 h-5 w-5" />
                Create Your First Schema
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className={`grid ${UI_CONFIG.grid.cols.default} ${UI_CONFIG.grid.gap.large}`}>
          {schemas.map((schema) => (
            <Card
              key={schema.id}
              className={`group hover:shadow-medium ${UI_CONFIG.animation.transition} border-0 shadow-soft bg-card/50 backdrop-blur-sm`}
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className={`${UI_CONFIG.spacing.section.small} flex-1`}>
                    <CardTitle
                      className={`text-xl font-semibold text-foreground group-hover:text-primary ${UI_CONFIG.animation.transition}`}
                    >
                      {schema.name}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground line-clamp-2">
                      {schema.description}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                        disabled={deletingId === schema.id}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/schemas/${schema.id}`} className="flex items-center">
                          <Edit className="mr-2 h-4 w-4" />
                          View Schema
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/schemas/${schema.id}/generate`} className="flex items-center">
                          <Play className="mr-2 h-4 w-4" />
                          Generate Data
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => deleteSchema(schema.id, schema.name)}
                        className="text-destructive focus:text-destructive"
                        disabled={deletingId === schema.id}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {deletingId === schema.id ? "Deleting..." : "Delete Schema"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className={UI_CONFIG.spacing.section.medium}>
                <div className={`grid grid-cols-2 ${UI_CONFIG.spacing.card.gap}`}>
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="font-medium">{getFieldCount(schema.schema_definition)} fields</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 text-accent" />
                    <span>{new Date(schema.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {hasImageFields(schema.schema_definition) && (
                  <div
                    className={`flex items-center space-x-2 ${UI_CONFIG.spacing.card.padding} bg-gradient-to-r from-primary/10 to-accent/10 ${UI_CONFIG.border.radius.medium} border border-primary/20`}
                  >
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">AI Image Generation</span>
                  </div>
                )}

                <div className="text-sm text-muted-foreground">
                  Created by {schema.profiles?.full_name || "Unknown"}
                </div>

                <div className={`flex ${UI_CONFIG.spacing.card.gap} pt-2`}>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="flex-1 border-primary/20 hover:bg-primary/5 bg-transparent"
                  >
                    <Link href={`/dashboard/schemas/${schema.id}`}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </Button>
                  <Button asChild size="sm" className="flex-1 gradient-accent text-white">
                    <Link href={`/dashboard/schemas/${schema.id}/generate`}>
                      <Play className="mr-2 h-4 w-4" />
                      Generate
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
        title="Delete Schema"
        description={`Are you sure you want to delete "${deleteDialog.schemaName}"? This action cannot be undone and will affect any jobs using this schema.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
