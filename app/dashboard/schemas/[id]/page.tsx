"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { SchemaEditor } from "@/components/schema-editor"
import { useParams, useRouter } from "next/navigation"

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
      <div className="max-w-7xl mx-auto text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {error === "Invalid schema ID format" ? "Invalid Schema ID" : "Schema Not Found"}
        </h1>
        <p className="text-gray-600 mb-4">
          {error === "Invalid schema ID format"
            ? "The schema ID format is invalid. Please check the URL and try again."
            : "The schema you're looking for doesn't exist or you don't have access to it."}
        </p>
        <button
          onClick={() => router.push("/dashboard/schema")}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Back to Schemas
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Schema: {schema.name}</h1>
        <p className="text-gray-600">{schema.description}</p>
      </div>

      <SchemaEditor schema={schema} />
    </div>
  )
}
