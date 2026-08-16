/**
 * E2E step 1: generate a synthetic population aligned to a Cosolvent profile schema.
 *
 * Creates a ClientSynth schema whose fields carry the target marketplace's
 * constraints, runs real generation against it, and persists the records — so
 * the population export that follows ships data that is valid by construction.
 *
 *   npx tsx scripts/e2e-generate-aligned.ts \
 *     --target-schema producer.schema.json --count 6 [--tenant <id>] [--user <id>]
 *
 * Prints the created job id, which feeds scripts/export-population.ts.
 */

import { existsSync, readFileSync } from "node:fs"

import { AIGenerator, type SchemaContext } from "../lib/ai-generator"
import { buildAlignedSchemaDefinition } from "../lib/population/schema-alignment"
import { parseTargetSchema } from "../lib/population/job-population-service"
import { OutputValidator } from "../lib/validation/output-validator"

function loadEnvFile(path = ".env"): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key] !== undefined) continue
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
  }
}

loadEnvFile()

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

async function main() {
  const { query } = await import("../lib/postgres/client")

  const targetSchemaPath = arg("target-schema")
  if (!targetSchemaPath) {
    console.error("Usage: npx tsx scripts/e2e-generate-aligned.ts --target-schema <file.json> [--count N]")
    process.exit(2)
  }

  const target = parseTargetSchema(readFileSync(targetSchemaPath, "utf8"))
  const count = Number(arg("count", "6"))

  const tenantId = arg("tenant") || (await query("SELECT id FROM tenants LIMIT 1")).rows[0]?.id
  const userId = arg("user") || (await query("SELECT id FROM profiles LIMIT 1")).rows[0]?.id
  if (!tenantId || !userId) throw new Error("No tenant/profile available to own the job")

  const definition = buildAlignedSchemaDefinition(target)
  console.log(`Aligned ${definition.fields.length} field(s) to participant type "${target.participantType}":`)
  for (const f of definition.fields) {
    const opts = f.constraints?.options
    console.log(`  - ${f.name} (${f.type})${f.required ? " required" : ""}${opts ? ` options=[${opts.join(", ")}]` : ""}`)
  }

  const schemaName = `E2E ${target.participantType} (aligned)`
  const schemaRow = await query(
    `INSERT INTO schemas (tenant_id, name, description, schema_definition, participant_type, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING id`,
    [
      tenantId,
      schemaName,
      `Aligned to the Cosolvent "${target.participantType}" profile schema`,
      JSON.stringify(definition),
      target.participantType,
      userId,
    ],
  )
  const schemaId = schemaRow.rows[0].id

  const jobRow = await query(
    `INSERT INTO jobs (tenant_id, schema_id, name, status, total_records, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, 'running', $4, $5, NOW(), NOW()) RETURNING id`,
    [tenantId, schemaId, `E2E population ${target.participantType}`, count, userId],
  )
  const jobId = jobRow.rows[0].id

  console.log(`\nschema_id=${schemaId}\njob_id=${jobId}\n`)

  const generator = new AIGenerator()
  const schemaContext: SchemaContext = {
    schemaName,
    schemaDescription: `Synthetic ${target.participantType} profiles for a grain marketplace`,
    allFields: definition.fields.map(f => ({ name: f.name, type: f.type, description: f.description })),
  }

  const previousRecords: Record<string, any>[] = []
  let generated = 0
  let optionViolations = 0
  let consistencyIssues = 0

  for (let i = 0; i < count; i++) {
    const record = await generator.generateRecord(
      definition.fields as any,
      schemaContext,
      i,
      undefined,
      previousRecords,
      undefined,
    )

    if (!record) {
      console.warn(`  record ${i}: generation failed`)
      continue
    }

    const issues = OutputValidator.validate(record, definition.fields as any)
    const errors = issues.filter(x => x.severity === "error")
    optionViolations += errors.filter(x => /not one of the allowed values/.test(x.issue)).length
    consistencyIssues += errors.filter(x => /does not match|Address mentions/.test(x.issue)).length

    await query(
      `INSERT INTO generated_data (job_id, tenant_id, record_data, record_index, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [jobId, tenantId, JSON.stringify(record), i],
    )
    previousRecords.push(record)
    generated++

    const summary = Object.entries(record)
      .map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.join("|")}]` : JSON.stringify(v)}`)
      .join(" ")
    console.log(`  record ${i}: ${errors.length === 0 ? "OK  " : `${errors.length} err`} ${summary.slice(0, 190)}`)
    for (const e of errors) console.log(`      ! ${e.field}: ${e.issue}`)
  }

  await query(`UPDATE jobs SET status='completed', generated_records=$1, progress=100 WHERE id=$2`, [generated, jobId])

  console.log(`\n[ok] generated ${generated}/${count} record(s)`)
  console.log(`     allowed-value violations: ${optionViolations}`)
  console.log(`     cross-field consistency errors: ${consistencyIssues}`)
  console.log(`\nJOB_ID=${jobId}`)
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(`[error] ${err instanceof Error ? err.stack : String(err)}`)
    process.exit(1)
  })
