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

/**
 * Phone country codes and their countries, used to check that a record's
 * location-bearing fields agree with one another. Only unambiguous entries —
 * "+1" covers both the US and Canada, so it is treated as satisfying either.
 */
const DIAL_CODE_COUNTRIES: Record<string, string[]> = {
  "1": ["united states", "usa", "us", "canada", "ca"],
  "7": ["russia", "kazakhstan"],
  "20": ["egypt"],
  "27": ["south africa"],
  "31": ["netherlands", "holland"],
  "32": ["belgium"],
  "33": ["france"],
  "34": ["spain"],
  "39": ["italy"],
  "40": ["romania"],
  "43": ["austria"],
  "44": ["united kingdom", "uk", "great britain", "britain"],
  "45": ["denmark"],
  "46": ["sweden"],
  "47": ["norway"],
  "48": ["poland"],
  "49": ["germany"],
  "51": ["peru"],
  "52": ["mexico"],
  "54": ["argentina"],
  "55": ["brazil"],
  "56": ["chile"],
  "57": ["colombia"],
  "58": ["venezuela"],
  "61": ["australia"],
  "62": ["indonesia"],
  "63": ["philippines"],
  "64": ["new zealand"],
  "65": ["singapore"],
  "66": ["thailand"],
  "81": ["japan"],
  "82": ["south korea", "korea"],
  "84": ["vietnam"],
  "86": ["china"],
  "91": ["india"],
  "92": ["pakistan"],
  "234": ["nigeria"],
  "254": ["kenya"],
  "251": ["ethiopia"],
  "971": ["united arab emirates", "uae"],
}

/** Country-code TLDs that imply a country, for email-domain cross-checks. */
const CCTLD_COUNTRIES: Record<string, string[]> = {
  ca: ["canada"],
  uk: ["united kingdom", "uk", "great britain", "britain"],
  de: ["germany"],
  fr: ["france"],
  au: ["australia"],
  nl: ["netherlands", "holland"],
  br: ["brazil"],
  in: ["india"],
  jp: ["japan"],
  cn: ["china"],
  ke: ["kenya"],
  et: ["ethiopia"],
  mx: ["mexico"],
  za: ["south africa"],
  es: ["spain"],
  it: ["italy"],
  se: ["sweden"],
  no: ["norway"],
  pl: ["poland"],
  ar: ["argentina"],
  nz: ["new zealand"],
}

function normalizeCountry(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z ]/g, "").trim()
}

/** Find the first field whose name suggests it holds a given kind of value. */
function findField(
  record: Record<string, any>,
  fields: Array<{ name: string; type: string }>,
  types: string[],
  nameHints: string[],
): { name: string; value: string } | null {
  for (const field of fields) {
    const ft = (field.type || "").toLowerCase()
    const fn = field.name.toLowerCase()
    const matches = types.includes(ft) || nameHints.some(h => fn.includes(h))
    if (!matches) continue
    const raw = record[field.name]
    if (raw === undefined || raw === null) continue
    const value = String(raw).trim()
    if (value) return { name: field.name, value }
  }
  return null
}

