import { SeedRule, PersonaContext } from "../types/schema-extensions"

export interface ValidationIssue {
  field: string
  ruleId: string
  message: string
  severity: "error" | "warning"
}

/**
 * RuleValidator
 * 
 * Logic for enforcing complex Knowledge Slot rules (CS-102).
 */
export class RuleValidator {
  /**
   * Validate a partially or fully generated record against seed rules
   */
  static validate(
    record: Record<string, any>,
    rules: SeedRule[]
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const rule of rules) {
      if (rule.type === 'dependency') {
        const sourceValue = record[rule.sourceField]
        if (sourceValue === undefined || sourceValue === null) continue

        const allowedValuesMap = rule.config as Record<string, string[]>
        const allowedValues = allowedValuesMap[String(sourceValue)]

        if (allowedValues) {
          for (const targetField of rule.targetFields) {
            const targetValue = record[targetField]
            if (targetValue === undefined || targetValue === null) continue

            // If target value is an array (e.g., multi-select certifications)
            if (Array.isArray(targetValue)) {
              const invalidValues = targetValue.filter(v => !allowedValues.includes(v))
              if (invalidValues.length > 0) {
                issues.push({
                  field: targetField,
                  ruleId: rule.id,
                  message: `Values [${invalidValues.join(', ')}] are not allowed for ${rule.sourceField}="${sourceValue}". Allowed: [${allowedValues.join(', ')}]`,
                  severity: rule.severity || 'error'
                })
              }
            } else {
              // Single value check
              if (!allowedValues.includes(String(targetValue))) {
                issues.push({
                  field: targetField,
                  ruleId: rule.id,
                  message: `Value "${targetValue}" is not allowed for ${rule.sourceField}="${sourceValue}". Allowed: [${allowedValues.join(', ')}]`,
                  severity: rule.severity || 'error'
                })
              }
            }
          }
        }
      } else if (rule.type === 'exclusion') {
        const sourceValue = record[rule.sourceField]
        if (sourceValue === undefined || sourceValue === null) continue
        
        const excludedValuesMap = rule.config as Record<string, string[]>
        const excludedValues = excludedValuesMap[String(sourceValue)]
        
        if (excludedValues) {
          for (const targetField of rule.targetFields) {
            const targetValue = record[targetField]
            if (targetValue !== undefined && targetValue !== null && excludedValues.includes(String(targetValue))) {
              issues.push({
                field: targetField,
                ruleId: rule.id,
                message: `Value "${targetValue}" is excluded when ${rule.sourceField} is "${sourceValue}"`,
                severity: rule.severity || 'error'
              })
            }
          }
        }
      }
      // Add more rule types as defined in Knowledge Slot spec (conditional_enum, range_constraint...)
    }

    return issues
  }

  /**
   * Suggest valid options for a field based on current record state and rules
   */
  static getValidOptions(
    fieldName: string,
    record: Record<string, any>,
    rules: SeedRule[],
    baseOptions?: string[]
  ): string[] | null {
    let filteredOptions = baseOptions ? [...baseOptions] : null

    for (const rule of rules) {
      if (rule.targetFields.includes(fieldName)) {
        if (rule.type === 'dependency') {
          const sourceValue = record[rule.sourceField]
          if (sourceValue !== undefined && sourceValue !== null) {
            const allowedValues = rule.config[String(sourceValue)] as string[]
            if (allowedValues) {
              if (filteredOptions) {
                filteredOptions = filteredOptions.filter(opt => allowedValues.includes(opt))
              } else {
                filteredOptions = [...allowedValues]
              }
            }
          }
        } else if (rule.type === 'exclusion') {
            const sourceValue = record[rule.sourceField]
            if (sourceValue !== undefined && sourceValue !== null) {
              const excludedValues = rule.config[String(sourceValue)] as string[]
              if (excludedValues && filteredOptions) {
                filteredOptions = filteredOptions.filter(opt => !excludedValues.includes(opt))
              }
            }
        }
      }
    }

    return filteredOptions
  }
}
