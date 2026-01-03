/**
 * Schema Discovery Service
 * 
 * Main orchestrator for automatic schema discovery from uploaded data files.
 * Integrates file parsing, field extraction, and schema induction.
 */

import { UniversalFileParser, ExtractedField } from './universal-file-parser'
import { SchemaInduction, DiscoveredSchema, SchemaField } from './schema-induction'

export interface DiscoveryOptions {
  useLLM?: boolean // Whether to use LLM for description generation
  sampleSize?: number // Number of rows to sample for large files (default: 1000)
  minConfidence?: number // Minimum confidence threshold (default: 0.5)
}

export interface DiscoveryResult {
  success: boolean
  schema?: DiscoveredSchema
  errors?: string[]
  warnings?: string[]
  metadata?: {
    fileType: string
    fileSize: number
    recordCount: number
    fieldsDiscovered: number
    processingTime: number
  }
}

export class SchemaDiscovery {
  private fileParser: UniversalFileParser
  private schemaInduction: SchemaInduction

  constructor() {
    this.fileParser = new UniversalFileParser()
    this.schemaInduction = new SchemaInduction()
  }

  /**
   * Main entry point: Discover schema from uploaded file
   */
  async discoverSchema(
    file: File,
    options: DiscoveryOptions = {}
  ): Promise<DiscoveryResult> {
    const startTime = Date.now()
    const errors: string[] = []
    const warnings: string[] = []

    try {
      // 1. Validate file
      const validation = this.fileParser.validateFile(file)
      if (!validation.valid) {
        return {
          success: false,
          errors: [validation.error || 'File validation failed']
        }
      }

      // 2. Parse file to extract fields
      const parseResult = await this.fileParser.parseFile(file)

      if (!parseResult.success || !parseResult.fields || parseResult.fields.length === 0) {
        return {
          success: false,
          errors: [parseResult.error || 'Failed to extract fields from file'],
          metadata: {
            fileType: parseResult.metadata?.fileType || 'unknown',
            fileSize: file.size,
            recordCount: parseResult.metadata?.recordCount || 0,
            fieldsDiscovered: 0,
            processingTime: Date.now() - startTime
          }
        }
      }

      // 3. Filter fields by confidence if needed
      const minConfidence = options.minConfidence || 0.5
      let extractedFields = parseResult.fields.filter(f => f.confidence >= minConfidence)

      if (extractedFields.length === 0) {
        warnings.push(`All fields below confidence threshold (${minConfidence}). Using all fields.`)
        extractedFields = parseResult.fields
      }

      // Warn if some fields were filtered
      const filteredCount = parseResult.fields.length - extractedFields.length
      if (filteredCount > 0) {
        warnings.push(`${filteredCount} field(s) filtered due to low confidence (< ${minConfidence})`)
      }

      // 4. Sample data if needed (for large files)
      if (options.sampleSize && parseResult.metadata?.recordCount && 
          parseResult.metadata.recordCount > options.sampleSize) {
        extractedFields = this.sampleFields(extractedFields, options.sampleSize)
        warnings.push(`Large file detected. Sampling first ${options.sampleSize} rows for schema discovery.`)
      }

      // 5. Induce schema from extracted fields
      const useLLM = options.useLLM !== false // Default to true
      const schema = await this.schemaInduction.induceSchema(
        extractedFields,
        file.name,
        useLLM
      )

      // 6. Validate discovered schema
      const validationResult = this.validateDiscoveredSchema(schema)
      if (!validationResult.valid) {
        errors.push(...validationResult.errors)
      }

      if (errors.length > 0 && errors.length >= schema.fields.length) {
        return {
          success: false,
          errors,
          warnings,
          metadata: {
            fileType: parseResult.metadata?.fileType || 'unknown',
            fileSize: file.size,
            recordCount: parseResult.metadata?.recordCount || 0,
            fieldsDiscovered: schema.fields.length,
            processingTime: Date.now() - startTime
          }
        }
      }

      // 7. Return success result
      return {
        success: true,
        schema,
        warnings: warnings.length > 0 ? warnings : undefined,
        errors: errors.length > 0 ? errors : undefined,
        metadata: {
          fileType: parseResult.metadata?.fileType || 'unknown',
          fileSize: file.size,
          recordCount: parseResult.metadata?.recordCount || 0,
          fieldsDiscovered: schema.fields.length,
          processingTime: Date.now() - startTime
        }
      }

    } catch (error) {
      console.error('[SchemaDiscovery] Error during discovery:', error)
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error during schema discovery'],
        metadata: {
          fileType: file.name.split('.').pop() || 'unknown',
          fileSize: file.size,
          recordCount: 0,
          fieldsDiscovered: 0,
          processingTime: Date.now() - startTime
        }
      }
    }
  }

  /**
   * Sample fields for large files (limit example values)
   */
  private sampleFields(fields: ExtractedField[], sampleSize: number): ExtractedField[] {
    return fields.map(field => ({
      ...field,
      exampleValues: field.exampleValues.slice(0, sampleSize)
    }))
  }

  /**
   * Validate discovered schema
   */
  private validateDiscoveredSchema(schema: DiscoveredSchema): {
    valid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    if (!schema.fields || schema.fields.length === 0) {
      errors.push('No fields discovered in schema')
      return { valid: false, errors }
    }

    // Check for duplicate field names
    const fieldNames = new Set<string>()
    for (const field of schema.fields) {
      if (fieldNames.has(field.name)) {
        errors.push(`Duplicate field name: ${field.name}`)
      }
      fieldNames.add(field.name)

      // Validate field structure
      if (!field.name || field.name.trim() === '') {
        errors.push('Field with empty name discovered')
      }
      if (!field.type) {
        errors.push(`Field "${field.name}" missing type`)
      }
    }

    // Check confidence threshold
    if (schema.metadata.confidence < 0.3) {
      errors.push(`Low confidence score (${schema.metadata.confidence.toFixed(2)}). Schema may be inaccurate.`)
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Convert discovered schema to ClientSynth schema definition format
   */
  convertToSchemaDefinition(discovered: DiscoveredSchema): {
    fields: SchemaField[]
    metadata: {
      version: string
      created_at: string
    }
  } {
    return {
      fields: discovered.fields,
      metadata: {
        version: "1.0",
        created_at: new Date().toISOString()
      }
    }
  }
}

