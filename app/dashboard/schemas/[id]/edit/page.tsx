"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Plus, Trash2, Save, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface Field {
  id: string
  name: string
  type: string
  description: string
  required: boolean
}

interface Schema {
  id: string
  name: string
  description: string
  schema_definition: {
    fields: Field[]
  }
}

const FIELD_TYPES = [
  { value: 'name', label: 'Name' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'address', label: 'Address' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'zip', label: 'ZIP Code' },
  { value: 'country', label: 'Country' },
  { value: 'company', label: 'Company' },
  { value: 'job_title', label: 'Job Title' },
  { value: 'industry', label: 'Industry' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Text' },
  { value: 'url', label: 'URL' },
  { value: 'image', label: 'Image (AI Generated)' },
  { value: 'pdf', label: 'PDF Document (AI Generated)' },
]

export default function EditSchemaPage() {
  const params = useParams()
  const router = useRouter()
  const schemaId = params.id as string

  const [schema, setSchema] = useState<Schema | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [fields, setFields] = useState<Field[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (schemaId) {
      loadSchema()
    }
  }, [schemaId])

  const loadSchema = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`/api/db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select',
          table: 'schemas',
          columns: 'id,name,description,schema_definition',
          where: { op: 'eq', column: 'id', value: schemaId }
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to load schema')
      }

      const data = await response.json()
      if (data.data && data.data.length > 0) {
        const schemaData = data.data[0]
        setSchema(schemaData)
        setName(schemaData.name)
        setDescription(schemaData.description || '')
        setFields(schemaData.schema_definition?.fields || [])
      } else {
        throw new Error("Schema not found")
      }
    } catch (error) {
      console.error("Error loading schema:", error)
      setError(error instanceof Error ? error.message : "Failed to load schema")
      toast.error("Failed to load schema")
    } finally {
      setIsLoading(false)
    }
  }

  const addField = () => {
    const newField: Field = {
      id: `field-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: '',
      type: 'text',
      description: '',
      required: false
    }
    setFields([...fields, newField])
  }

  const updateField = (index: number, updates: Partial<Field>) => {
    const updatedFields = [...fields]
    updatedFields[index] = { ...updatedFields[index], ...updates }
    setFields(updatedFields)
  }

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index))
  }

  const validateSchema = (): string | null => {
    if (!name.trim()) {
      return "Schema name is required"
    }

    if (fields.length === 0) {
      return "At least one field is required"
    }

    const fieldNames = new Set<string>()
    for (const field of fields) {
      if (!field.name.trim()) {
        return "All fields must have a name"
      }

      // Check for duplicate field names
      if (fieldNames.has(field.name)) {
        return `Duplicate field name: ${field.name}`
      }
      fieldNames.add(field.name)

      // Validate field name format (no spaces, alphanumeric + underscore)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.name)) {
        return `Invalid field name: ${field.name}. Use only letters, numbers, and underscores, starting with a letter.`
      }
    }

    return null
  }

  const handleSave = async () => {
    // Validate
    const validationError = validateSchema()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/schemas/${schemaId}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          schema_definition: {
            fields: fields.map(f => ({
              id: f.id,
              name: f.name,
              type: f.type,
              description: f.description,
              required: f.required
            }))
          }
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update schema')
      }

      toast.success("Schema updated successfully!")
      router.push(`/dashboard/schemas/${schemaId}`)
    } catch (error) {
      console.error("Error updating schema:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to update schema"
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-muted rounded-lg w-1/3"></div>
          <div className="h-64 bg-muted rounded-xl"></div>
        </div>
      </div>
    )
  }

  if (error && !schema) {
    return (
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Edit Schema</h1>
            <p className="text-muted-foreground mt-1">Modify your data generation schema</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/schemas/${schemaId}`)}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>Update schema name and description</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Schema Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Client Profiles"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this schema is for..."
              className="mt-1"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Fields */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Schema Fields</CardTitle>
              <CardDescription>Define the fields for your data generation</CardDescription>
            </div>
            <Button onClick={addField} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <p className="text-muted-foreground mb-4">No fields added yet</p>
              <Button onClick={addField} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Field
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <Badge variant="outline">Field {index + 1}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeField(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Field Name *</Label>
                      <Input
                        value={field.name}
                        onChange={(e) => updateField(index, { name: e.target.value })}
                        placeholder="e.g., full_name"
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Use lowercase with underscores (e.g., full_name)
                      </p>
                    </div>

                    <div>
                      <Label>Field Type *</Label>
                      <Select
                        value={field.type}
                        onValueChange={(value) => updateField(index, { type: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={field.description}
                      onChange={(e) => updateField(index, { description: e.target.value })}
                      placeholder="Describe this field..."
                      className="mt-1"
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`required-${field.id}`}
                      checked={field.required}
                      onChange={(e) => updateField(index, { required: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor={`required-${field.id}`} className="font-normal cursor-pointer">
                      Required field
                    </Label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button (Bottom) */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.push(`/dashboard/schemas/${schemaId}`)}
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}


