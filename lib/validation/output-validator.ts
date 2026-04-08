/**
 * Output Validator — Phase 3
 *
 * Post-generation validation that catches unrealistic or malformed values
 * before they are persisted. Each checker returns a list of issues; the caller
 * decides whether to retry or accept the record.
 */

export interface OutputIssue {
  field: string
  value: any
  issue: string
  severity: "error" | "warning"
  suggestion?: string
}

export class OutputValidator {
  /**
   * Run all validation checks on a generated record.
   */
  static validate(
    record: Record<string, any>,
    fields: Array<{ name: string; type: string; description?: string }>,
  ): OutputIssue[] {
    const issues: OutputIssue[] = []

    for (const field of fields) {
      const value = record[field.name]
      if (value === undefined || value === null) continue

      const strValue = String(value).trim()
      if (strValue.length === 0) continue

      // 1. Trailing-number artefact check (e.g. "Australia_11_1763030500331")
      if (/_\d+(_\d+)?$/.test(strValue)) {
        issues.push({
          field: field.name,
          value,
          issue: "Value contains trailing numeric suffix (generation artefact)",
          severity: "error",
          suggestion: strValue.replace(/_\d+(_\d+)?$/g, "").trim(),
        })
      }

      // 2. Instruction / prompt leakage
      const leakPatterns = [
        /for field:\s*\w+/i,
        /cannot be generated/i,
        /cannot be an empty string/i,
        /please try again/i,
        /value cannot be/i,
        /\berror\b.*\b(parsing|invalid|failed)\b/i,
        /^```/,
        /"value"\s*:/,
      ]
      for (const pattern of leakPatterns) {
        if (pattern.test(strValue)) {
          issues.push({
            field: field.name,
            value,
            issue: `Value looks like prompt leakage or AI instruction text: matched ${pattern}`,
            severity: "error",
          })
          break
        }
      }

      // 3. Type-specific format checks
      const ft = field.type.toLowerCase()

      // Phone numbers: should never be a plain negative number or just digits
      if (ft === "phone" || field.name.toLowerCase().includes("phone")) {
        if (/^-?\d+$/.test(strValue)) {
          issues.push({
            field: field.name,
            value,
            issue: "Phone number is a bare integer; expected formatted number like +1 (555) 123-4567",
            severity: "error",
          })
        }
      }

      // Country: should not be truncated (min 3 chars) or contain numbers
      if (ft === "country" || field.name.toLowerCase().includes("country")) {
        if (strValue.length < 3) {
          issues.push({
            field: field.name,
            value,
            issue: "Country name is too short — likely truncated",
            severity: "error",
          })
        }
        if (/\d/.test(strValue)) {
          issues.push({
            field: field.name,
            value,
            issue: "Country name contains digits",
            severity: "error",
          })
        }
      }

      // Email: basic format
      if (ft === "email" || field.name.toLowerCase().includes("email")) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
          issues.push({
            field: field.name,
            value,
            issue: "Email address format is invalid",
            severity: "error",
          })
        }
      }

      // Number fields: detect absurd values
      if (ft === "number") {
        const num = Number(strValue)
        if (isNaN(num)) {
          issues.push({
            field: field.name,
            value,
            issue: "Number field contains non-numeric value",
            severity: "error",
          })
        } else if (num < 0) {
          // Most business fields shouldn't be negative
          const desc = (field.description || field.name).toLowerCase()
          const allowNegative = desc.includes("change") || desc.includes("delta") || desc.includes("loss") || desc.includes("temperature") || desc.includes("latitude") || desc.includes("longitude") || desc.includes("offset")
          if (!allowNegative) {
            issues.push({
              field: field.name,
              value,
              issue: "Number field has unexpected negative value",
              severity: "warning",
            })
          }
        } else if (Math.abs(num) > 1e12) {
          issues.push({
            field: field.name,
            value,
            issue: "Number seems unrealistically large (>1 trillion)",
            severity: "warning",
          })
        }
      }

      // Date fields: basic ISO check
      if (ft === "date" || field.name.toLowerCase().includes("date")) {
        if (!/^\d{4}-\d{2}-\d{2}/.test(strValue)) {
          issues.push({
            field: field.name,
            value,
            issue: "Date is not in expected YYYY-MM-DD format",
            severity: "warning",
          })
        }
      }

      // URL / website: basic check
      if (ft === "url" || ft === "website" || field.name.toLowerCase().includes("url") || field.name.toLowerCase().includes("website")) {
        if (!/^https?:\/\/.+/.test(strValue)) {
          issues.push({
            field: field.name,
            value,
            issue: "URL does not start with http:// or https://",
            severity: "warning",
          })
        }
      }

      // 4. Suspiciously short values for text-heavy fields
      if (["text", "long_text", "description"].includes(ft)) {
        if (strValue.length < 5) {
          issues.push({
            field: field.name,
            value,
            issue: "Text field value is suspiciously short",
            severity: "warning",
          })
        }
      }
    }

    return issues
  }

  /**
   * Auto-fix issues where a clear suggestion exists.
   * Returns a new record with fixes applied and any remaining issues.
   */
  static autoFix(
    record: Record<string, any>,
    issues: OutputIssue[],
  ): { record: Record<string, any>; remainingIssues: OutputIssue[] } {
    const fixed = { ...record }
    const remaining: OutputIssue[] = []

    for (const issue of issues) {
      if (issue.suggestion) {
        fixed[issue.field] = issue.suggestion
      } else {
        remaining.push(issue)
      }
    }

    return { record: fixed, remainingIssues: remaining }
  }
}
