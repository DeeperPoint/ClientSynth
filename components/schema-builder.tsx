"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, GripVertical, ImageIcon, Pointer as Spinner, FileText } from "lucide-react"
import { useRouter } from "next/navigation"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { ExampleFileUpload } from "@/components/example-file-upload"

interface SchemaField {
  id: string
  name: string
  type: string
  description: string
  required: boolean
  constraints?: {
    min?: number
    max?: number
    options?: string[]
    format?: string
  }
}

interface SchemaDefinition {
  fields: SchemaField[]
  metadata: {
    version: string
    created_at: string
  }
}

const FIELD_TYPES = [
  { value: "text", label: "Text", description: "Short text field (AI-generated)", ai: true },
  { value: "long_text", label: "Long Text", description: "Multi-line text (AI-generated)", ai: true },
  { value: "email", label: "Email", description: "Email address (AI-generated)", ai: true },
  { value: "phone", label: "Phone", description: "Phone number", ai: false },
  { value: "name", label: "Name", description: "Person's name (AI-generated)", ai: true },
  { value: "company", label: "Company", description: "Company name (AI-generated)", ai: true },
  { value: "address", label: "Address", description: "Street address (AI-generated)", ai: true },
  { value: "city", label: "City", description: "City name (AI-generated)", ai: true },
  { value: "country", label: "Country", description: "Country name", ai: false },
  { value: "number", label: "Number", description: "Numeric value", ai: false },
  { value: "date", label: "Date", description: "Date value", ai: false },
  { value: "boolean", label: "Boolean", description: "True/false value", ai: false },
  { value: "select", label: "Select", description: "Choose from options", ai: false },
  { value: "url", label: "URL", description: "Web address (AI-generated)", ai: true },
  { value: "job_title", label: "Job Title", description: "Professional title (AI-generated)", ai: true },
  { value: "industry", label: "Industry", description: "Business industry (AI-generated)", ai: true },
  { value: "image", label: "Image", description: "AI-generated profile image", ai: true, icon: ImageIcon },
  { value: "pdf", label: "PDF", description: "Generated PDF document", ai: true },
]

