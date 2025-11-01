'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  CheckCircle2, 
  XCircle, 
  Info, 
  FileText, 
  Mail, 
  Phone, 
  MapPin, 
  Building, 
  Briefcase,
  Globe,
  Calendar,
  Hash,
  Type,
  Image,
  File,
  RefreshCw
} from 'lucide-react'
import type { ExtractedField } from '@/lib/universal-file-parser'

interface FieldSelection {
  use: boolean
  required: boolean
  mappedTo?: string // Existing schema field name
}

interface FieldExtractionSummaryProps {
  extractedFields: ExtractedField[]
  existingSchemaFields: Array<{ name: string; type: string; description?: string }>
  schemaId?: string
  onFieldsSelected: (selections: Record<string, FieldSelection>) => void
  onFieldsToAdd: (fields: Array<{ name: string; type: string; description: string; required: boolean }>) => void
  onSchemaRefresh?: () => Promise<void> | void // Callback to refresh schema after fields are added
}

type FieldCategory = 'contact' | 'identity' | 'location' | 'organization' | 'metadata' | 'other'

const FIELD_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="h-4 w-4" />,
  phone: <Phone className="h-4 w-4" />,
  name: <FileText className="h-4 w-4" />,
  address: <MapPin className="h-4 w-4" />,
  company: <Building className="h-4 w-4" />,
  job_title: <Briefcase className="h-4 w-4" />,
  url: <Globe className="h-4 w-4" />,
  date: <Calendar className="h-4 w-4" />,
  number: <Hash className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
  image: <Image className="h-4 w-4" />,
  pdf: <File className="h-4 w-4" />
}

function categorizeField(field: ExtractedField): FieldCategory {
  const name = field.fieldName.toLowerCase()
  const type = field.suggestedType

  if (type === 'email' || type === 'phone') return 'contact'
  if (type === 'name') return 'identity'
  if (type === 'address' || type === 'city' || type === 'country') return 'location'
  if (type === 'company' || type === 'job_title' || type === 'industry') return 'organization'
  if (type === 'date' || type === 'url' || type === 'number') return 'metadata'
  return 'other'
}

function getCategoryLabel(category: FieldCategory): string {
  const labels: Record<FieldCategory, string> = {
    contact: 'Contact Information',
    identity: 'Identity',
    location: 'Location',
    organization: 'Organization',
    metadata: 'Metadata',
    other: 'Other'
  }
  return labels[category]
}

function getCategoryColor(category: FieldCategory): string {
  const colors: Record<FieldCategory, string> = {
    contact: 'bg-blue-100 text-blue-800 border-blue-300',
    identity: 'bg-purple-100 text-purple-800 border-purple-300',
    location: 'bg-green-100 text-green-800 border-green-300',
    organization: 'bg-orange-100 text-orange-800 border-orange-300',
    metadata: 'bg-gray-100 text-gray-800 border-gray-300',
    other: 'bg-yellow-100 text-yellow-800 border-yellow-300'
  }
  return colors[category]
}

