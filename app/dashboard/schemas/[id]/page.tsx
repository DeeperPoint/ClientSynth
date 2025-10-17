"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Edit, Play, FileText, Users, Calendar, Sparkles } from "lucide-react"
import { ExampleFilesManager } from "@/components/example-files-manager"
import { toast } from "sonner"
import Link from "next/link"

interface Schema {
  id: string
  name: string
  description: string
  schema_definition: {
    fields: Array<{
      id: string
      name: string
      type: string
      description: string
      required: boolean
    }>
  }
  created_at: string
  created_by: string
  profiles?: {
    full_name?: string
  }
}

export default function SchemaEditPage() {
  const params = useParams()
  const router = useRouter()
  const schemaId = params.id as string

  const [schema, setSchema] = useState<Schema | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (schemaId) {
      loadSchema()
    }
  }, [schemaId])

  const loadSchema = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'schemas',
          columns: 'id,name,description,schema_definition,created_at,created_by',
          where: { op: 'eq', column: 'id', value: schemaId },
          join: {
            table: 'profiles',
            on: 'schemas.created_by = profiles.id',
            columns: 'full_name'
          }
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to load schema')
      }

      const data = await response.json()
      if (data.data && data.data.length > 0) {
        setSchema(data.data[0])
      } else {
        setError("Schema not found")
      }
    } catch (error) {
      console.error("Error loading schema:", error)
      setError(error instanceof Error ? error.message : "Failed to load schema")
    } finally {
      setIsLoading(false)
    }
  }

  const getFieldCount = () => {
    return schema?.schema_definition?.fields?.length || 0
  }

  const hasImageFields = () => {
    return schema?.schema_definition?.fields?.some((field: any) => field.type === "image") || false
  }

  const getFieldTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      text: "Text",
      long_text: "Long Text",
      email: "Email",
      phone: "Phone",
      name: "Name",
      company: "Company",
      address: "Address",
      city: "City",
      country: "Country",
      number: "Number",
      date: "Date",
      boolean: "Boolean",
      select: "Select",
      url: "URL",
      job_title: "Job Title",
      industry: "Industry",
      image: "Image",
      pdf: "PDF"
    }
    return typeMap[type] || type
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-muted rounded-lg w-1/3"></div>
          <div className="h-64 bg-muted rounded-xl"></div>
        </div>
      </div>
    )
  }

  if (error || !schema) {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <Alert variant="destructive">
          <AlertDescription>{error || "Schema not found"}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {schema.name}
            </h1>
            <p className="text-lg text-muted-foreground mt-2">{schema.description}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link href={`/dashboard/schemas/${schema.id}/generate`}>
              <Play className="h-4 w-4 mr-2" />
              Generate Data
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/dashboard/schema/edit/${schema.id}`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Schema
            </Link>
          </Button>
        </div>
      </div>

      {/* Schema Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Schema Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-medium">{getFieldCount()} fields</span>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-accent" />
              <span>{new Date(schema.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span>Created by {schema.profiles?.full_name || "Unknown"}</span>
            </div>
          </div>

          {hasImageFields() && (
            <div className="mt-4 flex items-center space-x-2 p-3 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg border border-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">AI Image Generation Enabled</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schema Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Schema Fields</CardTitle>
          <CardDescription>Fields defined in this schema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {schema.schema_definition.fields.map((field, index) => (
              <div key={field.id || index} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{field.name}</span>
                    <Badge variant="secondary">{getFieldTypeLabel(field.type)}</Badge>
                    {field.required && (
                      <Badge variant="destructive" className="text-xs">Required</Badge>
                    )}
                  </div>
                  {field.description && (
                    <p className="text-sm text-muted-foreground mt-1">{field.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Example Files Manager */}
      <ExampleFilesManager
        schemaId={schemaId}
        schemaFieldNames={schema.schema_definition.fields.map(f => f.name)}
      />
    </div>
  )
}