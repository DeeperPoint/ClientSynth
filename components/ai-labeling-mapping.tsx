'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Download,
  RefreshCw,
  Target,
  BarChart3,
  FileText,
  CheckCircle,
  XCircle as XCircleIcon
} from 'lucide-react'

interface FieldMapping {
  extractedField: string
  extractedFieldType: string
  schemaField: string | null
  confidence: number
  action: 'map' | 'add' | 'skip'
  issues?: string[]
}

interface CoverageMetrics {
  fieldCoverage: {
    totalFields: number
    coveredFields: number
    missingFields: string[]
    coveragePercentage: number
  }
  recordCoverage: {
    totalRecords: number
    validatedRecords: number
    invalidRecords: number
    coveragePercentage: number
  }
  precision: number
  fieldMappings: FieldMapping[]
  validationResults: Array<{
    fieldName: string
    isValid: boolean
    issues: string[]
    coverage: {
      provided: number
      required: number
      percentage: number
    }
  }>
}

interface AILabelingMappingProps {
  schemaId: string
  onMappingComplete?: (mappings: FieldMapping[], coverage: CoverageMetrics) => void
}

export function AILabelingMapping({ schemaId, onMappingComplete }: AILabelingMappingProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [mappings, setMappings] = useState<FieldMapping[]>([])
  const [coverage, setCoverage] = useState<CoverageMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [precisionPass, setPrecisionPass] = useState(false)

  const runAutoLabeling = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/schemas/${schemaId}/examples/auto-label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Auto-labeling failed')
      }

      const data = await response.json()
      setMappings(data.mappings || [])
      setCoverage(data.coverage)
      
      // Check if precision meets ≥90% requirement
      const precision = data.coverage?.precision || 0
      setPrecisionPass(precision >= 0.9)

      if (onMappingComplete) {
        onMappingComplete(data.mappings, data.coverage)
      }
    } catch (err) {
      console.error('Auto-labeling error:', err)
      setError(err instanceof Error ? err.message : 'Auto-labeling failed')
    } finally {
      setIsLoading(false)
    }
  }

  const exportSeeds = async (format: 'json' | 'csv' = 'json') => {
    try {
      const response = await fetch(`/api/schemas/${schemaId}/examples/export-seeds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          includeReport: true
        })
      })

      if (!response.ok) {
        throw new Error('Export failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `seeds_${schemaId}_${Date.now()}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Export error:', err)
      alert('Failed to export seeds. Please try again.')
    }
  }

  useEffect(() => {
    // Load existing mappings if available
    fetch(`/api/schemas/${schemaId}/examples/auto-label`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.mappings) {
          setMappings(data.mappings)
          setCoverage(data.coverage)
          const precision = data.coverage?.precision || 0
          setPrecisionPass(precision >= 0.9)
        }
      })
      .catch(() => {
        // Ignore errors on load
      })
  }, [schemaId])

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800 border-green-300'
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    return 'bg-red-100 text-red-800 border-red-300'
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'map':
        return <Badge variant="default" className="bg-blue-500">Map</Badge>
      case 'add':
        return <Badge variant="secondary" className="bg-purple-500">Add New</Badge>
      case 'skip':
        return <Badge variant="outline">Skip</Badge>
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Auto-Labeling & Schema Mapping
              </CardTitle>
              <CardDescription>
                Automatically cluster, tag, and align example files to your schema
              </CardDescription>
            </div>
            <Button
              onClick={runAutoLabeling}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Run Auto-Labeling
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {coverage && (
            <div className="space-y-4">
              {/* Precision Alert */}
              <Alert variant={precisionPass ? 'default' : 'destructive'}>
                <div className="flex items-center gap-2">
                  {precisionPass ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>
                    <strong>Precision: {Math.round(coverage.precision * 100)}%</strong>
                    {precisionPass ? (
                      <span className="ml-2">✓ Meets ≥90% requirement</span>
                    ) : (
                      <span className="ml-2">⚠ Below 90% requirement - review mappings</span>
                    )}
                  </AlertDescription>
                </div>
              </Alert>

              <Tabs defaultValue="coverage" className="w-full">
                <TabsList>
                  <TabsTrigger value="coverage">Coverage Metrics</TabsTrigger>
                  <TabsTrigger value="mappings">Field Mappings</TabsTrigger>
                  <TabsTrigger value="validation">Schema Validation</TabsTrigger>
                </TabsList>

                <TabsContent value="coverage" className="space-y-4">
                  {/* Field Coverage */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Field Coverage
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            {coverage.fieldCoverage.coveredFields} / {coverage.fieldCoverage.totalFields} fields covered
                          </span>
                          <span className="text-sm font-bold">
                            {Math.round(coverage.fieldCoverage.coveragePercentage)}%
                          </span>
                        </div>
                        <Progress value={coverage.fieldCoverage.coveragePercentage} className="h-2" />
                      </div>

                      {coverage.fieldCoverage.missingFields.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">Missing Fields:</p>
                          <div className="flex flex-wrap gap-2">
                            {coverage.fieldCoverage.missingFields.map((field) => (
                              <Badge key={field} variant="outline" className="bg-yellow-50">
                                {field}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Record Coverage */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Record Coverage
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Records</p>
                          <p className="text-2xl font-bold">{coverage.recordCoverage.totalRecords}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Validated</p>
                          <p className="text-2xl font-bold text-green-600">
                            {coverage.recordCoverage.validatedRecords}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Coverage</p>
                          <p className="text-2xl font-bold">
                            {Math.round(coverage.recordCoverage.coveragePercentage)}%
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="mappings" className="space-y-4">
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {mappings.map((mapping, index) => (
                        <Card key={index} className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="font-medium">{mapping.extractedField}</span>
                                <Badge variant="outline" className="text-xs">
                                  {mapping.extractedFieldType}
                                </Badge>
                                <span className="text-gray-400">→</span>
                                {mapping.schemaField ? (
                                  <span className="font-medium text-blue-600">{mapping.schemaField}</span>
                                ) : (
                                  <span className="text-gray-500 italic">New Field</span>
                                )}
                                {getActionBadge(mapping.action)}
                              </div>
                              <div className="flex items-center gap-2">
                                <Progress
                                  value={mapping.confidence * 100}
                                  className="h-1.5 w-32"
                                />
                                <span className={`text-xs font-medium ${getConfidenceColor(mapping.confidence).replace('bg-', 'text-').split(' ')[0]}`}>
                                  {Math.round(mapping.confidence * 100)}%
                                </span>
                              </div>
                              {mapping.issues && mapping.issues.length > 0 && (
                                <div className="mt-2">
                                  {mapping.issues.map((issue, i) => (
                                    <p key={i} className="text-xs text-red-600 flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      {issue}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="validation" className="space-y-4">
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {coverage.validationResults.map((result, index) => (
                        <Card key={index} className={`p-4 ${result.isValid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {result.isValid ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <XCircleIcon className="h-4 w-4 text-red-600" />
                                )}
                                <span className="font-medium">{result.fieldName}</span>
                                <Badge variant={result.isValid ? 'default' : 'destructive'}>
                                  {result.isValid ? 'Valid' : 'Invalid'}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground mb-2">
                                Coverage: {result.coverage.provided} / {result.coverage.required} ({Math.round(result.coverage.percentage)}%)
                              </div>
                              {result.issues.length > 0 && (
                                <div>
                                  {result.issues.map((issue, i) => (
                                    <p key={i} className="text-xs text-red-600 flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      {issue}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>

              {/* Export Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={() => exportSeeds('json')}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export JSON Seeds
                </Button>
                <Button
                  onClick={() => exportSeeds('csv')}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV Seeds
                </Button>
              </div>
            </div>
          )}

          {!coverage && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Click "Run Auto-Labeling" to analyze your example files and map them to your schema.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

