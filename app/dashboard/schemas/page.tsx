"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
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

interface Schema {
  id: string
  name: string
  description: string
  schema_definition: any
  created_at: string
  created_by: string
  profiles: {
    full_name: string
  }
}

export default function SchemasPage() {
  const [schemas, setSchemas] = useState<Schema[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    loadSchemas()
  }, [])

  const loadSchemas = async () => {
    try {
      const { data, error } = await supabase
        .from("schemas")
        .select(`
          id,
          name,
          description,
          schema_definition,
          created_at,
          created_by,
          profiles(full_name)
        `)
        .order("created_at", { ascending: false })

      if (error) throw error
      setSchemas(data || [])
    } catch (error) {
      console.error("Error loading schemas:", error)
      toast.error("Failed to load schemas")
    } finally {
      setIsLoading(false)
    }
  }

  const deleteSchema = async (schemaId: string, schemaName: string) => {
    if (!confirm(`Are you sure you want to delete "${schemaName}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(schemaId)
    try {
      const { error } = await supabase.from("schemas").delete().eq("id", schemaId)

      if (error) throw error

      setSchemas(schemas.filter((s) => s.id !== schemaId))
      toast.success(`Schema "${schemaName}" deleted successfully`)
    } catch (error) {
      console.error("Error deleting schema:", error)
      toast.error("Failed to delete schema")
    } finally {
      setDeletingId(null)
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
      <div className="max-w-7xl mx-auto p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-muted rounded-lg w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-muted rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-10">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Schema Studio
          </h1>
          <p className="text-lg text-muted-foreground">Design and manage your synthetic data generation schemas</p>
        </div>
        <Button
          asChild
          size="lg"
          className="gradient-primary text-white shadow-medium hover:shadow-soft transition-all duration-200"
        >
          <Link href="/dashboard/schema/new">
            <Plus className="mr-2 h-5 w-5" />
            Create Schema
          </Link>
        </Button>
      </div>

      {schemas.length === 0 ? (
        <div className="text-center py-20">
          <div className="glass-effect rounded-2xl p-12 max-w-md mx-auto">
            <FileText className="mx-auto h-16 w-16 text-primary mb-6" />
            <h3 className="text-2xl font-semibold text-foreground mb-3">No schemas yet</h3>
            <p className="text-muted-foreground mb-8 text-lg">
              Get started by creating your first data generation schema
            </p>
            <Button asChild size="lg" className="gradient-primary text-white shadow-medium">
              <Link href="/dashboard/schema/new">
                <Plus className="mr-2 h-5 w-5" />
                Create Your First Schema
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {schemas.map((schema) => (
            <Card
              key={schema.id}
              className="group hover:shadow-medium transition-all duration-300 border-0 shadow-soft bg-card/50 backdrop-blur-sm"
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <CardTitle className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
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
                          Edit Schema
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
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
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
                  <div className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg border border-primary/20">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">AI Image Generation</span>
                  </div>
                )}

                <div className="text-sm text-muted-foreground">
                  Created by {schema.profiles?.full_name || "Unknown"}
                </div>

                <div className="flex gap-3 pt-2">
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
    </div>
  )
}
