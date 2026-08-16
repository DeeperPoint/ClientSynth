/**
 * Coerce ClientSynth generated values into the shapes Cosolvent's profile
 * schema validator accepts.
 *
 * The two systems disagree in predictable ways, all observed in real generated
 * data:
 *   - structured output types every value as a string, so a `number` field
 *     arrives as `"640"`;
 *   - a `multi_select` target is generated as prose
 *     ("Hard Red Winter Wheat, Non-GMO Soybeans");
 *   - a `select` target arrives as a synonym of an allowed option
 *     ("United States" where the schema lists "USA");
 *   - asset fields hold S3 URLs, which have no place in a population record.
 *
 * Coercion is deliberately conservative: anything that cannot be mapped to an
 * allowed value is reported as an issue rather than silently guessed at.
 */

import type { TargetField } from "./types"

/** Cosolvent field types that carry uploaded assets, never population data. */
const ASSET_TYPES = new Set(["file", "files", "image", "images", "pdf", "document"])

/** ClientSynth source types that produce asset URLs rather than values. */
const SOURCE_ASSET_TYPES = new Set(["image", "images", "pdf", "file", "files"])

export function isAssetType(type: string | undefined): boolean {
  const t = (type || "").toLowerCase()
  return ASSET_TYPES.has(t) || SOURCE_ASSET_TYPES.has(t)
}

/**
 * Conservative synonyms for values that are the *same real-world entity* under
 * a different name. Only entries where the mapping is unambiguous.
 */
const VALUE_ALIASES: Record<string, string[]> = {
  usa: ["united states", "united states of america", "us", "u s a", "america"],
  uk: ["united kingdom", "great britain", "britain", "u k"],
  uae: ["united arab emirates"],
  netherlands: ["holland"],
  "south korea": ["korea republic of", "republic of korea"],
}

/** Strip case, accents and punctuation so near-identical values compare equal. */
function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function aliasesFor(option: string): string[] {
  const norm = normalizeForMatch(option)
  const direct = VALUE_ALIASES[norm] || []
  // Also match in reverse: option "United States" against alias table key "usa".
  const reverse = Object.entries(VALUE_ALIASES)
    .filter(([, vals]) => vals.includes(norm))
    .map(([key]) => key)
  return [norm, ...direct.map(normalizeForMatch), ...reverse]
}

/** Whole-token containment, so "Wheat" matches "Hard Red Winter Wheat" but not "Buckwheat". */
function containsToken(haystack: string, needle: string): boolean {
  if (!needle) return false
  const tokens = haystack.split(" ").filter(Boolean)
  const needleTokens = needle.split(" ").filter(Boolean)
  if (needleTokens.length === 0) return false
  for (let i = 0; i + needleTokens.length <= tokens.length; i++) {
    if (needleTokens.every((t, j) => tokens[i + j] === t)) return true
  }
  return false
}

/**
 * Resolve a generated value to one of the schema's allowed options.
 * Returns the canonical option, or null when no confident match exists.
 */
export function matchOption(value: string, options: string[]): string | null {
  const raw = value.trim()
  if (!raw) return null

  const exact = options.find(o => o === raw)
  if (exact) return exact

  const norm = normalizeForMatch(raw)

  const caseInsensitive = options.find(o => normalizeForMatch(o) === norm)
  if (caseInsensitive) return caseInsensitive

  const aliased = options.find(o => aliasesFor(o).includes(norm))
  if (aliased) return aliased

  // Prose containing the option ("Hard Red Winter Wheat" -> "Wheat").
  const contained = options.filter(o => containsToken(norm, normalizeForMatch(o)))
  if (contained.length === 1) return contained[0]

  return null
}

/** Split a prose or delimited value into candidate list items. */
export function splitList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean)
  }
  const str = String(value ?? "").trim()
  if (!str) return []

  // JSON array that arrived as a string.
  if (str.startsWith("[") && str.endsWith("]")) {
    try {
      const parsed = JSON.parse(str)
      if (Array.isArray(parsed)) return parsed.map(v => String(v).trim()).filter(Boolean)
    } catch {
      /* fall through to delimiter splitting */
    }
  }

  return str
    .split(/[;,\n]|\band\b|\/|\|/gi)
    .map(s => s.trim().replace(/\.$/, ""))
    .filter(Boolean)
}

