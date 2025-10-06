"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Play, ArrowLeft, Sparkles, ImageIcon, FileText } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

interface Schema {
  id: string
  name: string
  description: string
  schema_definition: any
}

interface AIModel {
  id: string
  name: string
  description: string
  pricing: {
    prompt: number
    completion: number
  }
}

export default function GenerateDataPage() {
  const [schema, setSchema] = useState<Schema | null>(null)
  const [jobName, setJobName] = useState("")
  const [totalRecords, setTotalRecords] = useState("100")
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  const [textModel, setTextModel] = useState("google/gemini-2.5-flash")
  const [imageModel, setImageModel] = useState("google/gemini-2.5-flash-image-preview")
  const [availableModels, setAvailableModels] = useState<AIModel[]>([])
  const [outputFormat, setOutputFormat] = useState("csv")
  const [enableImages, setEnableImages] = useState(true)
  const [imagesPerRecord, setImagesPerRecord] = useState("1")

  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadSchema()
    loadAvailableModels()
  }, [params.id])

  const loadAvailableModels = async () => {
    try {
      const response = await fetch("/api/models/available")
      if (response.ok) {
        const models = await response.json()
        setAvailableModels(models)
      }
    } catch (error) {
      console.error("Error loading models:", error)
      // Set default models if API fails
      setAvailableModels([
        {
          id: "google/gemini-2.5-flash",
          name: "Gemini 2.5 Flash",
          description: "Fast, high-quality text generation",
          pricing: { prompt: 0.075, completion: 0.3 },
        },
        {
          id: "anthropic/claude-3.5-sonnet",
          name: "Claude 3.5 Sonnet",
          description: "Advanced reasoning and analysis",
          pricing: { prompt: 3, completion: 15 },
        },
        {
          id: "openai/gpt-4o",
          name: "GPT-4o",
          description: "Latest OpenAI model",
          pricing: { prompt: 2.5, completion: 10 },
        },
      ])
    }
  }

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
          config: {
            text_model: textModel,
            image_model: imageModel,
            output_format: outputFormat,
            enable_images: enableImages,
            images_per_record: Number.parseInt(imagesPerRecord),
            generation_settings: {
              temperature: 0.7,
              max_tokens: 150,
            },
          },
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to create job")
      }

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
      <div className="max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (!schema) {
    return (
      <div className="max-w-6xl mx-auto text-center py-12">
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
  const imageFields = fields.filter((field: any) => field.type === "image")

  const estimatedCost = () => {
    const selectedTextModel = availableModels.find((m) => m.id === textModel)
    const baseTokens = 50 // Average tokens per field
    const totalTokens = Number.parseInt(totalRecords) * aiFields.length * baseTokens
    const textCost = selectedTextModel ? (totalTokens / 1000) * selectedTextModel.pricing.completion : 0
    const imageCost = enableImages ? Number.parseInt(totalRecords) * Number.parseInt(imagesPerRecord) * 0.04 : 0
    return (textCost + imageCost).toFixed(2)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/dashboard/schemas/${schema.id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Schema
            </Link>
          </Button>
        </div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent mb-2">
          Generate Data: {schema.name}
        </h1>
        <p className="text-gray-600">{schema.description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Generation Settings */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Generation Configuration
            </CardTitle>
            <CardDescription>Configure your AI-powered data generation job</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  max="10000"
                  value={totalRecords}
                  onChange={(e) => setTotalRecords(e.target.value)}
                  placeholder="100"
                />
                <p className="text-xs text-gray-500">Maximum 10,000 records per job</p>
              </div>
            </div>

            {/* AI Model Selection */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-teal-500" />
                <Label className="text-base font-medium">AI Model Selection</Label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="text-model">Text Generation Model</Label>
                  <Select value={textModel} onValueChange={setTextModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select text model" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{model.name}</span>
                            <span className="text-xs text-gray-500">${model.pricing.completion}/1K tokens</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {imageFields.length > 0 && (
                  <div className="grid gap-2">
                    <Label htmlFor="image-model">Image Generation Model</Label>
                    <Select value={imageModel} onValueChange={setImageModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select image model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google/gemini-2.5-flash-image-preview">
                          <div className="flex flex-col">
                            <span className="font-medium">Gemini 2.5 Flash Image</span>
                            <span className="text-xs text-gray-500">Native image generation</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="openai/dall-e-3">
                          <div className="flex flex-col">
                            <span className="font-medium">DALL-E 3</span>
                            <span className="text-xs text-gray-500">$0.04/image</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="stability-ai/stable-diffusion-xl">
                          <div className="flex flex-col">
                            <span className="font-medium">Stable Diffusion XL</span>
                            <span className="text-xs text-gray-500">$0.03/image</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Image Generation Settings */}
            {imageFields.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-purple-500" />
                  <Label className="text-base font-medium">Image Generation</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox id="enable-images" checked={enableImages} onCheckedChange={setEnableImages} />
                  <Label htmlFor="enable-images">Generate AI images for profile photos</Label>
                </div>

                {enableImages && (
                  <div className="grid gap-2">
                    <Label htmlFor="images-per-record">Images per Record</Label>
                    <Select value={imagesPerRecord} onValueChange={setImagesPerRecord}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 image</SelectItem>
                        <SelectItem value="2">2 images</SelectItem>
                        <SelectItem value="3">3 images</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Output Format */}
            <div className="grid gap-2">
              <Label htmlFor="output-format">Output Format</Label>
              <Select value={outputFormat} onValueChange={setOutputFormat}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                  <SelectItem value="json">JSON (.json)</SelectItem>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4">
              <Button
                onClick={startGeneration}
                disabled={isGenerating || !jobName.trim() || !totalRecords}
                className="w-full bg-gradient-to-r from-purple-600 to-teal-600 hover:from-purple-700 hover:to-teal-700"
                size="lg"
              >
                <Play className="mr-2 h-4 w-4" />
                {isGenerating ? "Starting AI Generation..." : "Start AI Generation"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Schema Preview & Cost Estimation */}
        <div className="space-y-6">
          {/* Schema Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Schema Preview</CardTitle>
              <CardDescription>Fields that will be generated ({fields.length} total)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto">
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
                  const isImage = field.type === "image"

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
                          <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                            AI Text
                          </Badge>
                        )}
                        {isImage && enableImages && (
                          <Badge variant="secondary" className="text-xs bg-teal-100 text-teal-700">
                            AI Image
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

          {/* Cost Estimation */}
          <Card>
            <CardHeader>
              <CardTitle>Generation Summary</CardTitle>
              <CardDescription>Estimated cost and processing time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{totalRecords}</div>
                    <div className="text-sm text-gray-500">Records</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">{aiFields.length}</div>
                    <div className="text-sm text-gray-500">AI Fields</div>
                  </div>
                  {enableImages && imageFields.length > 0 && (
                    <>
                      <div>
                        <div className="text-2xl font-bold text-teal-600">{imageFields.length}</div>
                        <div className="text-sm text-gray-500">Image Fields</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-gray-900">
                          {Number.parseInt(totalRecords) * Number.parseInt(imagesPerRecord)}
                        </div>
                        <div className="text-sm text-gray-500">Total Images</div>
                      </div>
                    </>
                  )}
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Estimated Cost:</span>
                    <span className="text-lg font-bold text-green-600">${estimatedCost()}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm font-medium">Processing Time:</span>
                    <span className="text-sm text-gray-600">
                      ~
                      {Math.ceil(
                        (Number.parseInt(totalRecords || "0") *
                          (aiFields.length + (enableImages ? imageFields.length : 0))) /
                          30,
                      )}{" "}
                      min
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
