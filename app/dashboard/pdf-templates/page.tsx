"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { FileText, Plus, Download, Play, BarChart3, Loader2, CheckCircle, XCircle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface PDFTemplate {
  id: string
  name: string
  version: number
  description?: string
  templateConfig: any
  isActive: boolean
  createdAt: string
}

interface UsageStats {
  total: number
  success: number
  failure: number
  averageGenerationTimeMs: number
  averageOutputSizeBytes: number
}

export default function PDFTemplatesPage() {
  const [templates, setTemplates] = useState<PDFTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [generatedPdf, setGeneratedPdf] = useState<string | null>(null)
  const [stats, setStats] = useState<UsageStats | null>(null)
  
  // Create template form state
  const [templateName, setTemplateName] = useState("")
  const [templateDescription, setTemplateDescription] = useState("")
  const [templateJson, setTemplateJson] = useState(`{
  "pageSize": "A4",
  "marginMm": 20,
  "fonts": {
    "default": "Helvetica",
    "defaultSize": 11,
    "title": { "family": "Helvetica-Bold", "size": 16 }
  },
  "sections": [
    {
      "type": "title",
      "content": "{{title}}"
    },
    {
      "type": "text",
      "content": "{{content}}"
    }
  ]
}`)
  
  // Generate PDF form state
  const [generateData, setGenerateData] = useState(`{
  "title": "Test Document",
  "content": "This is a test PDF generated from a template."
}`)

  useEffect(() => {
    loadTemplates()
    loadStats()
  }, [])

  const loadTemplates = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/pdf/templates?action=list")
      if (response.ok) {
        const data = await response.json()
        setTemplates(data.templates || [])
      }
    } catch (error) {
      console.error("Error loading templates:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const response = await fetch("/api/pdf/templates?action=stats&days=30")
      if (response.ok) {
        const data = await response.json()
        setStats(data.stats || null)
      }
    } catch (error) {
      console.error("Error loading stats:", error)
    }
  }

  const handleCreateTemplate = async () => {
    if (!templateName.trim()) {
      alert("Template name is required")
      return
    }

    try {
      setIsCreating(true)
      let templateConfig
      try {
        templateConfig = JSON.parse(templateJson)
      } catch (e) {
        alert("Invalid JSON in template configuration")
        return
      }

      const response = await fetch("/api/pdf/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: templateName,
          description: templateDescription || undefined,
          templateConfig,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to create template")
      }

      alert("Template created successfully!")
      setTemplateName("")
      setTemplateDescription("")
      setTemplateJson(`{
  "pageSize": "A4",
  "marginMm": 20,
  "fonts": {
    "default": "Helvetica",
    "defaultSize": 11,
    "title": { "family": "Helvetica-Bold", "size": 16 }
  },
  "sections": [
    {
      "type": "title",
      "content": "{{title}}"
    },
    {
      "type": "text",
      "content": "{{content}}"
    }
  ]
}`)
      loadTemplates()
      loadStats()
    } catch (error) {
      console.error("Error creating template:", error)
      alert(error instanceof Error ? error.message : "Failed to create template")
    } finally {
      setIsCreating(false)
    }
  }

  const handleGeneratePDF = async () => {
    if (!selectedTemplate) {
      alert("Please select a template")
      return
    }

    try {
      setIsGenerating(true)
      let data
      try {
        data = JSON.parse(generateData)
      } catch (e) {
        alert("Invalid JSON in data")
        return
      }

      const response = await fetch("/api/pdf/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          templateName: selectedTemplate,
          data,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to generate PDF")
      }

      setGeneratedPdf(result.pdfBase64)
      loadStats()
      alert(`PDF generated successfully! (${(result.outputSizeBytes / 1024).toFixed(2)} KB, ${result.generationTimeMs}ms)`)
    } catch (error) {
      console.error("Error generating PDF:", error)
      alert(error instanceof Error ? error.message : "Failed to generate PDF")
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadPDF = () => {
    if (!generatedPdf) return

    const link = document.createElement("a")
    link.href = `data:application/pdf;base64,${generatedPdf}`
    link.download = `generated-${Date.now()}.pdf`
    link.click()
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <FileText className="h-8 w-8" />
          PDF Templates
        </h1>
        <p className="text-gray-600">Create templates and generate PDFs with dynamic content</p>
      </div>

      {/* Stats */}
      {stats && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Usage Statistics (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <div className="text-sm text-gray-600">Total</div>
                <div className="text-2xl font-bold">{stats.total}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Success
                </div>
                <div className="text-2xl font-bold text-green-600">{stats.success}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Failure
                </div>
                <div className="text-2xl font-bold text-red-600">{stats.failure}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Avg Time</div>
                <div className="text-2xl font-bold">{Math.round(stats.averageGenerationTimeMs)}ms</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Avg Size</div>
                <div className="text-2xl font-bold">
                  {stats.averageOutputSizeBytes > 0
                    ? `${(stats.averageOutputSizeBytes / 1024).toFixed(1)} KB`
                    : "N/A"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="generate" className="space-y-6">
        <TabsList>
          <TabsTrigger value="generate">Generate PDF</TabsTrigger>
          <TabsTrigger value="create">Create Template</TabsTrigger>
          <TabsTrigger value="templates">My Templates</TabsTrigger>
        </TabsList>

        {/* Generate PDF Tab */}
        <TabsContent value="generate">
          <Card>
            <CardHeader>
              <CardTitle>Generate PDF from Template</CardTitle>
              <CardDescription>
                Select a template and provide data to generate a PDF document
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-select">Template</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger id="template-select">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={`${template.name}-${template.version}`} value={template.name}>
                        {template.name} (v{template.version})
                        {template.description && ` - ${template.description}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="generate-data">Data (JSON)</Label>
                <Textarea
                  id="generate-data"
                  value={generateData}
                  onChange={(e) => setGenerateData(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                  placeholder='{"title": "My Document", "content": "..."}'
                />
                <p className="text-xs text-gray-500">
                  Provide data as JSON object. Use placeholders in your template like {"{{key}}"} to inject values.
                </p>
              </div>

              <Button
                onClick={handleGeneratePDF}
                disabled={isGenerating || !selectedTemplate}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Generate PDF
                  </>
                )}
              </Button>

              {generatedPdf && (
                <div className="space-y-2 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <Label>Generated PDF</Label>
                    <Button onClick={downloadPDF} size="sm" variant="outline">
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                  <iframe
                    src={`data:application/pdf;base64,${generatedPdf}`}
                    className="w-full h-96 border rounded"
                    title="Generated PDF Preview"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Create Template Tab */}
        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create New Template</CardTitle>
              <CardDescription>
                Define a PDF template with sections, fonts, and placeholders
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name *</Label>
                <Input
                  id="template-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="invoice_template"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-description">Description (Optional)</Label>
                <Input
                  id="template-description"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Invoice template for customer billing"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-config">Template Configuration (JSON) *</Label>
                <Textarea
                  id="template-config"
                  value={templateJson}
                  onChange={(e) => setTemplateJson(e.target.value)}
                  rows={20}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  Define sections, fonts, margins, and placeholders. Use {"{{key}}"} for dynamic content.
                </p>
              </div>

              <Button
                onClick={handleCreateTemplate}
                disabled={isCreating || !templateName.trim()}
                className="w-full"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Template
                  </>
                )}
              </Button>

              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold mb-2">Template Structure Example:</h4>
                <pre className="text-xs overflow-x-auto">
{`{
  "pageSize": "A4",
  "marginMm": 20,
  "fonts": {
    "default": "Helvetica",
    "defaultSize": 11,
    "title": { "family": "Helvetica-Bold", "size": 16 }
  },
  "sections": [
    { "type": "title", "content": "{{invoice_number}}" },
    { "type": "text", "content": "Customer: {{customer_name}}" },
    {
      "type": "table",
      "headers": ["Item", "Quantity", "Price"],
      "rows": "{{items}}",
      "style": {
        "headerBackground": "#CCCCCC",
        "alternateRows": true
      }
    },
    { "type": "pageBreak" }
  ]
}`}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates List Tab */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>My Templates</CardTitle>
              <CardDescription>
                View and manage your PDF templates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {templates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No templates found. Create your first template in the "Create Template" tab.
                </div>
              ) : (
                <div className="space-y-4">
                  {templates.map((template) => (
                    <Card key={`${template.id}`} className="border">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold">{template.name}</h3>
                              <Badge variant="outline">v{template.version}</Badge>
                              {template.isActive ? (
                                <Badge variant="default">Active</Badge>
                              ) : (
                                <Badge variant="secondary">Inactive</Badge>
                              )}
                            </div>
                            {template.description && (
                              <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                            )}
                            <p className="text-xs text-gray-500">
                              Created: {new Date(template.createdAt).toLocaleDateString()}
                            </p>
                            <div className="mt-2">
                              <p className="text-xs font-mono bg-gray-50 p-2 rounded">
                                Sections: {template.templateConfig?.sections?.length || 0}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedTemplate(template.name)
                              // Switch to generate tab
                              const tabsList = document.querySelector('[role="tablist"]')
                              const generateTab = tabsList?.querySelector('[value="generate"]') as HTMLElement
                              generateTab?.click()
                            }}
                          >
                            Use Template
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}


