/**
 * Schema Induction Module
 * 
 * Clusters similar fields, refines field types, and generates complete schema definitions
 * from extracted data fields using heuristics and LLM-based analysis.
 */

import { ExtractedField } from './universal-file-parser'

export interface SchemaField {
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

export interface DiscoveredSchema {
  fields: SchemaField[]
  metadata: {
    version: string
    discovered_at: string
    confidence: number
    sourceFile: string
  }
}

export class SchemaInduction {
  constructor() {
  }

  /**
   * Main entry point: Generate schema from extracted fields
   */
  async induceSchema(
    extractedFields: ExtractedField[],
    fileName: string,
    useLLM: boolean = true
  ): Promise<DiscoveredSchema> {
    // 1. Cluster similar fields
    const clusteredFieldsMap = this.clusterFields(extractedFields)

    // 2. Merge clustered fields into single array
    const mergedFields: ExtractedField[] = []
    for (const [key, fieldList] of clusteredFieldsMap.entries()) {
      const merged = this.mergeFields(fieldList)
      mergedFields.push(merged)
    }

    // 3. Normalize field names
    const normalizedFields = mergedFields.map(field => ({
      ...field,
      fieldName: this.normalizeFieldName(field.fieldName)
    }))

    // 4. Refine field types
    const refinedFields = this.refineFieldTypes(normalizedFields)

    // 5. Detect constraints (required, enums, min/max)
    const fieldsWithConstraints = this.detectConstraints(refinedFields)

    // 6. Generate descriptions (optionally with LLM)
    let finalFields: SchemaField[]
    if (useLLM) {
      finalFields = await this.generateFieldDescriptionsWithLLM(fieldsWithConstraints)
    } else {
      finalFields = fieldsWithConstraints.map(field => ({
        ...field,
        description: this.generateDescription(field)
      }))
    }

    // 7. Calculate overall confidence
    const confidence = this.calculateOverallConfidence(finalFields, extractedFields)

    return {
      fields: finalFields,
      metadata: {
        version: "1.0",
        discovered_at: new Date().toISOString(),
        confidence,
        sourceFile: fileName
      }
    }
  }

  /**
   * Cluster similar field names (e.g., "First Name" and "firstName" → same field)
   */
  private clusterFields(fields: ExtractedField[]): Map<string, ExtractedField[]> {
    const clusters = new Map<string, ExtractedField[]>()
    const processed = new Set<string>()

    for (const field of fields) {
      if (processed.has(field.fieldName)) continue

      const normalizedName = this.normalizeFieldName(field.fieldName)
      const clusterKey = this.findBestCluster(normalizedName, Array.from(clusters.keys()))

      if (clusterKey && this.calculateSimilarity(normalizedName, clusterKey) > 0.8) {
        clusters.get(clusterKey)!.push(field)
      } else {
        clusters.set(normalizedName, [field])
      }

      processed.add(field.fieldName)
    }

    // Merge fields in same cluster
    const mergedClusters = new Map<string, ExtractedField>()
    for (const [key, fieldList] of clusters.entries()) {
      const merged = this.mergeFields(fieldList)
      mergedClusters.set(key, merged)
    }

    // Convert back to array for return (though we'll use this in normalizeFieldNames)
    return clusters
  }

  /**
   * Merge multiple fields into one, combining example values and taking highest confidence
   */
  private mergeFields(fields: ExtractedField[]): ExtractedField {
    if (fields.length === 1) return fields[0]

    const allExamples = new Set<string>()
    let highestConfidence = 0
    let bestType: ExtractedField['suggestedType'] = 'text'

    for (const field of fields) {
      field.exampleValues.forEach(v => allExamples.add(v))
      if (field.confidence > highestConfidence) {
        highestConfidence = field.confidence
        bestType = field.suggestedType
      }
    }

    return {
      fieldName: fields[0].fieldName, // Use first field name
      fieldType: bestType,
      exampleValues: Array.from(allExamples).slice(0, 20),
      confidence: Math.min(0.95, highestConfidence + 0.1), // Boost confidence when clustered
      suggestedType: bestType
    }
  }


