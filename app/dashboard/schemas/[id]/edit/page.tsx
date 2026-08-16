"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
import { ExampleFileUpload } from "@/components/example-file-upload"
import { AILabelingMapping } from "@/components/ai-labeling-mapping"

interface Field {
  id: string
  name: string
  type: string
  description: string
  required: boolean
  /**
   * Value constraints — allowed options for select fields, and numeric/length
   * bounds. Populated by schema discovery and consumed by generation as an
   * enum, so they must survive an edit round-trip untouched.
   */
  constraints?: {
    min?: number
    max?: number
    options?: string[]
    format?: string
  }
  linkedFieldConfig?: any
}

interface Schema {
  id: string
  name: string
  description: string
  schema_definition: {
    fields: Field[]
    metadata?: Record<string, any>
    [key: string]: any
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
  const [fieldsVersion, setFieldsVersion] = useState(0) // Force re-render trigger
  const [forceRender, setForceRender] = useState(0) // Additional force render counter
  const [isRefreshingFields, setIsRefreshingFields] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fieldsRef = useRef<Field[]>([]) // Keep a ref for latest fields

  // Debug: Log when fields change
  useEffect(() => {
    console.log('[EditSchemaPage] Fields state changed. Count:', fields.length, 'Fields:', fields.map(f => f.name))
    fieldsRef.current = fields // Keep ref in sync
  }, [fields])

  const loadSchema = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setIsLoading(true)
      }
      setError(null)