export function FieldExtractionSummary({
  extractedFields,
  existingSchemaFields,
  schemaId,
  onFieldsSelected,
  onFieldsToAdd,
  onSchemaRefresh
}: FieldExtractionSummaryProps) {
  const [selections, setSelections] = useState<Record<string, FieldSelection>>({})
  const [showMapping, setShowMapping] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)

  // Initialize selections - default to all fields enabled
  useEffect(() => {
    const initial: Record<string, FieldSelection> = {}
    extractedFields.forEach(field => {
      // Try to auto-map to existing schema fields
      const existingMatch = existingSchemaFields.find(sf => 
        sf.name && 
        sf.name.trim().length > 0 &&
        (sf.name.toLowerCase() === field.fieldName.toLowerCase() ||
        sf.type === field.suggestedType)
      )
      
      initial[field.fieldName] = {
        use: true,
        required: false,
        mappedTo: existingMatch?.name && existingMatch.name.trim().length > 0 ? existingMatch.name : undefined
      }
    })
    setSelections(initial)
  }, [extractedFields, existingSchemaFields])

  // Group fields by category
  const categorizedFields = extractedFields.reduce((acc, field) => {
    const category = categorizeField(field)
    if (!acc[category]) acc[category] = []
    acc[category].push(field)
    return acc
  }, {} as Record<FieldCategory, ExtractedField[]>)

  const handleToggleUse = (fieldName: string, use: boolean) => {
    setSelections(prev => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        use,
        required: use ? prev[fieldName]?.required || false : false
      }
    }))
  }

  const handleToggleRequired = (fieldName: string, required: boolean) => {
    setSelections(prev => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        required
      }
    }))
  }

  const handleMappingChange = (fieldName: string, mappedTo: string) => {
    setSelections(prev => ({
      ...prev,
      [fieldName]: {
        ...prev[fieldName],
        mappedTo: mappedTo === 'new' || !mappedTo || mappedTo.trim().length === 0 ? undefined : mappedTo.trim()
      }
    }))
  }

  const handleApply = async () => {
    setIsApplying(true)
    setApplyError(null)
    setApplySuccess(false)

    try {
      // Notify parent of selections
      onFieldsSelected(selections)

      // Prepare fields to add
      const fieldsToAdd = Object.entries(selections)
        .filter(([_, sel]) => sel.use && !sel.mappedTo)
        .map(([fieldName, sel]) => {
          const field = extractedFields.find(f => f.fieldName === fieldName)!
          return {
            name: fieldName,
            type: field.suggestedType,
            description: `Extracted from uploaded file (confidence: ${Math.round(field.confidence * 100)}%)`,
            required: sel.required
          }
        })

      if (fieldsToAdd.length > 0) {
        // If schemaId is provided, add fields via API
        if (schemaId) {
          const response = await fetch(`/api/schemas/${schemaId}/add-fields`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fields: fieldsToAdd.map(f => ({
                name: f.name,
                type: f.type,
                description: f.description,
                required: f.required
              }))
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to add fields to schema')
          }

          const result = await response.json()
          console.log('[FieldExtractionSummary] Fields added:', result)
          
          // Update existing schema fields list
          if (result.addedFields && result.addedFields.length > 0) {
            // Call the callback with the added fields
            onFieldsToAdd(fieldsToAdd)
            
            // Refresh schema if callback provided - this will reload fields from DB
            if (onSchemaRefresh) {
              console.log('[FieldExtractionSummary] Refreshing schema...')
              try {
                // Add a delay to ensure DB write is committed and to allow UI to show success first
                await new Promise(resolve => setTimeout(resolve, 500))
                
                // Call refresh - this should update the parent component's fields state
                await onSchemaRefresh()
                
                console.log('[FieldExtractionSummary] Schema refreshed successfully, added', result.addedFields.length, 'fields')
                
                // Small delay to ensure state propagates
                await new Promise(resolve => setTimeout(resolve, 100))
              } catch (error) {
                console.error('[FieldExtractionSummary] Error refreshing schema:', error)
                throw error // Re-throw so error message shows
              }
            }
            
            setApplySuccess(true)
            
            // Clear success message after 5 seconds
            setTimeout(() => setApplySuccess(false), 5000)
          } else {
            throw new Error('No fields were added. They may already exist.')
          }
        } else {
          // No schemaId, just call the callback
          onFieldsToAdd(fieldsToAdd)
          setApplySuccess(true)
          setTimeout(() => setApplySuccess(false), 3000)
        }
      } else {
        // No new fields to add, but selections are still applied
        setApplySuccess(true)
        setTimeout(() => setApplySuccess(false), 3000)
      }
    } catch (error) {
      console.error('[FieldExtractionSummary] Error applying fields:', error)
      setApplyError(error instanceof Error ? error.message : 'Failed to apply field selections')
    } finally {
      setIsApplying(false)
    }
  }

  const selectedCount = Object.values(selections).filter(s => s.use).length
  const newFieldsCount = Object.values(selections).filter(s => s.use && !s.mappedTo).length

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Extracted Schema Fields</CardTitle>
            <CardDescription>
              Review and configure fields extracted from uploaded files
            </CardDescription>
          </div>
          <Badge variant="outline">
            {extractedFields.length} fields found
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{extractedFields.length}</div>
            <div className="text-sm text-blue-600">Total Fields</div>
          </div>
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-700">{selectedCount}</div>
            <div className="text-sm text-green-600">Selected</div>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-2xl font-bold text-purple-700">{newFieldsCount}</div>
            <div className="text-sm text-purple-600">New Fields</div>
          </div>
        </div>

        {/* Fields by Category */}
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-6">
            {(Object.keys(categorizedFields) as FieldCategory[]).map(category => {
              const fields = categorizedFields[category]
              if (fields.length === 0) return null

              return (
                <div key={category} className="space-y-3">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${getCategoryColor(category)}`}>
                    <span className="font-semibold">{getCategoryLabel(category)}</span>
                    <Badge variant="secondary" className="ml-auto">
                      {fields.length}
                    </Badge>
                  </div>

                  <div className="space-y-3 pl-4">
                    {fields.map(field => {
                      const selection = selections[field.fieldName] || { use: false, required: false }
                      const Icon = FIELD_ICONS[field.suggestedType] || <FileText className="h-4 w-4" />

                      return (
                        <Card key={field.fieldName} className="border">
                          <CardContent className="p-4 space-y-4">
                            {/* Field Header */}
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3 flex-1">
                                <div className="mt-1">{Icon}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Label className="font-semibold text-base">{field.fieldName}</Label>
                                    <Badge variant="outline" className="text-xs">
                                      {field.suggestedType}
                                    </Badge>
                                    <Badge 
                                      variant={field.confidence > 0.8 ? "default" : "secondary"}
                                      className="text-xs"
                                    >
                                      {Math.round(field.confidence * 100)}% confidence
                                    </Badge>
                                  </div>
                                  
                                  {/* Example Values */}
                                  {field.exampleValues.length > 0 && (
                                    <div className="mt-2 text-sm text-gray-600">
                                      <span className="font-medium">Examples: </span>
                                      <span className="text-gray-500">
                                        {field.exampleValues.slice(0, 3).join(', ')}
                                        {field.exampleValues.length > 3 && ` (+${field.exampleValues.length - 3} more)`}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Use Toggle */}
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id={`use-${field.fieldName}`}
                                    checked={selection.use}
                                    onCheckedChange={(checked) => 
                                      handleToggleUse(field.fieldName, checked as boolean)
                                    }
                                  />
                                  <Label 
                                    htmlFor={`use-${field.fieldName}`}
                                    className="text-sm cursor-pointer"
                                  >
                                    Use
                                  </Label>
                                </div>
                              </div>
                            </div>

                            {/* Field Configuration (only if enabled) */}
                            {selection.use && (
                              <div className="space-y-3 pt-3 border-t">
                                {/* Map to Existing Field */}
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">
                                    Map to existing field:
                                  </Label>
                                  <Select
                                    value={(() => {
                                      const mapped = selection.mappedTo
                                      if (!mapped || typeof mapped !== 'string' || mapped.trim().length === 0) {
                                        return 'new'
                                      }
                                      // Verify the mapped field still exists and has a valid name
                                      const fieldExists = existingSchemaFields.some(sf => sf.name && sf.name.trim() === mapped.trim())
                                      return fieldExists ? mapped.trim() : 'new'
                                    })()}
                                    onValueChange={(value) => {
                                      // Ensure value is never empty string
                                      if (!value || value.trim().length === 0) {
                                        handleMappingChange(field.fieldName, 'new')
                                      } else {
                                        handleMappingChange(field.fieldName, value)
                                      }
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select field or create new" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="new">
                                        Create new field: {field.fieldName}
                                      </SelectItem>
                                      <SelectSeparator />
                                      {existingSchemaFields
                                        .filter(sf => 
                                          sf.name && 
                                          typeof sf.name === 'string' &&
                                          sf.name.trim().length > 0 && 
                                          (sf.type === field.suggestedType || !selection.mappedTo)
                                        )
                                        .map(sf => {
                                          const fieldValue = sf.name.trim()
                                          // Double-check value is not empty before rendering
                                          if (!fieldValue || fieldValue.length === 0) {
                                            return null
                                          }
                                          return (
                                            <SelectItem key={fieldValue} value={fieldValue}>
                                              {sf.name} ({sf.type})
                                            </SelectItem>
                                          )
                                        })
                                        .filter(Boolean)}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Required Toggle */}
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id={`required-${field.fieldName}`}
                                    checked={selection.required}
                                    onCheckedChange={(checked) => 
                                      handleToggleRequired(field.fieldName, checked as boolean)
                                    }
                                  />
                                  <Label 
                                    htmlFor={`required-${field.fieldName}`}
                                    className="text-sm cursor-pointer"
                                  >
                                    Mark as required field
                                  </Label>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 pt-4 border-t">
          {applyError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{applyError}</AlertDescription>
            </Alert>
          )}
          
          {applySuccess && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Field selections applied successfully!
                {newFieldsCount > 0 && ` ${newFieldsCount} new field(s) added to schema.`}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>{selectedCount}</strong> field(s) selected. 
                {newFieldsCount > 0 && (
                  <span> <strong>{newFieldsCount}</strong> new field(s) will be added to your schema.</span>
                )}
              </AlertDescription>
            </Alert>

            <Button 
              onClick={handleApply} 
              disabled={isApplying}
              className="ml-4"
            >
              {isApplying ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Apply Field Selections
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

