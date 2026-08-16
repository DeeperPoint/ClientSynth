/**
 * @jest-environment node
 */
/**
 * C0 synthetic population export (GAP-10) + watermarking (GAP-9).
 *
 * Covers the watermark itself, the schema-driven field mapper, the pre-export
 * validity gate, and the `population` format on POST /api/exports/create.
 */

const mockQuery = jest.fn()
const mockGetCurrentUser = jest.fn()
const mockHasTenantAccess = jest.fn()

jest.mock("@/lib/postgres/client", () => ({
  query: (...args: any[]) => mockQuery(...args),
  getCurrentUser: () => mockGetCurrentUser(),
  hasTenantAccess: (...args: any[]) => mockHasTenantAccess(...args),
  getPool: jest.fn(),
  getClient: jest.fn(),
}))

import {
  canonicalPayload,
  isWatermarked,
  sign,
  stamp,
  verify,
  WATERMARK_ALGO,
} from "@/lib/population/watermark"
import { coerceValue, matchOption, splitList } from "@/lib/population/field-mapper"
import { buildExternalId, buildPopulation } from "@/lib/population/population-export"
import { parseTargetSchema } from "@/lib/population/job-population-service"
import type { TargetSchema } from "@/lib/population/types"
import { POST as createExportRoute } from "@/app/api/exports/create/route"
import { createNextRequest, parseResponse, mockUser, TEST_IDS } from "../test-helpers"

const SECRET = "test-shared-secret"

const PRODUCER_SCHEMA: TargetSchema = {
  participantType: "producer",
  fields: [
    { name: "farm_name", type: "text", required: true },
    { name: "country", type: "select", required: true, options: ["Canada", "USA"] },
    { name: "primary_crops", type: "multi_select", required: true, options: ["Wheat", "Barley"] },
    { name: "description", type: "rich_text", required: false },
    { name: "annual_production", type: "number", required: false },
  ],
}

function row(record_data: Record<string, any>, record_index = 0) {
  return { record_data, record_index }
}

// ─── Watermark ───────────────────────────────────────────────────────────────

describe("watermark", () => {
  const record = {
    participant_type: "producer",
    external_id: "cs-1",
    fields: { farm_name: "North Ridge", country: "Canada" },
  }

  it("stamps a record with the shared algorithm and a verifying signature", () => {
    const stamped = stamp(record, SECRET)
    expect(stamped._watermark.synthetic).toBe(true)
    expect(stamped._watermark.algo).toBe(WATERMARK_ALGO)
    expect(verify(stamped, SECRET)).toBe(true)
  })

  it("is independent of key insertion order", () => {
    const reordered = {
      fields: { country: "Canada", farm_name: "North Ridge" },
      external_id: "cs-1",
      participant_type: "producer",
    }
    expect(canonicalPayload(reordered)).toBe(canonicalPayload(record))
    expect(sign(reordered, SECRET)).toBe(sign(record, SECRET))
  })

  it("produces canonical JSON with sorted keys and no whitespace", () => {
    expect(canonicalPayload(record)).toBe(
      '{"external_id":"cs-1","fields":{"country":"Canada","farm_name":"North Ridge"},"participant_type":"producer"}',
    )
  })

  it("detects tampering with a signed field", () => {
    const stamped: any = stamp(record, SECRET)
    stamped.fields.country = "USA"
    expect(verify(stamped, SECRET)).toBe(false)
  })

  it("detects a swapped external_id", () => {
    const stamped: any = stamp(record, SECRET)
    stamped.external_id = "cs-999"
    expect(verify(stamped, SECRET)).toBe(false)
  })

  it("rejects a signature made with a different secret", () => {
    expect(verify(stamp(record, "other-secret"), SECRET)).toBe(false)
  })

  it("rejects an unknown algorithm even when the signature is right", () => {
    const stamped: any = stamp(record, SECRET)
    stamped._watermark.algo = "hmac-sha256-v2"
    expect(verify(stamped, SECRET)).toBe(false)
  })

  it("treats an unwatermarked record as unwatermarked and unverified", () => {
    expect(isWatermarked(record)).toBe(false)
    expect(verify(record, SECRET)).toBe(false)
  })

  it("refuses to sign a non-finite number rather than emitting an unverifiable payload", () => {
    expect(() => sign({ ...record, fields: { size: Number.NaN } }, SECRET)).toThrow(/non-finite/i)
  })
})