export function SchemaBuilder() {
  const [schemaName, setSchemaName] = useState("")
  const [schemaDescription, setSchemaDescription] = useState("")
  const [fields, setFields] = useState<SchemaField[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()
  // Use server APIs for auth and DB (Postgres)

  const addField = () => {
    const newField: SchemaField = {
      id: `field_${Date.now()}`,
      name: "",
      type: "text",
      description: "",
      required: false,
    }
    setFields([...fields, newField])
  }

  const updateField = (id: string, updates: Partial<SchemaField>) => {
    setFields(fields.map((field) => (field.id === id ? { ...field, ...updates } : field)))
  }

  const removeField = (id: string) => {
    setFields(fields.filter((field) => field.id !== id))
  }

  const saveSchema = async () => {
    if (!schemaName.trim() || fields.length === 0) {
      alert("Please provide a schema name and at least one field")
      return
    }

    setIsSaving(true)
    try {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' })
      const meJson = await meRes.json()
      if (!meJson?.data?.user?.id) throw new Error("Not authenticated")

      let tenantId: string | null = null
      // Use our server APIs to determine tenant
      try {
        const tenantsRes = await fetch('/api/user/tenants', { cache: 'no-store' })
        if (tenantsRes.ok) {
          const tenants = await tenantsRes.json()
          if (Array.isArray(tenants) && tenants.length > 0) {
            tenantId = tenants[0].id
          }
        }
      } catch {}
      if (!tenantId) {
        // Create or fetch a default tenant for this user via server route
        await fetch('/api/tenants/create-default', { method: 'POST' })
        const tenantsRes2 = await fetch('/api/user/tenants', { cache: 'no-store' })
        if (tenantsRes2.ok) {
          const tenants = await tenantsRes2.json()
          if (Array.isArray(tenants) && tenants.length > 0) {
            tenantId = tenants[0].id
          }
        }
      }

      if (!tenantId) {
        throw new Error("Unable to determine or create tenant")
      }

      const schemaDefinition: SchemaDefinition = {
        fields: fields.map((field) => ({
          ...field,
          name: field.name.trim(),
        })),
        metadata: {
          version: "1.0",
          created_at: new Date().toISOString(),
        },
      }

      const dbRes = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'insert',
          table: 'schemas',
          data: {
            name: schemaName.trim(),
            description: schemaDescription.trim(),
            schema_definition: schemaDefinition,
            created_by: meJson.data.user.id,
            tenant_id: tenantId,
          },
        }),
      })
      const dbJson = await dbRes.json()
      if (!dbRes.ok) throw new Error(dbJson?.error || 'Failed to insert schema')

      // Redirect to the new schema page
      router.push(`/dashboard/schemas/${dbJson.data.id}`)
    } catch (error) {
      console.error("Error saving schema:", error)
      alert(`Failed to save schema: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto p-4 sm:p-6">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Create New Schema
        </h1>
        <p className="text-xl text-muted-foreground">Design your data structure for synthetic client generation</p>
      </div>

      <Card className="glass-effect shadow-medium border-0">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Schema Information</CardTitle>
          <CardDescription className="text-lg">Basic details about your data schema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3">
            <Label htmlFor="schema-name" className="text-base font-medium">
              Schema Name{" "}
              <span className="text-destructive" aria-label="required">
                *
              </span>
            </Label>
            <Input
              id="schema-name"
              placeholder="e.g., Customer Profiles, Lead Database"
              value={schemaName}
              onChange={(e) => setSchemaName(e.target.value)}
              className="h-12 text-base"
              required
              aria-required="true"
            />
          </div>
          <div className="grid gap-3">
            <Label htmlFor="schema-description" className="text-base font-medium">
              Description
            </Label>
            <Textarea
              id="schema-description"
              placeholder="Describe what this schema is used for..."
              value={schemaDescription}
              onChange={(e) => setSchemaDescription(e.target.value)}
              className="min-h-[100px] text-base"
              aria-describedby="schema-description-hint"
            />
            <p id="schema-description-hint" className="text-sm text-muted-foreground">
              Optional: Provide context about how this schema will be used
            </p>
          </div>
        </CardContent>
      </Card>

      <Card
        className="border-0 bg-gradient-to-r from-primary/10 to-accent/10 shadow-soft"
        role="note"
        aria-label="AI generation information"
      >
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div
              className="w-3 h-3 bg-gradient-to-r from-primary to-accent rounded-full mt-2 flex-shrink-0"
              aria-hidden="true"
            ></div>
            <div>
              <h3 className="font-semibold text-primary mb-2 text-lg">AI-Powered Generation</h3>
              <p className="text-base text-foreground/80">
                Fields marked with AI will use advanced language models to generate realistic, contextual data. Image
                fields will generate professional profile photos using OpenRouter models.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {fields.length > 0 && (
        <Card className="glass-effect shadow-medium border-0">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">Example Data (Optional)</CardTitle>
            <CardDescription className="text-lg">
              Upload example files to guide AI generation and improve data quality
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">Example files will be available after saving</p>
              <p className="text-sm">Save your schema first, then you can upload example files to improve AI generation</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-effect shadow-medium border-0">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-semibold">Schema Fields</CardTitle>
              <CardDescription className="text-lg">Define the structure of your synthetic data</CardDescription>
            </div>
            <Button
              onClick={addField}
              size="lg"
              className="gradient-primary text-white shadow-soft w-full sm:w-auto"
              aria-label="Add new field to schema"
            >
              <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <Empty className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
              <EmptyHeader>
                <EmptyTitle>No fields added yet</EmptyTitle>
                <EmptyDescription>Add your first field to start building your schema</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  onClick={addField}
                  variant="outline"
                  size="lg"
                  className="border-primary/20 hover:bg-primary/5 bg-transparent"
                  aria-label="Add your first field"
                >
                  <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
                  Add Your First Field
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="space-y-6" role="list" aria-label="Schema fields">
              {fields.map((field, index) => {
                const fieldType = FIELD_TYPES.find((t) => t.value === field.type)
                return (
                  <div
                    key={field.id}
                    className="border border-border/50 rounded-xl p-6 bg-card/30 shadow-soft"
                    role="listitem"
                  >
                    <div className="flex flex-col lg:flex-row items-start gap-4">
                      <div className="hidden lg:flex flex-shrink-0 mt-2" aria-hidden="true">
                        <GripVertical className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                        <div className="sm:col-span-2 lg:col-span-1">
                          <Label htmlFor={`field-name-${field.id}`}>
                            Field Name{" "}
                            <span className="text-destructive" aria-label="required">
                              *
                            </span>
                          </Label>
                          <Input
                            id={`field-name-${field.id}`}
                            placeholder="e.g., first_name"
                            value={field.name}
                            onChange={(e) => updateField(field.id, { name: e.target.value })}
                            required
                            aria-required="true"
                          />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-1">
                          <Label htmlFor={`field-type-${field.id}`}>
                            Type{" "}
                            <span className="text-destructive" aria-label="required">
                              *
                            </span>
                          </Label>
                          <Select
                            value={field.type}
                            onValueChange={(value) => updateField(field.id, { type: value })}
                            required
                          >
                            <SelectTrigger id={`field-type-${field.id}`} aria-label="Select field type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  <div className="flex items-center gap-2">
                                    <div>
                                      <div className="font-medium flex items-center gap-2">
                                        {type.icon && <type.icon className="h-3 w-3" aria-hidden="true" />}
                                        {type.label}
                                        {type.ai && (
                                          <Badge variant="secondary" className="text-xs" aria-label="AI-powered">
                                            AI
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-500">{type.description}</div>
                                    </div>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-2 lg:col-span-2">
                          <Label htmlFor={`field-description-${field.id}`}>Description</Label>
                          <Input
                            id={`field-description-${field.id}`}
                            placeholder="Describe this field..."
                            value={field.description}
                            onChange={(e) => updateField(field.id, { description: e.target.value })}
                            aria-describedby={fieldType?.ai ? `field-ai-hint-${field.id}` : undefined}
                          />
                          {fieldType?.ai && (
                            <p id={`field-ai-hint-${field.id}`} className="text-xs text-blue-600 mt-1">
                              AI will use this description to generate more relevant content
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-row lg:flex-col items-center gap-2 w-full lg:w-auto">
                        <Badge
                          variant={field.required ? "default" : "secondary"}
                          className="flex-shrink-0"
                          aria-label={field.required ? "Required field" : "Optional field"}
                        >
                          {field.required ? "Required" : "Optional"}
                        </Badge>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateField(field.id, { required: !field.required })}
                            className="text-xs"
                            aria-label={`Toggle field requirement: currently ${field.required ? "required" : "optional"}`}
                          >
                            Toggle
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeField(field.id)}
                            aria-label={`Remove field: ${field.name || "unnamed field"}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">Remove field</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div
        className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-4"
        role="group"
        aria-label="Schema actions"
      >
        <Button
          variant="outline"
          onClick={() => router.back()}
          size="lg"
          className="w-full sm:w-auto border-primary/20 hover:bg-primary/5"
          aria-label="Cancel and go back"
        >
          Cancel
        </Button>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            disabled={fields.length === 0}
            size="lg"
            className="w-full sm:w-auto border-accent/20 hover:bg-accent/5 bg-transparent"
            aria-label="Preview schema"
            aria-disabled={fields.length === 0}
          >
            Preview
          </Button>
          <Button
            onClick={saveSchema}
            disabled={isSaving || !schemaName.trim() || fields.length === 0}
            size="lg"
            className="w-full sm:w-auto gradient-primary text-white shadow-medium"
            aria-label={isSaving ? "Saving schema..." : "Save schema"}
            aria-disabled={isSaving || !schemaName.trim() || fields.length === 0}
          >
            {isSaving ? (
              <>
                <Spinner className="mr-2 h-5 w-5" aria-hidden="true" />
                Saving...
              </>
            ) : (
              "Save Schema"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
