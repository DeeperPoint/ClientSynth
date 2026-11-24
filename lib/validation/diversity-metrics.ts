/**
 * Population diversity metrics — measuring mode collapse.
 *
 * A language model asked a hundred times for "a realistic machine shop in
 * Ontario" does not give a hundred different answers. It gives a handful,
 * repeatedly, with the names changed. The published term for this is mode
 * collapse, and the reason it matters here is that a synthetic population is
 * worth having only insofar as it covers the variation a real market has: a
 * marketplace demo where ninety shops are the same shop proves nothing about
 * matching, discovery or ranking, and it looks fine from the outside because
 * every individual record is plausible.
 *
 * It is invisible to record-level validation. Every record can satisfy every
 * rule, carry a valid watermark, and pass every schema check, while the set as a
 * whole is four records repeated. So the unit of measurement here is the
 * population, never the record.
 *
 * None of these metrics decide anything on their own. They are reported, and the
 * thresholds are floors chosen to catch collapse rather than to enforce an ideal
 * — a metric that fails a build on a judgement call gets its threshold lowered
 * until it stops failing, and then it is measuring nothing.
 */

export interface FieldDiversity {
  field: string
  /** Records that had any value for this field. */
  populated: number
  /** How many different values appeared. */
  distinct: number
  /** distinct / populated. 1.0 means every record differed. */
  distinctRatio: number
  /**
   * Shannon entropy over the value distribution, divided by the maximum
   * entropy for that many distinct values. 1.0 is a perfectly even spread.
   *
   * Reported alongside distinctRatio because the two catch different failures:
   * a field with 50 distinct values across 100 records looks healthy until you
   * see that one value holds 51 of them and the other 49 appear once each.
   */
  normalizedEntropy: number
  /** The most common value's share. The direct mode-collapse signal. */
  topValueShare: number
  topValue: string | null
}

export interface DiversityReport {
  records: number
  fields: FieldDiversity[]
  /** Records identical to another record across every compared field. */
  duplicateRecords: number
  duplicateRate: number
  /**
   * How many distinct records the measured fields could express at most, i.e.
   * the product of their distinct counts.
   *
   * Without this the duplicate rate is unreadable. Measure four enum fields
   * across a hundred records and duplicates are not evidence of anything: there
   * may only be twelve expressible combinations, so by the pigeonhole principle
   * at least eighty-eight records MUST repeat one. Flagging that would fail
   * every honest categorical population.
   */
  possibleCombinations: number
  /** Whether the population could in principle have had no duplicates. */
  duplicatesWereAvoidable: boolean
  /** Persona axes from the generation contract whose values never appeared. */
  uncoveredAxisValues: Array<{ axis: string; missing: string[] }>
}

export interface DiversityThresholds {
  minDistinctRatio: number
  minNormalizedEntropy: number
  maxTopValueShare: number
  maxDuplicateRate: number
}

/**
 * Floors, not targets.
 *
 * Set to catch collapse, not to enforce an ideal distribution. Real categorical
 * fields are legitimately skewed — most shops are small, most contracts use the
 * common payment term — so a strict evenness requirement would fail honest
 * populations and teach everyone to ignore the metric.
 */
export const DEFAULT_THRESHOLDS: DiversityThresholds = {
  minDistinctRatio: 0.15,
  minNormalizedEntropy: 0.5,
  maxTopValueShare: 0.8,
  maxDuplicateRate: 0.02,
}

/** Fields whose values are expected to be unique and carry no diversity signal. */
const IDENTITY_FIELDS = /^(id|external_id|uuid|slug|email|.*_id)$/i

function valueKey(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    // Sorted so ["a","b"] and ["b","a"] count as the same selection: order is
    // not a dimension of variation for a multi-select.
    return [...value].map((v) => String(v)).sort().join("|")
  }
  if (typeof value === "object") return JSON.stringify(value)
  const s = String(value).trim()
  return s.length ? s : null
}

function entropy(counts: number[], total: number): number {
  if (total === 0 || counts.length <= 1) return counts.length <= 1 ? 0 : 0
  let h = 0
  for (const c of counts) {
    const p = c / total
    if (p > 0) h -= p * Math.log2(p)
  }
  const max = Math.log2(counts.length)
  return max > 0 ? h / max : 0
}

