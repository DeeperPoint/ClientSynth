/**
 * Export a generation job's records as a Cosolvent C0 population file.
 *
 * Bridges ClientSynth's storage (jobs / schemas / generated_data) to the
 * pure `buildPopulation` mapper, resolving the participant type and the source
 * field types the mapper needs to drop asset fields.
 */

import { query } from "@/lib/postgres/client"
import { buildPopulation } from "./population-export"
import type { PopulationExportOptions, PopulationExportResult, TargetSchema } from "./types"

export interface JobPopulationOptions extends Omit<PopulationExportOptions, "scope" | "sourceFields"> {
  limit?: number
  offset?: number
}

/** Parse a published Cosolvent profile-schema descriptor. */
export function parseTargetSchema(raw: unknown): TargetSchema {
  const obj = typeof raw === "string" ? JSON.parse(raw) : raw
  if (!obj || typeof obj !== "object") {
    throw new Error("Target schema must be an object")
  }
  const participantType = (obj as any).participantType || (obj as any).participant_type
  const fields = (obj as any).fields
  if (!participantType || !Array.isArray(fields)) {
    throw new Error(
      'Target schema must have "participantType" and a "fields" array ' +
        "(generate it with Cosolvent's `python -m cli export-profile-schema <type>`)",
    )
  }
  return {
    participantType,
    fields: fields.map((f: any) => ({
      name: f.name,
      type: f.type,
      required: !!f.required,
      options: Array.isArray(f.options) ? f.options : undefined,
    })),
  }
}

export async function exportJobPopulation(
  jobId: string,
  options: JobPopulationOptions = {},
): Promise<PopulationExportResult> {
  const jobResult = await query(
    `SELECT j.id, j.name, j.schema_id, s.participant_type, s.schema_definition
       FROM jobs j
       LEFT JOIN schemas s ON s.id = j.schema_id
      WHERE j.id = $1`,
    [jobId],
  )

  if (jobResult.rows.length === 0) {
    throw new Error(`Job not found: ${jobId}`)
  }
  const job = jobResult.rows[0]

  const offset = options.offset || 0
  const limit = options.limit || 50000
  const dataResult = await query(
    `SELECT record_data, record_index FROM generated_data
      WHERE job_id = $1 ORDER BY record_index ASC OFFSET $2 LIMIT $3`,
    [jobId, offset, limit],
  )

  if (!dataResult.rows || dataResult.rows.length === 0) {
    throw new Error(`No generated records found for job ${jobId}`)
  }

  const sourceFields: Array<{ name: string; type: string }> = Array.isArray(job.schema_definition?.fields)
    ? job.schema_definition.fields.map((f: any) => ({ name: f.name, type: f.type }))
    : []

  // Precedence: explicit option, then the target schema, then the schema row.
  const participantType =
    options.participantType || options.targetSchema?.participantType || job.participant_type || undefined

  if (!participantType) {
    throw new Error(
      `Job ${jobId} has no participant type. Set schemas.participant_type for schema ${job.schema_id}, ` +
        "pass participantType, or supply a target schema.",
    )
  }

  return buildPopulation(dataResult.rows, {
    ...options,
    participantType,
    sourceFields,
    scope: jobId,
  })
}
