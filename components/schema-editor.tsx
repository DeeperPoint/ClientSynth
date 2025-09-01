"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, GripVertical, Save } from "lucide-react"
import { useRouter } from "next/navigation"

interface Schema {
  id: string
  name: string
  description: string
  schema_definition: any
}

interface SchemaField {
  id: string
  name: string
  type: string
  description: string
  required: boolean
}

interface SchemaEditorProps {
  schema: Schema
}

export function SchemaEditor({ schema }: SchemaEditorProps) {
  const [schemaName, setSchemaName] = useState(schema.name)
  const [schemaDescription, setSchemaDescription] = useState(schema.description)
  const [fields, setFields] = useState<SchemaField[]>(schema.schema_definition?.fields || [])
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
      const schemaDefinition = {
        fields: fields.map((field) => ({
          ...field,
          name: field.name.trim(),
        })),
        metadata: {
          version: "1.0",
          updated_at: new Date().toISOString(),
        },
      }

      const { error } = await supabase
        .from("schemas")
        .update({
          name: schemaName.trim(),
          description: schemaDescription.trim(),
          schema_definition: schemaDefinition,
        })
        .eq("id", schema.id)

      if (error) throw error

      router.push("/dashboard/schemas") // Updated route to use schemas (plural) for listing page
    } catch (error) {
      console.error("Error saving schema:", error)
      alert("Failed to save schema. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Schema Info */}
      <Card>
        <CardHeader>
          <CardTitle>Schema Information</CardTitle>
          <CardDescription>Update your schema details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="schema-name">Schema Name</Label>
            <Input id="schema-name" value={schemaName} onChange={(e) => setSchemaName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="schema-description">Description</Label>
            <Textarea
              id="schema-description"
              value={schemaDescription}
              onChange={(e) => setSchemaDescription(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Fields */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Schema Fields ({fields.length})</CardTitle>
              <CardDescription>Manage your data structure</CardDescription>
            </div>
            <Button onClick={addField} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {fields.map((field) => (
              <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-4">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Field Name</Label>
                      <Input
                        value={field.name}
                        onChange={(e) => updateField(field.id, { name: e.target.value })}
                        placeholder="e.g., first_name"
                      />
                    </div>
                    <div>
                      <Label>Type</Label>
                      <Badge variant="outline" className="w-full justify-center">
                        {field.type}
                      </Badge>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Input
                        value={field.description}
                        onChange={(e) => updateField(field.id, { description: e.target.value })}
                        placeholder="Field description..."
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={field.required ? "default" : "secondary"}>
                      {field.required ? "Required" : "Optional"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateField(field.id, { required: !field.required })}
                    >
                      Toggle
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeField(field.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={saveSchema} disabled={isSaving || !schemaName.trim() || fields.length === 0}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
