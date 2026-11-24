/**
 * Condition evaluation shared by the rule validator and the generator prompt.
 *
 * `dependency` and `exclusion` key their config on an exact source value, which
 * covers "if the region is Alberta, the certifications are these". It does not
 * cover the constraints a domain actually states: a threshold ("over 500
 * employees"), a set ("any of the prairie provinces"), a pattern. Expressing
 * those as a dependency means enumerating every source value by hand, and the
 * enumeration goes stale the moment the vocabulary grows.
 *
 * Both of the rule types implemented here take conditions instead. The two share
 * this evaluator so a condition means the same thing wherever it appears —
 * including in the generator's prompt, where a drifting second implementation
 * would produce records the validator then rejects.
 */

export interface Condition {
  /** Exact match, compared as strings so 5 and "5" agree. */
  eq?: string | number | boolean
  /** Membership in a set. */
  in?: Array<string | number>
  /** Numeric comparisons. A non-numeric value never satisfies these. */
  gt?: number
  gte?: number
  lt?: number
  lte?: number
  /** Whether the field has any value at all. */
  exists?: boolean
  /** Case-insensitive regular expression over the value's string form. */
  matches?: string
}

export interface ConditionalAllow {
  when: Condition
  allow: string[]
}

export interface ConditionalRange {
  when: Condition
  min?: number
  max?: number
  integer?: boolean
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

/**
 * Coerce to a number, or null when the value is not numeric.
 *
 * Deliberately strict about the empty string: Number("") is 0 in JavaScript, so
 * a blank field would satisfy `lt: 10` and the record would pass a constraint
 * nobody checked it against.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length === 0) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * Whether `value` satisfies every clause of `condition`.
 *
 * Clauses are ANDed. An empty condition matches anything, which is how a rule
 * expresses a default alongside its special cases.
 */
export function matchesCondition(value: unknown, condition: Condition): boolean {
  if (!condition || Object.keys(condition).length === 0) return true

  if (condition.exists !== undefined) {
    if (isPresent(value) !== condition.exists) return false
  }

  // Every remaining clause compares against a value, so an absent one cannot
  // satisfy them. Checked after `exists` so `{exists: false}` still works.
  const hasOtherClauses = Object.keys(condition).some((k) => k !== "exists")
  if (hasOtherClauses && !isPresent(value)) return false

  if (condition.eq !== undefined && String(value) !== String(condition.eq)) return false

  if (condition.in !== undefined) {
    const allowed = condition.in.map((v) => String(v))
    if (!allowed.includes(String(value))) return false
  }

  const numeric = toNumber(value)
  const bounds: Array<[number | undefined, (a: number, b: number) => boolean]> = [
    [condition.gt, (a, b) => a > b],
    [condition.gte, (a, b) => a >= b],
    [condition.lt, (a, b) => a < b],
    [condition.lte, (a, b) => a <= b],
  ]
  for (const [bound, compare] of bounds) {
    if (bound === undefined) continue
    // A non-numeric value fails a numeric comparison rather than being skipped.
    // Skipping would let "about 600" pass `lte: 500` unchallenged.
    if (numeric === null || !compare(numeric, bound)) return false
  }

  if (condition.matches !== undefined) {
    try {
      if (!new RegExp(condition.matches, "i").test(String(value))) return false
    } catch {
      // A malformed pattern in curated config must not crash generation; it
      // simply matches nothing, and the rule reports as unsatisfied.
      return false
    }
  }

  return true
}

/**
 * The first matching branch's allowed values, else the declared default.
 *
 * First match rather than union: branches are written most-specific-first, and
 * unioning them would let a general branch widen a narrow one back out.
 */
export function resolveAllowed(
  sourceValue: unknown,
  config: { conditions?: ConditionalAllow[]; default?: string[] } | undefined
): string[] | null {
  if (!config) return null
  for (const branch of config.conditions || []) {
    if (matchesCondition(sourceValue, branch.when)) {
      return Array.isArray(branch.allow) ? branch.allow : null
    }
  }
  return Array.isArray(config.default) ? config.default : null
}

/**
 * The condition of the branch that resolveAllowed would pick, for messages.
 *
 * Reported rather than the raw source value, so an error says "when headcount
 * is over 500" — the rule the record broke — instead of "when headcount is 640",
 * which leaves the reader to guess which branch applied.
 */
export function matchedBranch(
  sourceValue: unknown,
  config: { conditions?: ConditionalAllow[]; default?: string[] } | undefined
): Condition {
  for (const branch of config?.conditions || []) {
    if (matchesCondition(sourceValue, branch.when)) return branch.when
  }
  return {}
}

export interface ResolvedRange {
  min?: number
  max?: number
  integer?: boolean
}

/**
 * The first matching branch's bounds, falling back to the rule's own bounds.
 *
 * A branch that sets only one bound inherits the other from the rule, so
 * "normally 0–100, but at least 50 for members" is one clause, not two.
 */
export function resolveRange(
  sourceValue: unknown,
  config: (ResolvedRange & { conditions?: ConditionalRange[] }) | undefined
): ResolvedRange | null {
  if (!config) return null
  const base: ResolvedRange = { min: config.min, max: config.max, integer: config.integer }
  for (const branch of config.conditions || []) {
    if (matchesCondition(sourceValue, branch.when)) {
      return {
        min: branch.min !== undefined ? branch.min : base.min,
        max: branch.max !== undefined ? branch.max : base.max,
        integer: branch.integer !== undefined ? branch.integer : base.integer,
      }
    }
  }
  if (base.min === undefined && base.max === undefined && base.integer === undefined) return null
  return base
}

/** Human-readable bounds, for a prompt line or an error message. */
export function describeRange(range: ResolvedRange): string {
  const parts: string[] = []
  if (range.min !== undefined && range.max !== undefined) {
    parts.push(`between ${range.min} and ${range.max} inclusive`)
  } else if (range.min !== undefined) {
    parts.push(`at least ${range.min}`)
  } else if (range.max !== undefined) {
    parts.push(`at most ${range.max}`)
  }
  if (range.integer) parts.push("a whole number")
  return parts.join(", ")
}

/** Human-readable condition, for a prompt line or an error message. */
export function describeCondition(field: string, condition: Condition): string {
  const clauses: string[] = []
  if (condition.eq !== undefined) clauses.push(`is "${condition.eq}"`)
  if (condition.in !== undefined) clauses.push(`is one of [${condition.in.join(", ")}]`)
  if (condition.gt !== undefined) clauses.push(`is over ${condition.gt}`)
  if (condition.gte !== undefined) clauses.push(`is at least ${condition.gte}`)
  if (condition.lt !== undefined) clauses.push(`is under ${condition.lt}`)
  if (condition.lte !== undefined) clauses.push(`is at most ${condition.lte}`)
  if (condition.exists !== undefined) clauses.push(condition.exists ? "is set" : "is not set")
  if (condition.matches !== undefined) clauses.push(`matches /${condition.matches}/i`)
  return clauses.length ? `${field} ${clauses.join(" and ")}` : `any ${field}`
}
