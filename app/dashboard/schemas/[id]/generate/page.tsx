"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Play, ArrowLeft } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

interface Schema {
  id: string
  name: string
  description: string
  schema_definition: any
}

export default function GenerateDataPage() {
  const [schema, setSchema] = useState<Schema | null>(null)
  const [jobName, setJobName] = useState("")
  const [totalRecords, setTotalRecords] = useState("100")
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadSchema()
  }, [params.id])

  const loadSchema = async () => {
    try {
      const { data, error } = await supabase.from("schemas").select("*").eq("id", params.id)

      if (error) throw error

      if (!data || data.length === 0) {
        throw new Error("Schema not found")
      }

      if (data.length > 1) {
        throw new Error("Multiple schemas found with the same ID")
      }

      const schema = data[0]
      setSchema(schema)
      setJobName(`Generate ${schema.name} Data`)
    } catch (error) {
      console.error("Error loading schema:", error)
      setSchema(null)
    } finally {
      setIsLoading(false)
    }
  }

  const startGeneration = async () => {
    if (!schema || !jobName.trim() || !totalRecords) return

    setIsGenerating(true)
    try {
      const response = await fetch("/api/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema_id: schema.id,
          name: jobName.trim(),
          total_records: Number.parseInt(totalRecords),
          config: {},
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to create job")
      }

      // Redirect to job console
      router.push(`/dashboard/jobs/${result.job.id}`)
    } catch (error) {
      console.error("Error starting generation:", error)
      alert("Failed to start data generation. Please try again.")
    } finally {
      setIsGenerating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (!schema) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Schema Not Found</h1>
        <p className="text-gray-600">The schema you're looking for doesn't exist.</p>
      </div>
    )
  }

  const fields = schema.schema_definition?.fields || []
  const aiFields = fields.filter((field: any) =>
    ["name", "email", "company", "address", "city", "job_title", "industry", "text", "long_text", "url"].includes(
      field.type,
    ),
  )

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/schemas/${schema.id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Schema
            </Link>
          </Button>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Generate Data: {schema.name}</h1>
        <p className="text-gray-600">{schema.description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Generation Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Generation Settings</CardTitle>
            <CardDescription>Configure your AI-powered data generation job</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="job-name">Job Name</Label>
              <Input
                id="job-name"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="Enter a name for this generation job"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="total-records">Number of Records</Label>
              <Input
                id="total-records"
                type="number"
                min="1"
                max="1000"
                value={totalRecords}
                onChange={(e) => setTotalRecords(e.target.value)}
                placeholder="100"
              />
              <p className="text-xs text-gray-500">Maximum 1,000 records per AI generation job</p>
            </div>

            {/* AI Generation Notice */}
            {aiFields.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-blue-900">AI-Enhanced Generation</p>
                    <p className="text-xs text-blue-800 mt-1">
                      {aiFields.length} of {fields.length} fields will use AI to generate realistic, contextual data
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4">
              <Button
                onClick={startGeneration}
                disabled={isGenerating || !jobName.trim() || !totalRecords}
                className="w-full"
              >
                <Play className="mr-2 h-4 w-4" />
                {isGenerating ? "Starting AI Generation..." : "Start AI Generation"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Schema Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Schema Preview</CardTitle>
            <CardDescription>Fields that will be generated ({fields.length} total)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {fields.map((field: any, index: number) => {
                const isAI = [
                  "name",
                  "email",
                  "company",
                  "address",
                  "city",
                  "job_title",
                  "industry",
                  "text",
                  "long_text",
                  "url",
                ].includes(field.type)
                return (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-sm">{field.name}</div>
                      <div className="text-xs text-gray-500">{field.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {field.type}
                      </Badge>
                      {isAI && (
                        <Badge variant="secondary" className="text-xs">
                          AI
                        </Badge>
                      )}
                      {field.required && (
                        <Badge variant="default" className="text-xs">
                          Required
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Estimated Cost/Time */}
      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-900">{totalRecords}</div>
              <div className="text-sm text-gray-500">Records to Generate</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{aiFields.length}</div>
              <div className="text-sm text-gray-500">AI-Generated Fields</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{fields.length - aiFields.length}</div>
              <div className="text-sm text-gray-500">Standard Fields</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                ~{Math.ceil((Number.parseInt(totalRecords || "0") * aiFields.length) / 50)}
              </div>
              <div className="text-sm text-gray-500">Minutes (Estimated)</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
