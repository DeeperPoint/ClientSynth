/**
 * Types for the C0 synthetic population export (GAP-10).
 *
 * ClientSynth generates records against its own dynamic schema; Cosolvent
 * validates them against a marketplace `profile_schema`. These types describe
 * the target side of that boundary so the exporter can coerce and pre-validate
 * before shipping, rather than discovering rejections after the fact.
 */

import type { Watermark } from "./watermark"

/** A field in the target Cosolvent `profile_schema`. */
export interface TargetField {
  name: string
  /** Cosolvent field type: text, rich_text, select, multi_select, number, boolean, date, file(s). */
  type: string
  required?: boolean
  /** Allowed values for select / multi_select. */
  options?: string[]
}

/** The target marketplace profile schema for one participant type. */
export interface TargetSchema {
  participantType: string
  fields: TargetField[]
}

export interface PopulationExportOptions {
  /** Participant type slug. Falls back to `targetSchema.participantType`. */
  participantType?: string
  /**
   * The Cosolvent profile schema to coerce and validate against. Without it the
   * exporter falls back to an identity mapping and can only apply structural
   * checks — pass it whenever the target marketplace is known.
   */
  targetSchema?: TargetSchema
  /** Rename map: ClientSynth field name -> Cosolvent field name. */
  fieldMap?: Record<string, string>
  /**
   * The source ClientSynth schema fields. Used to drop asset fields (image /
   * pdf / file), whose values are S3 URLs that have no place in a population
   * record, and to inform coercion when no target schema is supplied.
   */
  sourceFields?: Array<{ name: string; type: string }>
  /** Prefix for generated external ids. Default `"cs"`. */
  externalIdPrefix?: string
  /**
   * Stable id source. `"index"` (default) derives `<prefix>-<scope>-<index>`,
   * which is deterministic across re-exports so Cosolvent upserts in place.
   * Naming a record field uses that field's value instead.
   */
  externalIdField?: string
  /** Scope segment of the generated id — normally the job id. */
  scope?: string
  /** Shared HMAC secret. Defaults to `SYNTHETIC_WATERMARK_SECRET`. */
  secret?: string
  /**
   * `demo` (default) stamps every record with a watermark. `production` emits
   * records WITHOUT a watermark, because Cosolvent rejects watermarked records
   * in production — the clean-cutover rule.
   */
  mode?: "demo" | "production"
  /** Drop records with validation errors instead of exporting them. Default true. */
  strict?: boolean
}

/** A record in the population file Cosolvent ingests. */
export interface ExportedPopulationRecord {
  participant_type: string
  external_id: string
  fields: Record<string, unknown>
  _watermark?: Watermark
}

export interface RecordIssue {
  recordIndex: number
  externalId: string
  field?: string
  issue: string
  severity: "error" | "warning"
}

export interface PopulationFile {
  generator: string
  generated_at: string
  mode: "demo" | "production"
  participant_type: string
  count: number
  records: ExportedPopulationRecord[]
}

export interface PopulationExportResult {
  file: PopulationFile
  /** Records dropped by the validity gate (strict mode). */
  rejected: Array<{ recordIndex: number; externalId: string; reasons: string[] }>
  issues: RecordIssue[]
  stats: {
    total: number
    exported: number
    rejected: number
    warnings: number
    coerced: number
    droppedFields: number
  }
}