export interface CoercionOutcome {
  /** Present when the value could be represented in the target type. */
  value?: unknown
  /** True when the raw value had to be transformed to fit the target type. */
  coerced: boolean
  /** Populated when the value cannot be represented; the record is then invalid. */
  error?: string
  warning?: string
}

/**
 * Coerce a single generated value into its target field type.
 */
export function coerceValue(raw: unknown, field: TargetField): CoercionOutcome {
  const type = (field.type || "text").toLowerCase()

  if (raw === null || raw === undefined) {
    return { coerced: false }
  }

  const asString = typeof raw === "string" ? raw.trim() : raw
  if (typeof asString === "string" && asString.length === 0) {
    return { coerced: false }
  }

  switch (type) {
    case "number":
    case "integer":
    case "float": {
      if (typeof raw === "number") {
        if (!Number.isFinite(raw)) return { coerced: false, error: "number is not finite" }
        return { value: raw, coerced: false }
      }
      // Strip currency symbols, thousands separators and trailing units.
      const cleaned = String(raw).replace(/[^0-9.\-eE]/g, "")
      const num = Number(cleaned)
      if (!cleaned || !Number.isFinite(num)) {
        return { coerced: false, error: `cannot be read as a number: ${JSON.stringify(raw)}` }
      }
      const value = type === "integer" ? Math.round(num) : num
      return { value, coerced: true }
    }

    case "boolean": {
      if (typeof raw === "boolean") return { value: raw, coerced: false }
      const s = String(raw).trim().toLowerCase()
      if (["true", "yes", "y", "1"].includes(s)) return { value: true, coerced: true }
      if (["false", "no", "n", "0"].includes(s)) return { value: false, coerced: true }
      return { coerced: false, error: `cannot be read as a boolean: ${JSON.stringify(raw)}` }
    }

    case "select": {
      const str = String(raw).trim()
      if (!field.options || field.options.length === 0) return { value: str, coerced: false }
      const matched = matchOption(str, field.options)
      if (matched === null) {
        return { coerced: false, error: `"${str}" is not one of the allowed options` }
      }
      return { value: matched, coerced: matched !== str }
    }

    case "multi_select":
    case "multiselect":
    case "tags": {
      const items = splitList(raw)
      if (items.length === 0) return { coerced: false }
      if (!field.options || field.options.length === 0) {
        return { value: items, coerced: !Array.isArray(raw) }
      }
      const mapped: string[] = []
      const unmatched: string[] = []
      for (const item of items) {
        const matched = matchOption(item, field.options)
        if (matched && !mapped.includes(matched)) mapped.push(matched)
        else if (!matched) unmatched.push(item)
      }
      if (mapped.length === 0) {
        return { coerced: false, error: `no value matched the allowed options (got ${items.join(", ")})` }
      }
      return {
        value: mapped,
        coerced: true,
        warning: unmatched.length > 0 ? `dropped unmatched value(s): ${unmatched.join(", ")}` : undefined,
      }
    }

    case "date": {
      const str = String(raw).trim()
      const iso = /^\d{4}-\d{2}-\d{2}/.exec(str)
      if (iso) return { value: str.slice(0, 10), coerced: str.length > 10 }
      const parsed = new Date(str)
      if (Number.isNaN(parsed.getTime())) {
        return { coerced: false, error: `cannot be read as a date: ${JSON.stringify(raw)}` }
      }
      return { value: parsed.toISOString().slice(0, 10), coerced: true }
    }

    default: {
      // text, rich_text, textarea, email, phone, url, address, country, ...
      if (typeof raw === "string") return { value: raw.trim(), coerced: raw !== raw.trim() }
      if (Array.isArray(raw)) return { value: raw.join(", "), coerced: true }
      if (typeof raw === "object") return { value: JSON.stringify(raw), coerced: true }
      return { value: String(raw), coerced: true }
    }
  }
}
