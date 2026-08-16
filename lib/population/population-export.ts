/**
 * C0 synthetic population export — the ClientSynth side of GAP-10 / GAP-9.
 *
 * Produces the population file Cosolvent's `load-population` ingests: each
 * generated record becomes `{participant_type, external_id, fields}` carrying a
 * tamper-evident synthetic watermark.
 *
 * Two properties matter at the boundary and are enforced here:
 *
 *  - **Idempotency.** `external_id` is derived deterministically from the job
 *    and record index, so re-exporting and re-importing the same job upserts
 *    the same profiles in place rather than duplicating the population.
 *  - **Clean cutover.** In `demo` mode every record is watermarked; in
 *    `production` mode none are, because Cosolvent rejects watermarked records
 *    there. The mode is explicit, never a silent default.
 *
 * Records are validated against the target profile schema *before* export, so
 * failures surface here with a field-level reason instead of as an opaque
 * rejection count from the importer.
 */

import { coerceValue, isAssetType } from "./field-mapper"
import { getWatermarkSecret, stamp } from "./watermark"
import type {
  ExportedPopulationRecord,
  PopulationExportOptions,
  PopulationExportResult,
  PopulationFile,
  RecordIssue,
  TargetField,
} from "./types"

export const POPULATION_GENERATOR = "clientsynth/population-export@1"

/** Deterministic, stable id — the basis of idempotent re-import. */
export function buildExternalId(
  record: Record<string, any>,
  recordIndex: number,
  options: Pick<PopulationExportOptions, "externalIdPrefix" | "externalIdField" | "scope">,
): string {
  const prefix = options.externalIdPrefix || "cs"

  if (options.externalIdField) {
    const raw = record[options.externalIdField]
    const value = raw == null ? "" : String(raw).trim()
    if (value) {
      return `${prefix}-${value.replace(/\s+/g, "-")}`
    }
    // Fall through to the index form rather than emitting a colliding blank id.
  }

  const scope = (options.scope || "job").replace(/-/g, "").slice(0, 8)
  return `${prefix}-${scope}-${String(recordIndex).padStart(6, "0")}`
}

interface MappedRecord {
  fields: Record<string, unknown>
  errors: string[]
  warnings: string[]
  coerced: number
  droppedFields: number
}

/**
 * Map one ClientSynth record onto the target profile schema, coercing values
 * and collecting every reason it would fail Cosolvent's validator.
 */
function mapRecordFields(record: Record<string, any>, options: PopulationExportOptions): MappedRecord {
  const { targetSchema, fieldMap = {}, sourceFields = [] } = options
  const errors: string[] = []
  const warnings: string[] = []
  let coerced = 0
  let droppedFields = 0

  const sourceTypeByName = new Map(sourceFields.map(f => [f.name, f.type]))

  // Rename source keys onto target names, dropping asset fields whose values
  // are S3 URLs rather than profile data.
  const renamed: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (isAssetType(sourceTypeByName.get(key))) {
      droppedFields++
      continue
    }
    const target = fieldMap[key] || key
    renamed[target] = value
  }

  if (!targetSchema) {
    // No target schema: pass values through unchanged. Cosolvent still applies
    // the authoritative validation at ingest.
    const fields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(renamed)) {
      if (value === null || value === undefined) continue
      if (typeof value === "string" && value.trim().length === 0) continue
      fields[key] = typeof value === "string" ? value.trim() : value
    }
    return { fields, errors, warnings, coerced, droppedFields }
  }

  const fields: Record<string, unknown> = {}
  const targetByName = new Map<string, TargetField>(targetSchema.fields.map(f => [f.name, f]))

  for (const field of targetSchema.fields) {
    if (isAssetType(field.type)) continue

    const raw = renamed[field.name]
    const outcome = coerceValue(raw, field)

    if (outcome.error) {
      errors.push(`${field.name}: ${outcome.error}`)
      continue
    }
    if (outcome.warning) warnings.push(`${field.name}: ${outcome.warning}`)
    if (outcome.coerced) coerced++

    if (outcome.value === undefined) {
      if (field.required) errors.push(`${field.name}: required field is missing or empty`)
      continue
    }
    fields[field.name] = outcome.value
  }

  // Values with no counterpart in the target schema are dropped: Cosolvent's
  // validator rejects unknown fields.
  for (const key of Object.keys(renamed)) {
    if (!targetByName.has(key)) {
      droppedFields++
      warnings.push(`${key}: dropped (no such field in the target profile schema)`)
    }
  }

  return { fields, errors, warnings, coerced, droppedFields }
}

/**
 * Build the population file from generated records.
 *
 * `records` are raw ClientSynth `record_data` objects in record-index order.
 */
export function buildPopulation(
  records: Array<{ record_data: Record<string, any>; record_index: number }>,
  options: PopulationExportOptions = {},
): PopulationExportResult {
  const mode = options.mode || "demo"
  const strict = options.strict !== false
  const participantType = options.participantType || options.targetSchema?.participantType

  if (!participantType) {
    throw new Error(
      "A participant_type is required. Set it on the schema (schemas.participant_type), " +
        "pass participantType, or supply a targetSchema.",
    )
  }

  // Only resolve the secret when we will actually sign — production exports
  // must work on a host that has no synthetic secret configured at all.
  const secret = mode === "demo" ? options.secret || getWatermarkSecret() : undefined

  const exported: ExportedPopulationRecord[] = []
  const rejected: PopulationExportResult["rejected"] = []
  const issues: RecordIssue[] = []
  let coerced = 0
  let droppedFields = 0
  let warnings = 0

  const seenIds = new Set<string>()

  for (const row of records) {
    const recordIndex = row.record_index
    const externalId = buildExternalId(row.record_data, recordIndex, options)

    const mapped = mapRecordFields(row.record_data, options)
    coerced += mapped.coerced
    droppedFields += mapped.droppedFields

    for (const warning of mapped.warnings) {
      warnings++
      issues.push({ recordIndex, externalId, issue: warning, severity: "warning" })
    }
    for (const error of mapped.errors) {
      issues.push({ recordIndex, externalId, issue: error, severity: "error" })
    }

    const errors = [...mapped.errors]

    // A duplicate external_id would silently overwrite an earlier record on
    // import, turning a 100-record population into fewer profiles.
    if (seenIds.has(externalId)) {
      errors.push(`external_id "${externalId}" is not unique within this export`)
      issues.push({
        recordIndex,
        externalId,
        issue: `duplicate external_id "${externalId}"`,
        severity: "error",
      })
    }

    if (Object.keys(mapped.fields).length === 0) {
      errors.push("record has no exportable fields")
      issues.push({ recordIndex, externalId, issue: "no exportable fields", severity: "error" })
    }

    if (errors.length > 0 && strict) {
      rejected.push({ recordIndex, externalId, reasons: errors })
      continue
    }

    seenIds.add(externalId)

    const base = {
      participant_type: participantType,
      external_id: externalId,
      fields: mapped.fields,
    }

    exported.push(mode === "demo" ? stamp(base, secret!) : base)
  }

  const file: PopulationFile = {
    generator: POPULATION_GENERATOR,
    generated_at: new Date().toISOString(),
    mode,
    participant_type: participantType,
    count: exported.length,
    records: exported,
  }

  return {
    file,
    rejected,
    issues,
    stats: {
      total: records.length,
      exported: exported.length,
      rejected: rejected.length,
      warnings,
      coerced,
      droppedFields,
    },
  }
}

/** Serialise the population file exactly as Cosolvent's loader expects it. */
export function serializePopulation(file: PopulationFile): string {
  return JSON.stringify(file, null, 2)
}