// ─── Field mapping ───────────────────────────────────────────────────────────

describe("field mapper", () => {
  it("matches an option exactly, case-insensitively, and by alias", () => {
    expect(matchOption("Canada", ["Canada", "USA"])).toBe("Canada")
    expect(matchOption("canada", ["Canada", "USA"])).toBe("Canada")
    expect(matchOption("United States", ["Canada", "USA"])).toBe("USA")
  })

  it("extracts an option from surrounding prose", () => {
    expect(matchOption("Hard Red Winter Wheat", ["Wheat", "Barley"])).toBe("Wheat")
  })

  it("does not match on a partial word", () => {
    expect(matchOption("Buckwheat", ["Wheat", "Barley"])).toBeNull()
  })

  it("returns null rather than guessing at an unknown value", () => {
    expect(matchOption("Kazakhstan", ["Canada", "USA"])).toBeNull()
  })

  it("splits prose, delimited and JSON-encoded lists", () => {
    expect(splitList("Wheat, Barley")).toEqual(["Wheat", "Barley"])
    expect(splitList("Wheat and Barley")).toEqual(["Wheat", "Barley"])
    expect(splitList('["Wheat","Barley"]')).toEqual(["Wheat", "Barley"])
    expect(splitList(["Wheat", "Barley"])).toEqual(["Wheat", "Barley"])
  })

  it("coerces a numeric string to a number", () => {
    const out = coerceValue("640", { name: "annual_production", type: "number" })
    expect(out.value).toBe(640)
    expect(out.coerced).toBe(true)
  })

  it("strips units and separators from a number", () => {
    expect(coerceValue("$1,250.50", { name: "price", type: "number" }).value).toBe(1250.5)
  })

  it("reports a number that cannot be read instead of coercing to NaN", () => {
    const out = coerceValue("not a number", { name: "annual_production", type: "number" })
    expect(out.value).toBeUndefined()
    expect(out.error).toMatch(/cannot be read as a number/)
  })

  it("maps prose onto a multi_select option list", () => {
    const out = coerceValue("Hard Red Winter Wheat, Malting Barley", {
      name: "primary_crops",
      type: "multi_select",
      options: ["Wheat", "Barley"],
    })
    expect(out.value).toEqual(["Wheat", "Barley"])
  })

  it("warns about multi_select values it had to drop", () => {
    const out = coerceValue("Wheat, Sorghum", {
      name: "primary_crops",
      type: "multi_select",
      options: ["Wheat", "Barley"],
    })
    expect(out.value).toEqual(["Wheat"])
    expect(out.warning).toMatch(/Sorghum/)
  })
})

// ─── Population build + validity gate ────────────────────────────────────────