  /**
   * Normalize a single field name to snake_case
   */
  private normalizeFieldName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      || 'field'
  }

  /**
   * Find best matching cluster for a field name
   */
  private findBestCluster(name: string, clusterKeys: string[]): string | null {
    let bestMatch: string | null = null
    let bestScore = 0.8 // Minimum similarity threshold

    for (const key of clusterKeys) {
      const score = this.calculateSimilarity(name, key)
      if (score > bestScore) {
        bestScore = score
        bestMatch = key
      }
    }

    return bestMatch
  }

  /**
   * Calculate string similarity (simple Levenshtein-based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    const distance = this.levenshteinDistance(longer, shorter)
    return (longer.length - distance) / longer.length
  }

  /**
   * Levenshtein distance calculation
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = []
    const len1 = str1.length
    const len2 = str2.length

    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }

    return matrix[len2][len1]
  }

  /**
   * Refine field types using enhanced heuristics
   */
  private refineFieldTypes(fields: ExtractedField[]): ExtractedField[] {
    return fields.map(field => {
      const refinedType = this.detectAdvancedType(field)
      return {
        ...field,
        fieldType: refinedType,
        suggestedType: refinedType
      }
    })
  }

  /**
   * Enhanced type detection with more heuristics
   */
  private detectAdvancedType(field: ExtractedField): ExtractedField['suggestedType'] {
    const name = field.fieldName.toLowerCase()
    const values = field.exampleValues

    // Check values first (most reliable)
    if (values.length > 0) {
      // Email detection
      if (values.some(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) {
        return 'email'
      }

      // URL detection
      if (values.some(v => /^https?:\/\//.test(v))) {
        return 'url'
      }

      // Phone detection
      if (values.some(v => /[\d\-\(\)\s\+]{10,}/.test(v) && /\d{10,}/.test(v))) {
        return 'phone'
      }

      // Date detection
      if (values.some(v => /^\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}$/.test(v) || 
          /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi.test(v))) {
        return 'date'
      }

      // Number detection
      const numericCount = values.filter(v => !isNaN(Number(v)) && v.trim() !== '').length
      if (numericCount / values.length > 0.8) {
        return 'number'
      }

      // Boolean detection
      const boolCount = values.filter(v => /^(true|false|yes|no|1|0)$/i.test(v.trim())).length
      if (boolCount / values.length > 0.8) {
        return 'boolean' as any // Type assertion for boolean
      }
    }

    // Fallback to name-based detection
    if (name.includes('email') || name.includes('e-mail')) return 'email'
    if (name.includes('phone') || name.includes('tel') || name.includes('mobile')) return 'phone'
    if (name.includes('url') || name.includes('website') || name.includes('link')) return 'url'
    if (name.includes('date') || name.includes('time') || name.includes('day')) return 'date'
    if (name.includes('age') || name.includes('count') || name.includes('amount') || name.includes('price')) return 'number'
    if (name.includes('name') && (name.includes('first') || name.includes('last'))) return 'name'
    if (name.includes('address') || name.includes('street') || name.includes('location')) return 'address'
    if (name.includes('company') || name.includes('organization') || name.includes('employer')) return 'company'
    if (name.includes('job') || name.includes('title') || name.includes('position') || name.includes('role')) return 'job_title'

    return 'text'
  }

  /**
   * Detect constraints: required fields, enums, min/max lengths
   */
  private detectConstraints(fields: ExtractedField[]): SchemaField[] {
    return fields.map(field => {
      const constraints: SchemaField['constraints'] = {}

      // Check if field appears to be enum/select (limited distinct values)
      const distinctValues = new Set(field.exampleValues.map(v => v.trim().toLowerCase()))
      if (distinctValues.size <= 10 && distinctValues.size > 0 && field.exampleValues.length >= 3) {
        constraints.options = Array.from(new Set(field.exampleValues)).slice(0, 20)
      }

      // Detect min/max length for text fields
      if (field.suggestedType === 'text' || field.suggestedType === 'name' || 
          field.suggestedType === 'address' || field.suggestedType === 'company') {
        const lengths = field.exampleValues.map(v => v.length).filter(l => l > 0)
        if (lengths.length > 0) {
          const minLength = Math.min(...lengths)
          const maxLength = Math.max(...lengths)
          if (minLength > 0) constraints.min = minLength
          if (maxLength < 1000) constraints.max = maxLength // Cap at reasonable limit
        }
      }

      // Detect numeric ranges
      if (field.suggestedType === 'number') {
        const numbers = field.exampleValues
          .map(v => Number(v))
          .filter(n => !isNaN(n))
        if (numbers.length > 0) {
          constraints.min = Math.min(...numbers)
          constraints.max = Math.max(...numbers)
        }
      }

      return {
        id: `field_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        name: field.fieldName,
        type: field.suggestedType,
        description: '', // Will be filled by generateFieldDescriptionsWithLLM
        required: field.confidence > 0.9, // High confidence = likely required
        constraints: Object.keys(constraints).length > 0 ? constraints : undefined
      }
    })
  }

  /**
   * Generate field descriptions using LLM
   */
  private async generateFieldDescriptionsWithLLM(fields: SchemaField[]): Promise<SchemaField[]> {
    try {
      // Prepare context for LLM
      const fieldContexts = fields.map(field => ({
        name: field.name,
        type: field.type,
        constraints: field.constraints
      }))

      const prompt = `You are a data schema expert. Generate concise, accurate descriptions for each field in a data schema.

Field definitions:
${fieldContexts.map((f, i) => `${i + 1}. Name: "${f.name}", Type: ${f.type}${f.constraints?.options ? `, Options: ${f.constraints.options.slice(0, 5).join(', ')}` : ''}`).join('\n')}

For each field, provide a brief description (1-2 sentences max) explaining what the field represents.

Respond with a JSON array of descriptions in the same order, where each item is: {"description": "..."}`

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
          "X-Title": "Client Synth",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that generates concise field descriptions for data schemas. Always respond with valid JSON only."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 1000
        }),
      })

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        throw new Error("No response from LLM")
      }

      // Parse JSON response
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error("Invalid JSON response from LLM")
      }

      const descriptions = JSON.parse(jsonMatch[0]) as Array<{ description: string }>

      // Merge descriptions with fields
      return fields.map((field, index) => ({
        ...field,
        description: descriptions[index]?.description || this.generateDescription(field)
      }))

    } catch (error) {
      console.warn('[SchemaInduction] LLM description generation failed, using heuristics:', error)
      // Fallback to heuristic descriptions
      return fields.map(field => ({
        ...field,
        description: this.generateDescription(field)
      }))
    }
  }

  /**
   * Generate description using heuristics (fallback)
   */
  private generateDescription(field: SchemaField): string {
    const name = field.name.toLowerCase().replace(/_/g, ' ')
    const typeMap: Record<string, string> = {
      'email': 'Email address',
      'phone': 'Phone number',
      'name': 'Person name',
      'address': 'Street address',
      'company': 'Company name',
      'job_title': 'Job title or position',
      'url': 'Web URL',
      'date': 'Date value',
      'number': 'Numeric value',
      'boolean': 'Boolean (true/false) value',
      'text': 'Text content'
    }

    return typeMap[field.type] || `Field for ${name}`
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(
    finalFields: SchemaField[],
    originalFields: ExtractedField[]
  ): number {
    if (finalFields.length === 0) return 0

    const avgConfidence = originalFields.reduce((sum, f) => sum + f.confidence, 0) / originalFields.length
    const fieldCountBonus = Math.min(0.1, finalFields.length * 0.01) // Bonus for more fields
    const constraintBonus = finalFields.filter(f => f.constraints).length / finalFields.length * 0.05

    return Math.min(0.95, avgConfidence + fieldCountBonus + constraintBonus)
  }
}

