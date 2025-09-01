"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, FileText, Calendar, Users, Settings } from "lucide-react"
import Link from "next/link"

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
    } finally {
      setIsLoading(false)
    }
  }

  const getFieldCount = (schemaDefinition: any) => {
    return schemaDefinition?.fields?.length || 0
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Schema Studio</h1>
          <p className="text-gray-600">Design and manage your data generation schemas</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/schema/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Schema
          </Link>
        </Button>
      </div>

      {schemas.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No schemas yet</h3>
          <p className="text-gray-600 mb-6">Get started by creating your first data schema</p>
          <Button asChild>
            <Link href="/dashboard/schema/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Schema
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {schemas.map((schema) => (
            <Card key={schema.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{schema.name}</CardTitle>
                    <CardDescription className="mt-1">{schema.description}</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <Users className="mr-2 h-4 w-4" />
                    {getFieldCount(schema.schema_definition)} fields
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="mr-2 h-4 w-4" />
                    Created {new Date(schema.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <span>By {schema.profiles?.full_name || "Unknown"}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/dashboard/schemas/${schema.id}`}>Edit</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="flex-1 bg-transparent">
                    <Link href={`/dashboard/schemas/${schema.id}/generate`}>Generate</Link>
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
