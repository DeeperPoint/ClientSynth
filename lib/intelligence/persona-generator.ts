/**
 * Persona Context Generator
 * 
 * Generates a root JSON object (persona context) that serves as the "truth"
 * for all subsequent field generations. This ensures consistency across all
 * generated records for a schema.
 * 
 * Example persona context:
 * {
 *   companyName: "Green Valley Farms",
 *   industry: "Agriculture",
 *   region: "Ohio, USA",
 *   foundingYear: 1985,
 *   companySize: "medium"
 * }
 */

import { query } from "@/lib/postgres/client"
import { PersonaContext } from "@/lib/types/schema-extensions"

export class PersonaGenerator {
  private apiKey: string | undefined
  private model = "google/gemini-2.5-flash"

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY
    if (model) {
      this.model = model
    }

    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required for persona generation")
    }
  }

  /**
   * Generate a seed persona context for a schema
   * 
   * Analyzes the schema fields and generates a consistent root context object
   * that will be used to generate all fields in a coherent manner.
   * 
   * @param schemaId - The schema ID to generate persona for
   * @returns A persona context object with key-value pairs
   */
  async generateSeedPersona(schemaId: string): Promise<PersonaContext> {
    console.log(`[PersonaGenerator] Generating seed persona for schema: ${schemaId}`)

    try {
      // Load schema from database
      const schemaResult = await query(
        `SELECT id, name, description, schema_definition FROM schemas WHERE id = $1`,
        [schemaId]
      )

      if (schemaResult.rows.length === 0) {
        throw new Error(`Schema ${schemaId} not found`)
      }

      const schema = schemaResult.rows[0]
      const schemaDefinition = schema.schema_definition || {}
      const fields = schemaDefinition.fields || []

      if (fields.length === 0) {
        console.warn(`[PersonaGenerator] Schema ${schemaId} has no fields, returning empty persona`)
        return {}
      }

      // Build prompt to generate persona context
      const systemPrompt = this.buildSystemPrompt()
      const userPrompt = this.buildUserPrompt(schema, fields)

      console.log(`[PersonaGenerator] Calling OpenRouter API with model: ${this.model}`)

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_APP_TITLE || "ClientSynth",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "persona_context",
              strict: false, // Allow additional properties for flexibility
              schema: {
                type: "object",
                properties: {},
                additionalProperties: true, // Allow any properties
              },
            },
          },
          max_tokens: 1000,
          temperature: 0.8, // Slightly creative but consistent
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[PersonaGenerator] OpenRouter API error: ${response.status} ${response.statusText}`, errorText)
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error("[PersonaGenerator] Invalid response structure:", JSON.stringify(data, null, 2))
        throw new Error("Invalid response from OpenRouter API: missing choices or message")
      }

      const content = data.choices[0].message.content.trim()

      // Parse JSON response
      let personaContext: PersonaContext
      try {
        // Clean up any JSON artifacts
        let cleanedContent = content
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim()

        personaContext = JSON.parse(cleanedContent)
      } catch (parseError) {
        console.error("[PersonaGenerator] Failed to parse persona context:", parseError)
        console.error("[PersonaGenerator] Raw content:", content)
        throw new Error(`Failed to parse persona context: ${parseError}`)
      }

      console.log(`[PersonaGenerator] Successfully generated persona context:`, JSON.stringify(personaContext, null, 2))

      return personaContext
    } catch (error) {
      console.error(`[PersonaGenerator] Error generating seed persona:`, error)
      throw error
    }
  }

  /**
   * Build system prompt for persona generation
   */
  private buildSystemPrompt(): string {
    return `You are a persona context generator for synthetic data generation.

Your task is to analyze a data schema and generate a THEMATIC CONTEXT object that defines the domain, industry, and setting for the dataset — NOT specific individual identities.

CRITICAL RULES:
- NEVER generate specific person names, contact names, first names, or last names.
- NEVER generate specific email addresses.
- NEVER generate specific phone numbers.
- DO generate: industry, sector, geographic region, company size range, business type, cultural context, typical job roles/titles (as categories, not specific names).

The persona context provides the SHARED THEMATIC BACKGROUND for the dataset. Individual record identities (names, emails, phone numbers) will be generated separately for each record to ensure diversity.

For example:
- Company-related schemas: generate industry, region, companySize, businessType
- Person-related schemas: generate demographics (age range, gender distribution), location (region, urban/rural), profession (industry sector, experience level)
- Product-related schemas: generate productCategory, targetMarket, priceRange

Return ONLY a valid JSON object with key-value pairs. Values can be strings, numbers, or objects.`
  }

  /**
   * Build user prompt with schema information
   */
  private buildUserPrompt(schema: any, fields: any[]): string {
    const fieldDescriptions = fields
      .map((field, index) => {
        const desc = field.description ? ` (${field.description})` : ""
        return `${index + 1}. ${field.name} (${field.type})${desc}`
      })
      .join("\n")

    return `Generate a THEMATIC CONTEXT for the following data schema. This context defines the domain and setting, NOT specific individual identities.

Schema Name: ${schema.name || "Untitled Schema"}
Schema Description: ${schema.description || "No description provided"}

Fields in this schema:
${fieldDescriptions}

CRITICAL: Do NOT include any specific person names, contact names, email addresses, or phone numbers. These will be generated uniquely per record.

INSTEAD, generate ONLY thematic context like:
- Industry/sector
- Geographic region/country
- Business characteristics (size, type, founding era)
- Demographic ranges (age range, gender distribution — NOT specific names)
- Professional context (industry sector, experience levels — NOT specific names)

Good example for a farm/agriculture schema:
{
  "industry": "Agriculture",
  "subSector": "Organic Farming",
  "region": "Ontario, Canada",
  "businessSize": "small to medium",
  "typicalRoles": ["Farm Manager", "Operations Director", "Sales Coordinator"],
  "culturalContext": "North American rural agricultural community"
}

Good example for a people/contacts schema:
{
  "demographics": {
    "ageRange": "25-55",
    "genderDistribution": "balanced",
    "nameOrigins": "diverse international"
  },
  "location": {
    "primaryRegion": "United States",
    "urbanRural": "mixed"
  },
  "profession": {
    "industrySector": "Technology",
    "experienceLevel": "varied"
  }
}

Generate a thematic context that makes sense for the fields provided. Be specific and realistic. Return only valid JSON.`
  }

  /**
   * Set the model to use for persona generation
   */
  setModel(modelId: string): void {
    this.model = modelId
    console.log(`[PersonaGenerator] Switched to model: ${modelId}`)
  }

  /**
   * Get the current model
   */
  getCurrentModel(): string {
    return this.model
  }
}

