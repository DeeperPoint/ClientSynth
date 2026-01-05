/**
 * Schema Extensions for Persona and Field Configuration
 * 
 * This module defines interfaces for advanced schema configurations including:
 * - LinkedFieldConfig: Field dependencies (e.g., Field B depends on Field A)
 * - DistributionConfig: Distribution rules (e.g., "80% US, 20% EU")
 */

/**
 * Configuration for field dependencies/linking
 * 
 * Example: Field B depends on Field A means that when Field A has a certain value,
 * Field B should be generated in a way that's consistent with Field A.
 * 
 * Example use case:
 * - If "country" field is "USA", then "state" should be a US state
 * - If "industry" field is "Technology", then "company" should be a tech company
 */
export interface LinkedFieldConfig {
  /**
   * The name of the field that this field depends on
   */
  dependsOn: string
  
  /**
   * Mapping rules: when the dependent field has a certain value,
   * this field should have specific constraints or values
   * 
   * Example:
   * {
   *   "USA": { region: "North America", format: "US state" },
   *   "Germany": { region: "Europe", format: "German city" }
   * }
   */
  dependencyRules?: Record<string, {
    region?: string
    format?: string
    constraints?: Record<string, any>
  }>
  
  /**
   * Whether the dependency is strict (must match) or soft (suggested)
   */
  strict?: boolean
}

/**
 * Configuration for value distributions
 * 
 * Example: "80% US, 20% EU" means 80% of generated values should be US-based,
 * and 20% should be EU-based.
 */
export interface DistributionConfig {
  /**
   * Target distribution percentages
   * Keys are the category/value, values are percentages (0-100)
   * 
   * Example:
   * {
   *   "USA": 80,
   *   "Germany": 10,
   *   "France": 10
   * }
   */
  distribution: Record<string, number>
  
  /**
   * Field name to apply distribution to
   */
  fieldName: string
  
  /**
   * Tolerance percentage (acceptable deviation from target)
   * Default: 5%
   */
  tolerance?: number
  
  /**
   * Priority level for this distribution rule
   */
  priority?: "high" | "medium" | "low"
}

/**
 * Extended schema field that includes persona configuration options
 * 
 * This extends the base schema field structure to include:
 * - linkedFieldConfig: Field dependency configuration
 * - distributionConfig: Value distribution configuration
 */
export interface ExtendedSchemaField {
  id?: string
  name: string
  type: string
  description?: string
  required?: boolean
  constraints?: {
    min?: number
    max?: number
    options?: string[]
    format?: string
  }
  /**
   * Configuration for field dependencies
   */
  linkedFieldConfig?: LinkedFieldConfig
  
  /**
   * Configuration for value distributions
   */
  distributionConfig?: DistributionConfig
}

/**
 * Persona context object
 * 
 * This represents the "truth" or base context for generating consistent records.
 * Generated once per schema/job and used to ensure all fields are consistent.
 * 
 * Example:
 * {
 *   companyName: "Green Valley Farms",
 *   industry: "Agriculture",
 *   region: "Ohio, USA",
 *   foundingYear: 1985,
 *   companySize: "medium"
 * }
 */
export interface PersonaContext {
  [key: string]: any
}