describe("buildPopulation", () => {
  const valid = {
    farm_name: "North Ridge Farms",
    country: "Canada",
    primary_crops: "Wheat, Barley",
    annual_production: "500000",
  }

  it("builds watermarked records that verify under the shared secret", () => {
    const result = buildPopulation([row(valid)], {
      targetSchema: PRODUCER_SCHEMA,
      secret: SECRET,
      scope: "job-1234abcd",
    })

    expect(result.stats.exported).toBe(1)
    const record = result.file.records[0]
    expect(record.participant_type).toBe("producer")
    expect(verify(record, SECRET)).toBe(true)
  })

  it("coerces values to the target field types", () => {
    const result = buildPopulation([row(valid)], {
      targetSchema: PRODUCER_SCHEMA,
      secret: SECRET,
      scope: "job-1234abcd",
    })
    const fields = result.file.records[0].fields
    expect(fields.primary_crops).toEqual(["Wheat", "Barley"])
    expect(fields.annual_production).toBe(500000)
    expect(typeof fields.farm_name).toBe("string")
  })

  it("rejects a record whose select value is outside the marketplace options", () => {
    const result = buildPopulation([row({ ...valid, country: "Kazakhstan" })], {
      targetSchema: PRODUCER_SCHEMA,
      secret: SECRET,
      scope: "job-1234abcd",
    })
    expect(result.stats.exported).toBe(0)
    expect(result.rejected[0].reasons.join(" ")).toMatch(/country/)
  })

  it("rejects a record missing a required field", () => {
    const { farm_name, ...withoutName } = valid
    const result = buildPopulation([row(withoutName)], {
      targetSchema: PRODUCER_SCHEMA,
      secret: SECRET,
      scope: "job-1234abcd",
    })
    expect(result.stats.exported).toBe(0)
    expect(result.rejected[0].reasons.join(" ")).toMatch(/farm_name.*required/)
  })

  it("keeps invalid records when strict mode is disabled", () => {
    const result = buildPopulation([row({ ...valid, country: "Kazakhstan" })], {
      targetSchema: PRODUCER_SCHEMA,
      secret: SECRET,
      scope: "job-1234abcd",
      strict: false,
    })
    expect(result.stats.exported).toBe(1)
    expect(result.issues.some(i => i.severity === "error")).toBe(true)
  })

  it("drops asset fields whose values are storage URLs", () => {
    const result = buildPopulation(
      [row({ ...valid, "farm image": "https://s3.example/img.png" })],
      {
        targetSchema: PRODUCER_SCHEMA,
        secret: SECRET,
        scope: "job-1234abcd",
        sourceFields: [{ name: "farm image", type: "image" }],
      },
    )
    expect(Object.keys(result.file.records[0].fields)).not.toContain("farm image")
  })

  it("applies a rename map onto target field names", () => {
    const result = buildPopulation(
      [row({ name_of_farm: "North Ridge Farms", country: "Canada", primary_crops: "Wheat" })],
      {
        targetSchema: PRODUCER_SCHEMA,
        secret: SECRET,
        scope: "job-1234abcd",
        fieldMap: { name_of_farm: "farm_name" },
      },
    )
    expect(result.file.records[0].fields.farm_name).toBe("North Ridge Farms")
  })

  it("derives deterministic external ids so re-import upserts in place", () => {
    const build = () =>
      buildPopulation([row(valid, 7)], { targetSchema: PRODUCER_SCHEMA, secret: SECRET, scope: "job-1234abcd" })
    expect(build().file.records[0].external_id).toBe(build().file.records[0].external_id)
    expect(build().file.records[0].external_id).toBe("cs-job1234a-000007")
  })

  it("rejects a duplicate external_id that would silently overwrite an earlier record", () => {
    const result = buildPopulation([row(valid, 0), row(valid, 1)], {
      targetSchema: PRODUCER_SCHEMA,
      secret: SECRET,
      scope: "job-1234abcd",
      externalIdField: "farm_name",
    })
    expect(result.stats.exported).toBe(1)
    expect(result.rejected[0].reasons.join(" ")).toMatch(/not unique/)
  })

  it("emits no watermark in production mode, for the clean cutover", () => {
    const result = buildPopulation([row(valid)], {
      targetSchema: PRODUCER_SCHEMA,
      scope: "job-1234abcd",
      mode: "production",
    })
    expect(result.file.mode).toBe("production")
    expect(isWatermarked(result.file.records[0])).toBe(false)
  })

  it("passes fields through when no target schema is supplied", () => {
    const result = buildPopulation([row(valid)], {
      participantType: "producer",
      secret: SECRET,
      scope: "job-1234abcd",
    })
    expect(result.file.records[0].fields.primary_crops).toBe("Wheat, Barley")
  })

  it("refuses to build without a participant type", () => {
    expect(() => buildPopulation([row(valid)], { secret: SECRET })).toThrow(/participant_type/i)
  })
})

