/**
 * Synthetic-population watermarking — ClientSynth side of GAP-9.
 *
 * Every synthetic record ClientSynth exports carries a tamper-evident watermark
 * so Cosolvent's ingest boundary can (a) require it in demo/synthetic mode and
 * (b) reject it in production — the clean-cutover rule, enforced in the data
 * layer rather than by convention.
 *
 * This is the signing counterpart of Cosolvent's `app/core/watermark.py`, and it
 * MUST produce byte-identical canonical payloads. Cosolvent verifies by
 * re-canonicalising the record it parsed from our file, so any divergence in
 * key order, separators, or escaping breaks every signature.
 *
 * Canonical form (matching Python's
 * `json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`):
 *   - object keys sorted by Unicode CODE POINT (not JS's default UTF-16 order),
 *   - no whitespace between tokens,
 *   - non-ASCII left unescaped,
 *   - `undefined`-valued keys omitted, exactly as `JSON.stringify` omits them
 *     when the file is written (so what we sign is what Cosolvent parses).
 */

import { createHmac, timingSafeEqual } from "node:crypto"

export const WATERMARK_ALGO = "hmac-sha256-v1"
export const WATERMARK_KEY = "_watermark"

export interface Watermark {
  synthetic: true
  algo: string
  signature: string
}

/** The signed subset of a population record. */
export interface SignableRecord {
  participant_type?: string | null
  external_id?: string | null
  fields?: Record<string, unknown> | null
}

export interface PopulationRecord extends SignableRecord {
  participant_type: string
  external_id: string
  fields: Record<string, unknown>
  [WATERMARK_KEY]?: Watermark
}

/** Compare two strings by Unicode code point, matching Python's `sorted()` on `str`. */
function compareByCodePoint(a: string, b: string): number {
  const ca = Array.from(a)
  const cb = Array.from(b)
  const n = Math.min(ca.length, cb.length)
  for (let i = 0; i < n; i++) {
    const da = ca[i].codePointAt(0)! - cb[i].codePointAt(0)!
    if (da !== 0) return da
  }
  return ca.length - cb.length
}

/** True for values `JSON.stringify` drops rather than serialises. */
function isOmitted(value: unknown): boolean {
  return value === undefined || typeof value === "function" || typeof value === "symbol"
}

/**
 * Serialise `value` to Python-compatible canonical JSON.
 *
 * Primitives delegate to `JSON.stringify`, whose string escaping and
 * shortest-round-trip number formatting already agree with Python's.
 */
function canonicalize(value: unknown): string {
  if (value === null) return "null"

  if (Array.isArray(value)) {
    // JSON.stringify renders omitted values inside arrays as `null`; match that.
    const items = value.map(v => (isOmitted(v) ? "null" : canonicalize(v)))
    return `[${items.join(",")}]`
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
      .filter(k => !isOmitted(obj[k]))
      .sort(compareByCodePoint)
    const parts = keys.map(k => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    return `{${parts.join(",")}}`
  }

  const out = JSON.stringify(value)
  // Non-finite numbers have no JSON representation and would silently become
  // `null` here while Python emits `NaN`/`Infinity` — refuse rather than sign
  // a payload the verifier can never reproduce.
  if (out === undefined) throw new Error(`Value cannot be canonicalised: ${String(value)}`)
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Non-finite number cannot be watermarked: ${String(value)}`)
  }
  return out
}

/**
 * Deterministic bytes of a record's signed content — the watermark block itself
 * is excluded, so signing and verification always agree.
 */
export function canonicalPayload(record: SignableRecord): string {
  return canonicalize({
    participant_type: record.participant_type ?? null,
    external_id: record.external_id ?? null,
    fields: record.fields ?? {},
  })
}

/** Hex HMAC-SHA256 signature for a record. */
export function sign(record: SignableRecord, secret: string): string {
  if (!secret) throw new Error("A watermark secret is required (SYNTHETIC_WATERMARK_SECRET)")
  return createHmac("sha256", secret).update(canonicalPayload(record), "utf8").digest("hex")
}

/** Return a copy of `record` with a valid watermark attached. */
export function stamp<T extends SignableRecord>(record: T, secret: string): T & { _watermark: Watermark } {
  return {
    ...record,
    [WATERMARK_KEY]: { synthetic: true, algo: WATERMARK_ALGO, signature: sign(record, secret) },
  } as T & { _watermark: Watermark }
}

/** True if the record carries a watermark block (valid or not). */
export function isWatermarked(record: Record<string, any>): boolean {
  const wm = record?.[WATERMARK_KEY]
  return !!wm && typeof wm === "object" && typeof wm.signature === "string" && wm.signature.length > 0
}

/**
 * True only if the record carries a well-formed watermark whose signature
 * matches its content under `secret`. Mirrors Cosolvent's `verify`, so the
 * export path can self-check before shipping.
 */
export function verify(record: Record<string, any>, secret: string): boolean {
  const wm = record?.[WATERMARK_KEY]
  if (!wm || typeof wm !== "object") return false
  if (wm.algo !== WATERMARK_ALGO) return false
  const signature = wm.signature
  if (typeof signature !== "string" || signature.length === 0) return false

  const expected = sign(record as SignableRecord, secret)
  const a = Buffer.from(signature, "utf8")
  const b = Buffer.from(expected, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** The shared HMAC key. Must match Cosolvent's `SYNTHETIC_WATERMARK_SECRET`. */
export function getWatermarkSecret(): string {
  const secret = process.env.SYNTHETIC_WATERMARK_SECRET
  if (!secret) {
    throw new Error(
      "SYNTHETIC_WATERMARK_SECRET is not set. It must match Cosolvent's secret, " +
        "otherwise every exported record is rejected at the ingest boundary.",
    )
  }
  return secret
}
