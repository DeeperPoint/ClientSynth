"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Users, Briefcase, ShoppingBag, Play, ArrowRight, Zap } from "lucide-react"
import { useRouter } from "next/navigation"
import { UI_CONFIG } from "@/lib/ui-config"

interface ClientTemplate {
  id: string
  name: string
  description: string
  icon: any
  fields: Array<{
    name: string
    type: string
    description: string
    required: boolean
  }>
  useCase: string
}

const CLIENT_TEMPLATES: ClientTemplate[] = [
  {
    id: "b2b-clients",
    name: "B2B Clients",
    description: "Professional business clients with company information",
    icon: Briefcase,
    useCase: "CRM systems, sales pipelines, enterprise software demos",
    fields: [
      { name: "full_name", type: "name", description: "Contact person's full name", required: true },
      { name: "email", type: "email", description: "Business email address", required: true },
      { name: "company", type: "company", description: "Company name", required: true },
      { name: "job_title", type: "job_title", description: "Professional title", required: true },
      { name: "industry", type: "industry", description: "Business industry", required: true },
      { name: "phone", type: "phone", description: "Business phone number", required: false },
      { name: "city", type: "city", description: "Business location", required: false },
      { name: "country", type: "country", description: "Country", required: false },
    ],
  },
  {
    id: "consumer-profiles",
    name: "Consumer Profiles",
    description: "Individual consumers with personal information",
    icon: Users,
    useCase: "E-commerce, subscription services, consumer apps",
    fields: [
      { name: "full_name", type: "name", description: "Customer's full name", required: true },
      { name: "email", type: "email", description: "Personal email address", required: true },
      { name: "phone", type: "phone", description: "Phone number", required: false },
      { name: "address", type: "address", description: "Street address", required: false },
      { name: "city", type: "city", description: "City", required: true },
      { name: "country", type: "country", description: "Country", required: true },
      { name: "profile_image", type: "image", description: "Customer profile photo", required: false },
    ],
  },
  {
    id: "ecommerce-customers",
    name: "E-commerce Customers",
    description: "Online shoppers with purchase history indicators",
    icon: ShoppingBag,
    useCase: "Online stores, marketplace platforms, retail analytics",
    fields: [
      { name: "full_name", type: "name", description: "Customer name", required: true },
      { name: "email", type: "email", description: "Email address", required: true },
      { name: "phone", type: "phone", description: "Contact number", required: false },
      { name: "address", type: "address", description: "Shipping address", required: true },
      { name: "city", type: "city", description: "City", required: true },
      { name: "country", type: "country", description: "Country", required: true },
      { name: "customer_since", type: "date", description: "Registration date", required: false },
      { name: "profile_image", type: "image", description: "Profile photo", required: false },
    ],
  },
]