      const response = await fetch(`/api/db?t=${Date.now()}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          action: 'select',
          table: 'schemas',
          columns: 'id,name,description,schema_definition',
          where: { op: 'eq', column: 'id', value: schemaId }
        }),
        cache: 'no-store'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to load schema')
      }

      const data = await response.json()
      console.log('[EditSchemaPage] ===== FULL API RESPONSE =====')
      console.log('[EditSchemaPage] Response data:', JSON.stringify(data, null, 2))
      
      if (data.data && data.data.length > 0) {
        const schemaData = data.data[0]
        console.log('[EditSchemaPage] Schema data received:', schemaData)
        console.log('[EditSchemaPage] schema_definition raw:', schemaData.schema_definition)
        console.log('[EditSchemaPage] schema_definition type:', typeof schemaData.schema_definition)
        console.log('[EditSchemaPage] schema_definition isArray:', Array.isArray(schemaData.schema_definition))
        console.log('[EditSchemaPage] schema_definition keys:', schemaData.schema_definition ? Object.keys(schemaData.schema_definition) : 'N/A')
        
        // Parse schema_definition if it's a string
        let schemaDefinition = schemaData.schema_definition
        if (typeof schemaDefinition === 'string') {
          try {
            schemaDefinition = JSON.parse(schemaDefinition)
            console.log('[EditSchemaPage] Parsed schema_definition:', schemaDefinition)
          } catch (e) {
            console.error('[EditSchemaPage] Failed to parse schema_definition:', e)
            schemaDefinition = { fields: [] }
          }
        }
        
        const updatedFields = schemaDefinition?.fields || []
        console.log('[EditSchemaPage] ===== FIELDS EXTRACTED =====')
        console.log('[EditSchemaPage] Field count:', updatedFields.length)
        console.log('[EditSchemaPage] Fields:', JSON.stringify(updatedFields.map((f: any) => ({ name: f.name, id: f.id, type: f.type })), null, 2))
        
        // Ensure all fields have IDs
        const fieldsWithIds = updatedFields.map((f: any, index: number) => ({
          ...f,
          id: f.id || `field-${Date.now()}-${index}-${Math.random().toString(36).substring(7)}`,
          name: f.name || '',
          type: f.type || 'text',
          description: f.description || '',
          required: f.required || false
        }))
        
        console.log('[EditSchemaPage] Setting fields state with', fieldsWithIds.length, 'fields')
        
        // Update schema object
        setSchema({
          ...schemaData,
          schema_definition: schemaDefinition
        })
        setName(schemaData.name)
        setDescription(schemaData.description || '')
        
        // CRITICAL: Create completely new array and update state.
        // Spread the whole field: listing keys explicitly here silently dropped
        // constraints (discovered option sets) and linkedFieldConfig, which the
        // save below would then write back as lost.
        const newFields = fieldsWithIds.map((f: Field) => ({ ...f }))
        
        // Update ref FIRST
        fieldsRef.current = newFields
        
        // CRITICAL: Update state with a completely new array reference
        // Use setTimeout to ensure React batches this properly
        await new Promise(resolve => setTimeout(resolve, 0))
        
        // Set fields state
        setFields([...newFields])
        console.log('[EditSchemaPage] loadSchema - setFields called with', newFields.length, 'fields')
        
        // Force version increment AND force render IMMEDIATELY (use functional updates to avoid closure)
        setFieldsVersion(prev => {
          const newV = prev + 1
          console.log('[EditSchemaPage] loadSchema - fieldsVersion:', prev, '->', newV)
          return newV
        })
        setForceRender(prev => {
          const newR = prev + 1
          console.log('[EditSchemaPage] loadSchema - forceRender:', prev, '->', newR)
          return newR
        })
        
        // Double-check: Log what we're setting
        console.log('[EditSchemaPage] Fields being set:', JSON.stringify(newFields.map(f => ({ name: f.name, id: f.id }))))
        
        // Force one more update after a tick to ensure React sees it
        setTimeout(() => {
          const currentFieldsInState = fields.length
          const currentFieldsInRef = fieldsRef.current.length
          console.log('[EditSchemaPage] Post-update check - state:', currentFieldsInState, 'ref:', currentFieldsInRef)
          if (currentFieldsInState !== newFields.length) {
            console.log('[EditSchemaPage] State mismatch detected! Forcing update again...')
            setFields([...newFields])
            setFieldsVersion(v => v + 1)
            setForceRender(r => r + 1)
          }
        }, 50)
      } else {
        throw new Error("Schema not found")
      }
    } catch (error) {
      console.error("Error loading schema:", error)
      setError(error instanceof Error ? error.message : "Failed to load schema")
      if (showLoading) {
        toast.error("Failed to load schema")
      }
    } finally {
      if (showLoading) {
        setIsLoading(false)
      }
    }
  }, [schemaId])

  // Load schema on mount
  useEffect(() => {
    if (schemaId) {
      loadSchema()
    }
  }, [schemaId, loadSchema])

  // Refresh schema fields - Use loadSchema which is now stable
  const refreshFields = useCallback(async () => {
    console.log('[EditSchemaPage] ===== REFRESH FIELDS CALLED =====')
    const oldCount = fieldsRef.current.length
    console.log('[EditSchemaPage] Current fields count:', oldCount)
    console.log('[EditSchemaPage] Current fields state count:', fields.length)
    
    setIsRefreshingFields(true)
    
    try {
      // Wait for DB transaction to commit - longer wait to ensure it's saved
      await new Promise(resolve => setTimeout(resolve, 800))
      
      // Call loadSchema which is now a stable useCallback
      console.log('[EditSchemaPage] Calling loadSchema(false)...')
      await loadSchema(false)
      
      // Wait for state to update - longer wait
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Check both ref and state
      const newCountRef = fieldsRef.current.length
      const newCountState = fields.length
      console.log('[EditSchemaPage] After refresh - ref count:', newCountRef, 'state count:', newCountState)
      console.log('[EditSchemaPage] Ref fields:', fieldsRef.current.map(f => f.name))
      console.log('[EditSchemaPage] State fields:', fields.map(f => f.name))
      
      // Force one more state check - CRITICAL FIX
      if (newCountState === 0 && newCountRef > 0) {
        console.log('[EditSchemaPage] ===== STATE IS STALE! FORCING UPDATE =====')
        console.log('[EditSchemaPage] Ref has', newCountRef, 'fields but state has 0')
        console.log('[EditSchemaPage] Ref fields:', JSON.stringify(fieldsRef.current.map(f => ({ name: f.name, id: f.id }))))
        
        // Force update multiple times to ensure React sees it
        const fieldsToSet = [...fieldsRef.current]
        setFields(fieldsToSet)
        setFieldsVersion(v => v + 1)
        setForceRender(r => r + 1)
        
        // Wait and check again
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // If still not updated, try one more time with different approach
        if (fields.length === 0 && fieldsRef.current.length > 0) {
          console.log('[EditSchemaPage] Still stale after first attempt, trying again...')
          setFields([...fieldsRef.current.map(f => ({ ...f }))])
          setFieldsVersion(v => v + 1)
          setForceRender(r => r + 1)
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        const finalStateCount = fields.length
        console.log('[EditSchemaPage] After force update - state count:', finalStateCount)
      }
      
      const finalCount = fieldsRef.current.length
      if (finalCount > oldCount) {
        toast.success(`✓ ${finalCount - oldCount} new field(s) added! Total: ${finalCount}`)
      } else if (finalCount > 0 && oldCount === 0) {
        toast.success(`✓ Schema refreshed! ${finalCount} field(s) loaded.`)
      } else if (finalCount > 0) {
        toast.success(`✓ Schema refreshed! ${finalCount} field(s) total.`)
      }
    } catch (error) {
      console.error('[EditSchemaPage] Error refreshing fields:', error)
      toast.error('Failed to refresh schema fields')
      throw error
    } finally {
      setIsRefreshingFields(false)
    }
  }, [loadSchema, fields]) // Include fields to detect state changes

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
    setIsSaving(true)
    setError(null)

    try {
      // Use the current state (fields that user has edited)
      const currentFields = fields.length > 0 ? fields : fieldsRef.current
      console.log('[EditSchemaPage] handleSave - Saving with', currentFields.length, 'fields')
      console.log('[EditSchemaPage] Fields to save:', currentFields.map(f => ({ name: f.name, type: f.type })))
      
      // Validate
      if (!name.trim()) {
        toast.error("Schema name is required")
        setIsSaving(false)
        return
      }

      if (currentFields.length === 0) {
        toast.error("At least one field is required")
        setIsSaving(false)
        return
      }

      const fieldNames = new Set<string>()
      for (const field of currentFields) {
        if (!field.name || !field.name.trim()) {
          toast.error("All fields must have a name")
          setIsSaving(false)
          return
        }
        if (fieldNames.has(field.name)) {
          toast.error(`Duplicate field name: ${field.name}`)
          setIsSaving(false)
          return
        }
        fieldNames.add(field.name)
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.name)) {
          toast.error(`Invalid field name: ${field.name}. Use only letters, numbers, and underscores, starting with a letter.`)
          setIsSaving(false)
          return
        }
      }

      // Prepare schema definition with all fields.
      //
      // Everything not edited on this page is carried through untouched. Only
      // the edited keys are overwritten — previously this rebuilt each field
      // from five properties, so saving a discovered schema silently destroyed
      // its constraints (the induced option sets generation relies on) and any
      // linkedFieldConfig, along with the definition's own metadata.
      const schemaDefinition = {
        ...(schema?.schema_definition || {}),
        fields: currentFields.map(f => ({
          ...f,
          id: f.id || `field-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          name: f.name.trim(),
          type: f.type,
          description: f.description || '',
          required: f.required || false
        }))
      }

      console.log('[EditSchemaPage] Sending update request with:', {
        name,
        description,
        fieldCount: schemaDefinition.fields.length
      })

      const response = await fetch(`/api/schemas/${schemaId}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          schema_definition: schemaDefinition
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[EditSchemaPage] Update failed:', errorData)
        throw new Error(errorData.error || 'Failed to update schema')
      }

      const result = await response.json()
      console.log('[EditSchemaPage] Update successful:', result)

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
      <Card key={`fields-card-${fieldsVersion}-${fields.length}-${forceRender}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Schema Fields ({fields.length})</CardTitle>
              <CardDescription>Define the fields for your data generation</CardDescription>
            </div>
            <Button onClick={addField} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isRefreshingFields ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
              <p className="text-muted-foreground">Refreshing fields...</p>
            </div>
          ) : (!fields || fields.length === 0) ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <p className="text-muted-foreground mb-4">No fields added yet</p>
              <Button onClick={addField} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Field
              </Button>
            </div>
          ) : (
            <div className="space-y-4" key={`fields-list-${fieldsVersion}-${forceRender}`}>
              {fields && fields.map((field, index) => (
                <div key={`${field.id || `field-${index}`}-${fieldsVersion}-${forceRender}`} className="border rounded-lg p-4 space-y-4">
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

      {/* Example Files Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Example Files (Optional)</CardTitle>
          <CardDescription>
            Upload example files to extract and add fields to your schema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExampleFileUpload
            schemaId={schemaId}
            schemaFields={fields.map(f => ({
              name: f.name,
              type: f.type,
              description: f.description
            }))}
            onSchemaRefresh={refreshFields}
            onFieldsAdded={(newFields) => {
              toast.success(`${newFields.length} field(s) added to schema!`)
            }}
          />
        </CardContent>
      </Card>

      {/* AI Auto-Labeling & Schema Mapping */}
      {fields.length > 0 && (
        <AILabelingMapping
          schemaId={schemaId}
          onMappingComplete={(mappings, coverage) => {
            console.log('Mapping complete:', { mappings, coverage })
            toast.success(`Auto-labeling complete! Precision: ${Math.round(coverage.precision * 100)}%`)
          }}
        />
      )}

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




