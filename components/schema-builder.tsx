"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, GripVertical, ImageIcon } from "lucide-react"
import { useRouter } from "next/navigation"

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
]

export function SchemaBuilder() {
  const [schemaName, setSchemaName] = useState("")
  const [schemaDescription, setSchemaDescription] = useState("")
  const [fields, setFields] = useState<SchemaField[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

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
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("Not authenticated")

      let tenantId: string | null = null

      // First try to get current_tenant_id from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("current_tenant_id")
        .eq("id", user.user.id)
        .single()

      if (profile?.current_tenant_id) {
        tenantId = profile.current_tenant_id
      } else {
        // If no current tenant, get user's tenants and use the first one
        const { data: userTenants } = await supabase
          .from("tenants")
          .select(`
            id,
            name,
            user_tenant_roles!inner(role)
          `)
          .eq("user_tenant_roles.user_id", user.user.id)
          .limit(1)

        if (userTenants && userTenants.length > 0) {
          tenantId = userTenants[0].id

          // Update profile with current tenant
          await supabase.from("profiles").update({ current_tenant_id: tenantId }).eq("id", user.user.id)
        } else {
          // Create a default tenant for the user
          const defaultTenantName = user.user.email?.split("@")[0] + "'s Organization" || "My Organization"
          const slug = defaultTenantName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")

          // Create tenant
          const { data: newTenant, error: tenantError } = await supabase
            .from("tenants")
            .insert({ name: defaultTenantName, slug })
            .select("id")
            .single()

          if (tenantError) throw tenantError

          // Add user as owner
          const { error: roleError } = await supabase
            .from("user_tenant_roles")
            .insert({ user_id: user.user.id, tenant_id: newTenant.id, role: "owner" })

          if (roleError) throw roleError

          tenantId = newTenant.id

          // Update profile with current tenant
          await supabase.from("profiles").update({ current_tenant_id: tenantId }).eq("id", user.user.id)
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

      const { error } = await supabase.from("schemas").insert({
        name: schemaName.trim(),
        description: schemaDescription.trim(),
        schema_definition: schemaDefinition,
        created_by: user.user.id,
        tenant_id: tenantId,
      })

      if (error) throw error

      router.push("/dashboard/schemas")
    } catch (error) {
      console.error("Error saving schema:", error)
      alert(`Failed to save schema: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6">
      {/* Schema Info */}
      <Card>
        <CardHeader>
          <CardTitle>Schema Information</CardTitle>
          <CardDescription>Basic details about your data schema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="schema-name">Schema Name</Label>
            <Input
              id="schema-name"
              placeholder="e.g., Customer Profiles, Lead Database"
              value={schemaName}
              onChange={(e) => setSchemaName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="schema-description">Description</Label>
            <Textarea
              id="schema-description"
              placeholder="Describe what this schema is used for..."
              value={schemaDescription}
              onChange={(e) => setSchemaDescription(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* AI Generation Notice */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
            <div>
              <h3 className="font-medium text-blue-900 mb-1">AI-Powered Generation</h3>
              <p className="text-sm text-blue-800">
                Fields marked with AI will use advanced language models to generate realistic, contextual data. Image
                fields will generate professional profile photos using OpenRouter models.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fields */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Schema Fields</CardTitle>
              <CardDescription>Define the structure of your synthetic data</CardDescription>
            </div>
            <Button onClick={addField} size="sm" className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
              <p className="text-gray-500 mb-4">No fields added yet</p>
              <Button onClick={addField} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Field
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((field, index) => {
                const fieldType = FIELD_TYPES.find((t) => t.value === field.type)
                return (
                  <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex flex-col lg:flex-row items-start gap-4">
                      <div className="hidden lg:flex flex-shrink-0 mt-2">
                        <GripVertical className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                        <div className="sm:col-span-2 lg:col-span-1">
                          <Label htmlFor={`field-name-${field.id}`}>Field Name</Label>
                          <Input
                            id={`field-name-${field.id}`}
                            placeholder="e.g., first_name"
                            value={field.name}
                            onChange={(e) => updateField(field.id, { name: e.target.value })}
                          />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-1">
                          <Label htmlFor={`field-type-${field.id}`}>Type</Label>
                          <Select value={field.type} onValueChange={(value) => updateField(field.id, { type: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  <div className="flex items-center gap-2">
                                    <div>
                                      <div className="font-medium flex items-center gap-2">
                                        {type.icon && <type.icon className="h-3 w-3" />}
                                        {type.label}
                                        {type.ai && (
                                          <Badge variant="secondary" className="text-xs">
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
                          />
                          {fieldType?.ai && (
                            <p className="text-xs text-blue-600 mt-1">
                              AI will use this description to generate more relevant content
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-row lg:flex-col items-center gap-2 w-full lg:w-auto">
                        <Badge variant={field.required ? "default" : "secondary"} className="flex-shrink-0">
                          {field.required ? "Required" : "Optional"}
                        </Badge>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateField(field.id, { required: !field.required })}
                            className="text-xs"
                          >
                            Toggle
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => removeField(field.id)}>
                            <Trash2 className="h-4 w-4" />
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

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button variant="outline" onClick={() => router.back()} className="w-full sm:w-auto">
          Cancel
        </Button>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" disabled={fields.length === 0} className="w-full sm:w-auto bg-transparent">
            Preview
          </Button>
          <Button
            onClick={saveSchema}
            disabled={isSaving || !schemaName.trim() || fields.length === 0}
            className="w-full sm:w-auto"
          >
            {isSaving ? "Saving..." : "Save Schema"}
          </Button>
        </div>
      </div>
    </div>
  )
}