export function fieldDiversity(records: Array<Record<string, unknown>>, field: string): FieldDiversity {
  const counts = new Map<string, number>()
  let populated = 0

  for (const record of records) {
    const key = valueKey(record?.[field])
    if (key === null) continue
    populated += 1
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const tallies = [...counts.values()]
  let topValue: string | null = null
  let topCount = 0
  for (const [value, count] of counts) {
    if (count > topCount) {
      topCount = count
      topValue = value
    }
  }

  return {
    field,
    populated,
    distinct: counts.size,
    distinctRatio: populated ? counts.size / populated : 0,
    normalizedEntropy: entropy(tallies, populated),
    topValueShare: populated ? topCount / populated : 0,
    topValue,
  }
}

export interface AnalyseOptions {
  /** Fields to measure. Defaults to every key seen, minus identity fields. */
  fields?: string[]
  /** Persona axes from the generation contract, to check for coverage. */
  personaAxes?: Array<{ axis: string; values: string[]; field?: string }>
  /**
   * Fields where every record could legitimately differ — a company name, a
   * description, a free-text address.
   *
   * Only these are held to minDistinctRatio. The ratio is meaningless for a
   * categorical field: one restricted by its schema to three terms cannot
   * exceed 0.03 across a hundred records however healthy the population is, so
   * enforcing a ratio floor on it fails honest data and the threshold then gets
   * lowered until it measures nothing at all. Categorical fields are judged on
   * how evenly their values are used, which is what entropy and top-value share
   * measure.
   */
  openEndedFields?: string[]
}

export function analysePopulation(
  records: Array<Record<string, unknown>>,
  options: AnalyseOptions = {}
): DiversityReport {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      records: 0,
      fields: [],
      duplicateRecords: 0,
      duplicateRate: 0,
      possibleCombinations: 0,
      duplicatesWereAvoidable: false,
      uncoveredAxisValues: [],
    }
  }

  const fields =
    options.fields ??
    [...new Set(records.flatMap((r) => Object.keys(r ?? {})))].filter((f) => !IDENTITY_FIELDS.test(f))

  const fieldReports = fields.map((f) => fieldDiversity(records, f))

  // Duplicates are judged on the measured fields only. Including a generated id
  // would make every record unique by construction and the metric meaningless —
  // which is precisely the failure it exists to catch.
  const signatures = new Map<string, number>()
  for (const record of records) {
    const signature = fields.map((f) => valueKey(record?.[f]) ?? "").join("\u0000")
    signatures.set(signature, (signatures.get(signature) ?? 0) + 1)
  }
  let duplicateRecords = 0
  for (const count of signatures.values()) {
    if (count > 1) duplicateRecords += count - 1
  }

  const uncoveredAxisValues: Array<{ axis: string; missing: string[] }> = []
  for (const axis of options.personaAxes ?? []) {
    if (!axis.field) continue
    const seen = new Set<string>()
    for (const record of records) {
      const key = valueKey(record?.[axis.field])
      if (key !== null) seen.add(key.toLowerCase())
    }
    const missing = axis.values.filter((v) => !seen.has(String(v).toLowerCase()))
    if (missing.length) uncoveredAxisValues.push({ axis: axis.axis, missing })
  }

  // The product of each field's distinct count: the most distinct records these
  // fields could express. Capped because the product overflows into Infinity on
  // a wide schema, and anything past the population size means the same thing.
  const possibleCombinations = fieldReports.reduce(
    (total, f) => Math.min(total * Math.max(f.distinct, 1), Number.MAX_SAFE_INTEGER),
    1
  )

  return {
    records: records.length,
    fields: fieldReports,
    duplicateRecords,
    duplicateRate: duplicateRecords / records.length,
    possibleCombinations,
    duplicatesWereAvoidable: possibleCombinations >= records.length,
    uncoveredAxisValues,
  }
}

export interface DiversityIssue {
  field: string
  metric: keyof DiversityThresholds | "axisCoverage"
  message: string
}

/**
 * Threshold checks over a report.
 *
 * A field with only one possible value is skipped rather than failed: a boolean,
 * or an enum the schema restricts to one term, cannot be diverse and is not
 * evidence of collapse.
 */
export function checkDiversity(
  report: DiversityReport,
  thresholds: DiversityThresholds = DEFAULT_THRESHOLDS,
  options: { openEndedFields?: string[] } = {}
): DiversityIssue[] {
  const issues: DiversityIssue[] = []
  const openEnded = new Set(options.openEndedFields ?? [])

  for (const field of report.fields) {
    if (field.populated === 0 || field.distinct <= 1) continue

    // Only for fields where every record could legitimately differ. See
    // AnalyseOptions.openEndedFields for why this is not applied by default.
    if (openEnded.has(field.field) && field.distinctRatio < thresholds.minDistinctRatio) {
      issues.push({
        field: field.field,
        metric: "minDistinctRatio",
        message: `only ${field.distinct} distinct value(s) across ${field.populated} record(s) (${(field.distinctRatio * 100).toFixed(1)}%)`,
      })
    }
    if (field.topValueShare > thresholds.maxTopValueShare) {
      issues.push({
        field: field.field,
        metric: "maxTopValueShare",
        message: `"${field.topValue}" holds ${(field.topValueShare * 100).toFixed(1)}% of records`,
      })
    }
    if (field.normalizedEntropy < thresholds.minNormalizedEntropy) {
      issues.push({
        field: field.field,
        metric: "minNormalizedEntropy",
        message: `value distribution is heavily skewed (normalised entropy ${field.normalizedEntropy.toFixed(2)})`,
      })
    }
  }

  // Only when the population could have avoided them. Where the measured fields
  // express fewer combinations than there are records, duplicates are forced by
  // the pigeonhole principle, and the real signal — that those fields carry too
  // few values — is already reported above as entropy and top-value share.
  // Flagging it twice turns a diagnosis into noise.
  if (report.duplicatesWereAvoidable && report.duplicateRate > thresholds.maxDuplicateRate) {
    issues.push({
      field: "(record)",
      metric: "maxDuplicateRate",
      message:
        `${report.duplicateRecords} of ${report.records} records duplicate another record exactly, ` +
        `though the measured fields could express ${report.possibleCombinations} distinct record(s)`,
    })
  }

  for (const axis of report.uncoveredAxisValues) {
    issues.push({
      field: axis.axis,
      metric: "axisCoverage",
      message: `axis values never generated: ${axis.missing.join(", ")}`,
    })
  }

  return issues
}

export function formatReport(report: DiversityReport): string {
  const lines = [`population: ${report.records} record(s), ${report.fields.length} field(s) measured`]
  for (const f of report.fields) {
    lines.push(
      `  ${f.field}: ${f.distinct} distinct / ${f.populated} ` +
        `(ratio ${f.distinctRatio.toFixed(2)}, entropy ${f.normalizedEntropy.toFixed(2)}, ` +
        `top ${(f.topValueShare * 100).toFixed(0)}%)`
    )
  }
  lines.push(`  duplicates: ${report.duplicateRecords} (${(report.duplicateRate * 100).toFixed(1)}%)`)
  return lines.join("\n")
}
