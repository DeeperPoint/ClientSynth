"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { SchemaEditor } from "@/components/schema-editor"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface Schema {
  id: string
  name: string
  description: string
  schema_definition: any
  created_at: string
  created_by: string
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

export default function EditSchemaPage() {
  const [schema, setSchema] = useState<Schema | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!params.id || typeof params.id !== "string") {
      setError("Invalid schema ID format")
      setIsLoading(false)
      return
    }

    if (!isValidUUID(params.id)) {
      setError("Invalid schema ID format")
      setIsLoading(false)
      return
    }

    loadSchema()
  }, [params]) // Fixed dependency array to use params instead of params.id

  const loadSchema = async () => {
    try {
      if (!params.id || typeof params.id !== "string") {
        throw new Error("Invalid schema ID")
      }

      console.log("[v0] Loading schema with ID:", params.id)
      const { data, error } = await supabase.from("schemas").select("*").eq("id", params.id).single()

      if (error) throw error
      console.log("[v0] Schema loaded successfully:", data)
      setSchema(data)
    } catch (error) {
      console.error("[v0] Error loading schema:", error)
      setError("Failed to load schema")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (error || !schema) {
    return (
      <div className="max-w-7xl mx-auto text-center py-20">
        <div className="glass-effect rounded-2xl p-12 max-w-md mx-auto">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-destructive to-destructive/70 bg-clip-text text-transparent mb-4">
            {error === "Invalid schema ID format" ? "Invalid Schema ID" : "Schema Not Found"}
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            {error === "Invalid schema ID format"
              ? "The schema ID format is invalid. Please check the URL and try again."
              : "The schema you're looking for doesn't exist or you don't have access to it."}
          </p>
          <Button
            onClick={() => router.push("/dashboard/schemas")}
            size="lg"
            className="gradient-primary text-white shadow-medium"
          >
            Back to Schemas
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <SchemaEditor schema={schema} />
    </div>
  )
}