describe("buildExternalId", () => {
  it("uses a record field when asked", () => {
    expect(buildExternalId({ id: "FARM 42" }, 0, { externalIdField: "id" })).toBe("cs-FARM-42")
  })

  it("falls back to the index form when the id field is blank", () => {
    expect(buildExternalId({ id: "  " }, 3, { externalIdField: "id", scope: "job-1234abcd" })).toBe(
      "cs-job1234a-000003",
    )
  })
})

describe("parseTargetSchema", () => {
  it("parses the descriptor Cosolvent publishes", () => {
    const parsed = parseTargetSchema(
      JSON.stringify({
        participantType: "producer",
        fields: [{ name: "country", type: "select", required: true, options: ["Canada"] }],
      }),
    )
    expect(parsed.participantType).toBe("producer")
    expect(parsed.fields[0].options).toEqual(["Canada"])
  })

  it("rejects a descriptor that is missing its fields", () => {
    expect(() => parseTargetSchema({ participantType: "producer" })).toThrow(/fields/)
  })
})

// ─── Export route ────────────────────────────────────────────────────────────

describe("POST /api/exports/create (format: population)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.SYNTHETIC_WATERMARK_SECRET = SECRET
    mockGetCurrentUser.mockResolvedValue(mockUser())
    mockHasTenantAccess.mockResolvedValue(true)
  })

  function wireQueries(records: Array<{ record_data: any; record_index: number }>) {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM jobs") && sql.includes("tenant_id")) {
        return Promise.resolve({ rows: [{ id: TEST_IDS.JOB, tenant_id: TEST_IDS.TENANT, name: "Job", status: "completed" }] })
      }
      if (sql.includes("COUNT(*)")) return Promise.resolve({ rows: [{ count: records.length }] })
      if (sql.includes("INSERT INTO exports")) {
        return Promise.resolve({ rows: [{ id: TEST_IDS.EXPORT, job_id: TEST_IDS.JOB, format: "population" }] })
      }
      if (sql.includes("FROM jobs j")) {
        return Promise.resolve({
          rows: [{
            id: TEST_IDS.JOB,
            name: "Job",
            schema_id: TEST_IDS.SCHEMA,
            participant_type: "producer",
            schema_definition: { fields: [{ name: "farm image", type: "image" }] },
          }],
        })
      }
      if (sql.includes("FROM generated_data")) return Promise.resolve({ rows: records })
      return Promise.resolve({ rows: [] })
    })
  }

  it("returns a watermarked population file and its stats", async () => {
    wireQueries([
      { record_data: { farm_name: "North Ridge", country: "Canada", primary_crops: "Wheat" }, record_index: 0 },
    ])

    const request = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: { job_id: TEST_IDS.JOB, name: "pop", format: "population" },
    })
    const { status, body } = await parseResponse(await createExportRoute(request))

    expect(status).toBe(200)
    expect(body.populationStats.exported).toBe(1)

    const json = Buffer.from(body.export.file_url.split(",")[1], "base64").toString("utf8")
    const file = JSON.parse(json)
    expect(file.participant_type).toBe("producer")
    expect(verify(file.records[0], SECRET)).toBe(true)
  })

  it("fails with the rejection reasons when nothing passes the validity gate", async () => {
    wireQueries([{ record_data: { farm_name: "", country: "" }, record_index: 0 }])

    const request = createNextRequest("POST", "http://localhost:3000/api/exports/create", {
      body: {
        job_id: TEST_IDS.JOB,
        name: "pop",
        format: "population",
        filters: { targetSchema: PRODUCER_SCHEMA },
      },
    })
    const { status, body } = await parseResponse(await createExportRoute(request))

    expect(status).toBe(500)
    expect(body.error).toMatch(/validity gate/i)
  })
})
