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
    <div className="space-y-8 max-w-6xl mx-auto p-4 sm:p-6">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Edit Schema: {schema.name}
        </h1>
        <p className="text-xl text-muted-foreground">{schema.description}</p>
      </div>

      <Card className="glass-effect shadow-medium border-0">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Schema Information</CardTitle>
          <CardDescription className="text-lg">Update your schema details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3">
            <Label htmlFor="schema-name" className="text-base font-medium">
              Schema Name
            </Label>
            <Input
              id="schema-name"
              value={schemaName}
              onChange={(e) => setSchemaName(e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="grid gap-3">
            <Label htmlFor="schema-description" className="text-base font-medium">
              Description
            </Label>
            <Textarea
              id="schema-description"
              value={schemaDescription}
              onChange={(e) => setSchemaDescription(e.target.value)}
              className="min-h-[100px] text-base"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-effect shadow-medium border-0">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-semibold">Schema Fields ({fields.length})</CardTitle>
              <CardDescription className="text-lg">Manage your data structure</CardDescription>
            </div>
            <Button onClick={addField} size="lg" className="gradient-primary text-white shadow-soft w-full sm:w-auto">
              <Plus className="mr-2 h-5 w-5" />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {fields.map((field) => (
              <div key={field.id} className="border border-border/50 rounded-xl p-6 bg-card/30 shadow-soft">
                <div className="flex flex-col lg:flex-row items-start gap-6">
                  <div className="hidden lg:flex flex-shrink-0 mt-2">
                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <Label className="text-base font-medium">Field Name</Label>
                      <Input
                        value={field.name}
                        onChange={(e) => updateField(field.id, { name: e.target.value })}
                        placeholder="e.g., first_name"
                        className="h-11 text-base mt-2"
                      />
                    </div>
                    <div>
                      <Label className="text-base font-medium">Type</Label>
                      <Badge variant="outline" className="w-full justify-center h-11 text-base mt-2">
                        {field.type}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-base font-medium">Description</Label>
                      <Input
                        value={field.description}
                        onChange={(e) => updateField(field.id, { description: e.target.value })}
                        placeholder="Field description..."
                        className="h-11 text-base mt-2"
                      />
                    </div>
                  </div>
                  <div className="flex flex-row lg:flex-col items-center gap-3 w-full lg:w-auto">
                    <Badge variant={field.required ? "default" : "secondary"} className="flex-shrink-0 px-4 py-2">
                      {field.required ? "Required" : "Optional"}
                    </Badge>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateField(field.id, { required: !field.required })}
                        className="border-primary/20 hover:bg-primary/5"
                      >
                        Toggle
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeField(field.id)}
                        className="border-destructive/20 hover:bg-destructive/5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-4">
        <Button
          variant="outline"
          onClick={() => router.back()}
          size="lg"
          className="w-full sm:w-auto border-primary/20 hover:bg-primary/5"
        >
          Cancel
        </Button>
        <Button
          onClick={saveSchema}
          disabled={isSaving || !schemaName.trim() || fields.length === 0}
          size="lg"
          className="w-full sm:w-auto gradient-primary text-white shadow-medium"
        >
          <Save className="mr-2 h-5 w-5" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
