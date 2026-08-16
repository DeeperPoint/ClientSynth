/**
 * CLI: export a generation job as a Cosolvent C0 population file.
 *
 *   npx tsx scripts/export-population.ts --job <jobId> -o population.json \
 *     [--target-schema producer.schema.json] [--participant-type producer] \
 *     [--mode demo|production] [--limit N] [--allow-invalid]
 *
 * The target schema is the descriptor Cosolvent publishes with
 * `python -m cli export-profile-schema <type> -o <file>`. Supplying it lets the
 * exporter coerce values and reject schema violations here, rather than having
 * the ingest boundary reject them later.
 *
 * Load the result with:
 *   python -m cli load-population population.json --mode demo
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"

import { exportJobPopulation, parseTargetSchema } from "../lib/population/job-population-service"
import { serializePopulation } from "../lib/population/population-export"

/**
 * Minimal .env loader. Next.js loads .env for the app, but this script runs
 * standalone; a few lines here avoid taking on a dependency for it.
 *
 * Imports above are hoisted, but both the pg pool and the watermark secret read
 * their environment lazily on first use, so loading here — before `main()` —
 * is early enough.
 */
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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const jobId = arg("job")
  const output = arg("output") || arg("o") || process.argv[process.argv.indexOf("-o") + 1]

  if (!jobId || !output || output.startsWith("--")) {
    console.error("Usage: npx tsx scripts/export-population.ts --job <jobId> -o <out.json> [options]")
    process.exit(2)
  }

  const targetSchemaPath = arg("target-schema")
  const targetSchema = targetSchemaPath
    ? parseTargetSchema(readFileSync(targetSchemaPath, "utf8"))
    : undefined

  const mode = (arg("mode") || "demo") as "demo" | "production"
  if (mode !== "demo" && mode !== "production") {
    console.error(`Invalid --mode "${mode}" (expected demo or production)`)
    process.exit(2)
  }

  const limitArg = arg("limit")

  const result = await exportJobPopulation(jobId, {
    targetSchema,
    participantType: arg("participant-type"),
    externalIdPrefix: arg("prefix"),
    mode,
    strict: !flag("allow-invalid"),
    limit: limitArg ? Number(limitArg) : undefined,
  })

  writeFileSync(output, serializePopulation(result.file), "utf8")

  const s = result.stats
  console.log(`[ok] wrote ${s.exported}/${s.total} record(s) -> ${output}`)
  console.log(
    `     mode=${result.file.mode} participant_type=${result.file.participant_type} ` +
      `coerced=${s.coerced} dropped_fields=${s.droppedFields} warnings=${s.warnings} rejected=${s.rejected}`,
  )

  if (result.rejected.length > 0) {
    console.log(`[warn] ${result.rejected.length} record(s) rejected before export:`)
    for (const r of result.rejected.slice(0, 10)) {
      console.log(`       #${r.recordIndex} ${r.externalId}: ${r.reasons.join("; ")}`)
    }
    if (result.rejected.length > 10) console.log(`       ... and ${result.rejected.length - 10} more`)
  }

  if (s.exported === 0) {
    console.error("[error] no records were exported")
    process.exit(1)
  }
}

main().catch(err => {
  console.error(`[error] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