export class OutputValidator {
  /**
   * Run all validation checks on a generated record.
   */
  static validate(
    record: Record<string, any>,
    fields: Array<{ name: string; type: string; description?: string; constraints?: { options?: string[] } }>,
  ): OutputIssue[] {
    const issues: OutputIssue[] = []

    for (const field of fields) {
      const value = record[field.name]
      if (value === undefined || value === null) continue

      // Arrays are legitimate values for multi-valued fields; check each item
      // against the allowed options rather than stringifying the whole list.
      const options = field.constraints?.options
      if (Array.isArray(value)) {
        if (options && options.length > 0) {
          for (const item of value) {
            if (!options.includes(String(item))) {
              issues.push({
                field: field.name,
                value: item,
                issue: `"${item}" is not one of the allowed values (${options.join(", ")})`,
                severity: "error",
              })
            }
          }
        }
        continue
      }

      const strValue = String(value).trim()
      if (strValue.length === 0) continue

      // Allowed-value enforcement: an out-of-vocabulary value is rejected by the
      // downstream population ingest boundary, so it is an error here.
      if (options && options.length > 0 && !options.includes(strValue)) {
        issues.push({
          field: field.name,
          value,
          issue: `"${strValue}" is not one of the allowed values (${options.join(", ")})`,
          severity: "error",
        })
      }

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

    issues.push(...this.validateCrossFieldConsistency(record, fields))

    return issues
  }

  /**
   * Check that fields describing the same real-world thing agree.
   *
   * Per-field validation cannot catch a record whose country says "United
   * States" while its address, region, phone area code and email domain are all
   * Canadian — every value is individually valid, but the record is incoherent.
   */
  static validateCrossFieldConsistency(
    record: Record<string, any>,
    fields: Array<{ name: string; type: string; description?: string }>,
  ): OutputIssue[] {
    const issues: OutputIssue[] = []

    const country = findField(record, fields, ["country"], ["country", "nation"])
    if (!country) return issues

    const countryNorm = normalizeCountry(country.value)
    if (!countryNorm) return issues

    const matchesCountry = (candidates: string[]) =>
      candidates.some(c => c === countryNorm || countryNorm.includes(c) || c.includes(countryNorm))

    // Phone dial code vs country.
    const phone = findField(record, fields, ["phone"], ["phone", "tel", "mobile"])
    if (phone) {
      const digits = phone.value.replace(/[^\d+]/g, "")
      if (digits.startsWith("+")) {
        const bare = digits.slice(1)
        // Longest dial code first, so "254" wins over "2".
        const code = Object.keys(DIAL_CODE_COUNTRIES)
          .sort((a, b) => b.length - a.length)
          .find(c => bare.startsWith(c))
        if (code && !matchesCountry(DIAL_CODE_COUNTRIES[code])) {
          issues.push({
            field: phone.name,
            value: phone.value,
            issue:
              `Phone country code +${code} (${DIAL_CODE_COUNTRIES[code][0]}) does not match ` +
              `${country.name} "${country.value}"`,
            severity: "error",
          })
        }
      }
    }

    // Email country-code TLD vs country.
    const email = findField(record, fields, ["email"], ["email"])
    if (email) {
      const tld = email.value.split("@")[1]?.split(".").pop()?.toLowerCase()
      if (tld && CCTLD_COUNTRIES[tld] && !matchesCountry(CCTLD_COUNTRIES[tld])) {
        issues.push({
          field: email.name,
          value: email.value,
          issue:
            `Email domain ".${tld}" implies ${CCTLD_COUNTRIES[tld][0]}, which does not match ` +
            `${country.name} "${country.value}"`,
          severity: "warning",
        })
      }
    }

    // Address naming a different country outright.
    const address = findField(record, fields, ["address"], ["address", "street", "location"])
    if (address) {
      const addressNorm = normalizeCountry(address.value)
      for (const names of Object.values(DIAL_CODE_COUNTRIES)) {
        const named = names.find(n => n.length > 3 && addressNorm.includes(n))
        if (named && !matchesCountry([named])) {
          issues.push({
            field: address.name,
            value: address.value,
            issue: `Address mentions "${named}" but ${country.name} is "${country.value}"`,
            severity: "error",
          })
          break
        }
      }
    }

    return issues
  }

  /**
   * Detect a person identity that merely re-dresses an earlier one
   * ("Jane Vance" -> "Jane S. Vance" -> "Jane Vance-Sterling").
   *
   * Exact-match duplicate tracking treats these as distinct, which is how three
   * variations of one person reached a finished dataset.
   */
  static isNearDuplicateIdentity(candidate: string, previous: Iterable<string>): boolean {
    const tokens = (value: string) =>
      new Set(
        value
          .toLowerCase()
          .replace(/[^a-z\s-]/g, " ")
          .split(/[\s-]+/)
          .filter(t => t.length > 1), // drop middle initials
      )

    const candidateTokens = tokens(candidate)
    if (candidateTokens.size === 0) return false

    for (const prior of previous) {
      const priorTokens = tokens(prior)
      if (priorTokens.size === 0) continue

      let shared = 0
      for (const token of candidateTokens) if (priorTokens.has(token)) shared++

      // Sharing most name tokens with an earlier identity means it is a variant
      // rather than a genuinely new person.
      const smaller = Math.min(candidateTokens.size, priorTokens.size)
      if (shared >= 2 || (smaller === 1 && shared === 1)) return true
      if (shared / smaller >= 0.6 && shared > 0) return true
    }

    return false
  }

  /**
   * Auto-fix issues where a clear suggestion exists.
   * Returns a new record with fixes applied and any remaining issues.
   */
  static autoFix(
    record: Record<string, any>,
    issues: OutputIssue[],
    fields?: Array<{ name: string; type: string; description?: string; constraints?: { options?: string[] } }>,
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

    // Re-validate when the schema is available: a suggestion can itself be
    // invalid (stripping a suffix can empty a value, or leave one that still
    // fails another rule), and previously the fixed record was accepted without
    // ever being checked again.
    if (fields && fixed !== record) {
      const revalidated = this.validate(fixed, fields)
      return { record: fixed, remainingIssues: revalidated }
    }

    return { record: fixed, remainingIssues: remaining }
  }
}