export default function QuickGeneratePage() {
  const [selectedTemplate, setSelectedTemplate] = useState<ClientTemplate | null>(null)
  const [recordCount, setRecordCount] = useState("50")
  const [isGenerating, setIsGenerating] = useState(false)
  const router = useRouter()
  // Use server APIs for auth/tenants

  const handleQuickGenerate = async () => {
    if (!selectedTemplate) return

    setIsGenerating(true)
    try {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' })
      if (!meRes.ok) throw new Error('Not authenticated')
      const me = await meRes.json()
      const user = me?.data?.user
      if (!user) throw new Error('Not authenticated')

      // Get or create tenant using server APIs
      let tenantId: string | null = null
      try {
        const res = await fetch('/api/user/tenants', { cache: 'no-store' })
        if (res.ok) {
          const tenants = await res.json()
          if (Array.isArray(tenants) && tenants.length > 0) tenantId = tenants[0].id
        }
      } catch {}
      if (!tenantId) {
        await fetch('/api/tenants/create-default', { method: 'POST' })
        const res2 = await fetch('/api/user/tenants', { cache: 'no-store' })
        if (res2.ok) {
          const tenants = await res2.json()
          if (Array.isArray(tenants) && tenants.length > 0) tenantId = tenants[0].id
        }
      }
      if (!tenantId) throw new Error('No tenant found')

      // Create schema from template
      const schemaDefinition = {
        fields: selectedTemplate.fields.map((field, index) => ({
          id: `field_${index}`,
          ...field,
        })),
        metadata: {
          version: "1.0",
          created_at: new Date().toISOString(),
          template: selectedTemplate.id,
        },
      }

      const schemaRes = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'insert',
          table: 'schemas',
          data: {
            name: `${selectedTemplate.name} - Quick Generate`,
            description: selectedTemplate.description,
            schema_definition: schemaDefinition,
            created_by: user.id,
            tenant_id: tenantId,
          },
          returning: '*',
        }),
      })
      const schemaJson = await schemaRes.json()
      if (!schemaRes.ok) throw new Error(schemaJson.error || 'Failed to create schema')
      const schema = schemaJson.data

      // Create generation job
      const response = await fetch("/api/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema_id: schema.id,
          name: `Quick Generate: ${selectedTemplate.name}`,
          total_records: Number.parseInt(recordCount),
          config: {
            text_model: "google/gemini-2.5-flash",
            image_model: "google/gemini-2.5-flash-image-preview",
            output_format: "csv",
            enable_images: selectedTemplate.fields.some((f) => f.type === "image"),
            images_per_record: 1,
          },
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error)

      router.push(`/dashboard/jobs/${result.job.id}`)
    } catch (error) {
      console.error("Error starting quick generation:", error)
      alert("Failed to start generation. Please try again.")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className={UI_CONFIG.spacing.section.large}>
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-4">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Quick Generate</span>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-4">
            Generate Synthetic Clients Instantly
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose a pre-configured template and generate realistic client data in seconds. Perfect for testing, demos,
            and development.
          </p>
        </div>

        {!selectedTemplate ? (
          <>
            <div className={`grid ${UI_CONFIG.grid.cols.default} ${UI_CONFIG.grid.gap.large}`}>
              {CLIENT_TEMPLATES.map((template) => {
                const Icon = template.icon
                return (
                  <Card
                    key={template.id}
                    className="group hover:shadow-medium transition-all duration-200 cursor-pointer border-2 hover:border-primary/50"
                    onClick={() => setSelectedTemplate(template)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {template.fields.length} fields
                        </Badge>
                      </div>
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">
                        {template.name}
                      </CardTitle>
                      <CardDescription className="text-base">{template.description}</CardDescription>
                    </CardHeader>
                    <CardContent className={UI_CONFIG.spacing.section.small}>
                      <div className="space-y-3">
                        <div>
                          <div className="text-sm font-medium text-foreground mb-2">Includes:</div>
                          <div className="flex flex-wrap gap-2">
                            {template.fields.slice(0, 4).map((field) => (
                              <Badge key={field.name} variant="outline" className="text-xs">
                                {field.name}
                              </Badge>
                            ))}
                            {template.fields.length > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{template.fields.length - 4} more
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 border-t">
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Use case:</span> {template.useCase}
                          </div>
                        </div>

                        {template.fields.some((f) => f.type === "image") && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 rounded-lg border border-primary/20">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span className="text-xs font-medium text-primary">AI Image Generation Included</span>
                          </div>
                        )}
                      </div>

                      <Button className="w-full mt-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        Select Template
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <Card className="mt-8 border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="w-3 h-3 bg-gradient-to-r from-primary to-accent rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-primary mb-2">Need a custom schema?</h3>
                    <p className="text-muted-foreground mb-4">
                      For more control over your data structure, create a custom schema in the Schema Studio.
                    </p>
                    <Button variant="outline" asChild className="border-primary/20 hover:bg-primary/5 bg-transparent">
                      <a href="/dashboard/schemas">Go to Schema Studio</a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="max-w-4xl mx-auto">
            <Button
              variant="ghost"
              onClick={() => setSelectedTemplate(null)}
              className="mb-6 hover:bg-primary/5"
              disabled={isGenerating}
            >
              ← Back to Templates
            </Button>

            <div className={`grid lg:grid-cols-3 ${UI_CONFIG.grid.gap.large}`}>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center">
                      <selectedTemplate.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl">{selectedTemplate.name}</CardTitle>
                      <CardDescription>{selectedTemplate.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className={UI_CONFIG.spacing.section.medium}>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="record-count" className="text-base font-medium">
                        Number of Records
                      </Label>
                      <Input
                        id="record-count"
                        type="number"
                        min="1"
                        max="1000"
                        value={recordCount}
                        onChange={(e) => setRecordCount(e.target.value)}
                        className="mt-2 h-12 text-base"
                        disabled={isGenerating}
                      />
                      <p className="text-sm text-muted-foreground mt-2">
                        Generate up to 1,000 records instantly (max 10,000 via Schema Studio)
                      </p>
                    </div>

                    <div className="pt-4">
                      <h3 className="font-semibold mb-3">Fields to Generate ({selectedTemplate.fields.length})</h3>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {selectedTemplate.fields.map((field, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border"
                          >
                            <div>
                              <div className="font-medium text-sm">{field.name}</div>
                              <div className="text-xs text-muted-foreground">{field.description}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {field.type}
                              </Badge>
                              {[
                                "name",
                                "email",
                                "company",
                                "address",
                                "city",
                                "job_title",
                                "industry",
                                "image",
                              ].includes(field.type) && (
                                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
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
                        ))}
                      </div>
                    </div>

                    <Button
                      onClick={handleQuickGenerate}
                      disabled={isGenerating || !recordCount || Number.parseInt(recordCount) < 1}
                      size="lg"
                      className="w-full gradient-primary text-white shadow-medium"
                    >
                      <Play className="mr-2 h-5 w-5" />
                      {isGenerating ? "Starting Generation..." : "Generate Now"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Generation Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-primary">{recordCount}</div>
                        <div className="text-xs text-muted-foreground">Records</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-accent">{selectedTemplate.fields.length}</div>
                        <div className="text-xs text-muted-foreground">Fields</div>
                      </div>
                    </div>

                    <div className="border-t pt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">AI Text Fields:</span>
                        <span className="font-medium">
                          {
                            selectedTemplate.fields.filter((f) =>
                              ["name", "email", "company", "address", "city", "job_title", "industry"].includes(f.type),
                            ).length
                          }
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">AI Image Fields:</span>
                        <span className="font-medium">
                          {selectedTemplate.fields.filter((f) => f.type === "image").length}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Est. Time:</span>
                        <span className="font-medium">~{Math.ceil(Number.parseInt(recordCount || "0") / 30)} min</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-primary">AI-Powered</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Uses advanced AI models to generate realistic, contextually aware data that makes sense
                        together.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
