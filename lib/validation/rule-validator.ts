import { SeedRule, PersonaContext } from "../types/schema-extensions"
import {
  ResolvedRange,
  describeCondition,
  describeRange,
  matchedBranch,
  resolveAllowed,
  resolveRange,
  toNumber,
} from "./rule-conditions"

export interface ValidationIssue {
  field: string
  ruleId: string
  message: string
  severity: "error" | "warning"
}

/**
 * RuleValidator
 * 
 * Logic for enforcing complex CommonContext rules (CS-102).
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
      } else if (rule.type === 'conditional_enum') {
        const sourceValue = record[rule.sourceField]
        const allowed = resolveAllowed(sourceValue, rule.config as any)
        if (!allowed) continue

        for (const targetField of rule.targetFields) {
          const targetValue = record[targetField]
          if (targetValue === undefined || targetValue === null) continue

          const values = Array.isArray(targetValue) ? targetValue : [targetValue]
          const invalid = values.filter(v => !allowed.includes(String(v)))
          if (invalid.length > 0) {
            issues.push({
              field: targetField,
              ruleId: rule.id,
              message: `Values [${invalid.join(', ')}] are not allowed when ${describeCondition(rule.sourceField, matchedBranch(sourceValue, rule.config as any))}. Allowed: [${allowed.join(', ')}]`,
              severity: rule.severity || 'error'
            })
          }
        }
      } else if (rule.type === 'range_constraint') {
        const sourceValue = record[rule.sourceField]
        const range = resolveRange(sourceValue, rule.config as any)
        if (!range) continue

        for (const targetField of rule.targetFields) {
          const targetValue = record[targetField]
          if (targetValue === undefined || targetValue === null) continue

          const numeric = toNumber(targetValue)
          if (numeric === null) {
            // A non-numeric value under a numeric constraint is a violation, not
            // something to skip. Skipping is how "about 600" passes a max of 500.
            issues.push({
              field: targetField,
              ruleId: rule.id,
              message: `Value "${targetValue}" is not a number, but ${targetField} must be ${describeRange(range)}`,
              severity: rule.severity || 'error'
            })
            continue
          }

          const problems: string[] = []
          if (range.min !== undefined && numeric < range.min) problems.push(`below the minimum ${range.min}`)
          if (range.max !== undefined && numeric > range.max) problems.push(`above the maximum ${range.max}`)
          if (range.integer && !Number.isInteger(numeric)) problems.push(`not a whole number`)

          if (problems.length > 0) {
            issues.push({
              field: targetField,
              ruleId: rule.id,
              message: `Value ${numeric} is ${problems.join(' and ')} for ${targetField}`,
              severity: rule.severity || 'error'
            })
          }
        }
      }
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
        } else if (rule.type === 'conditional_enum') {
          const allowed = resolveAllowed(record[rule.sourceField], rule.config as any)
          if (allowed) {
            // Intersect rather than replace: two rules narrowing the same field
            // both apply, and replacing would let the later one widen the earlier.
            filteredOptions = filteredOptions
              ? filteredOptions.filter(opt => allowed.includes(opt))
              : [...allowed]
          }
        }
        // range_constraint is intentionally absent here: getValidOptions answers
        // "which of these enum choices remain", and a numeric range does not
        // enumerate. It is enforced in validate() and stated in the prompt.
      }
    }

    return filteredOptions
  }

  /**
   * The numeric bounds in force for a field, given the record so far.
   *
   * Separate from getValidOptions because a range is not a list of options. The
   * generator needs it to state the constraint in the prompt rather than
   * generating freely and failing validation afterwards.
   */
  static getValidRange(
    fieldName: string,
    record: Record<string, any>,
    rules: SeedRule[]
  ): ResolvedRange | null {
    let bounds: ResolvedRange | null = null

    for (const rule of rules) {
      if (rule.type !== 'range_constraint' || !rule.targetFields.includes(fieldName)) continue
      const range = resolveRange(record[rule.sourceField], rule.config as any)
      if (!range) continue
      if (!bounds) {
        bounds = { ...range }
        continue
      }
      // Overlapping rules intersect: the tightest bound wins, so adding a rule
      // can never loosen a constraint already in force.
      if (range.min !== undefined) bounds.min = bounds.min === undefined ? range.min : Math.max(bounds.min, range.min)
      if (range.max !== undefined) bounds.max = bounds.max === undefined ? range.max : Math.min(bounds.max, range.max)
      if (range.integer) bounds.integer = true
    }

    return bounds
  }
}
