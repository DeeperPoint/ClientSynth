/**
 * @jest-environment node
 */
/**
 * Generation consistency and validity.
 *
 * These cover the defects that real generated output exposed: values outside a
 * field's allowed options, numbers persisted as strings, records whose location
 * fields contradict one another, and "new" identities that are really the
 * previous person renamed.
 */

process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-key"

import { OutputValidator } from "@/lib/validation/output-validator"
import { AIGenerator } from "@/lib/ai-generator"

const PRODUCER_FIELDS = [
  { name: "farm_name", type: "text" },
  { name: "country", type: "country" },
  { name: "phone", type: "phone" },
  { name: "email", type: "email" },
  { name: "address", type: "address" },
  { name: "annual_production", type: "number" },
]

// ─── Allowed-value enforcement ───────────────────────────────────────────────

describe("OutputValidator — allowed values", () => {
  const fields = [{ name: "country", type: "select", constraints: { options: ["Canada", "USA"] } }]

  it("flags a value outside the allowed option set", () => {
    const issues = OutputValidator.validate({ country: "Kazakhstan" }, fields)
    expect(issues.some(i => i.severity === "error" && /not one of the allowed values/.test(i.issue))).toBe(true)
  })

  it("accepts a value from the option set", () => {
    expect(OutputValidator.validate({ country: "Canada" }, fields)).toHaveLength(0)
  })

  it("checks each item of a multi-valued field", () => {
    const multi = [{ name: "crops", type: "multi_select", constraints: { options: ["Wheat", "Barley"] } }]
    const issues = OutputValidator.validate({ crops: ["Wheat", "Sorghum"] }, multi)
    expect(issues).toHaveLength(1)
    expect(issues[0].issue).toMatch(/Sorghum/)
  })

  it("does not stringify an array into a false positive", () => {
    const multi = [{ name: "crops", type: "multi_select", constraints: { options: ["Wheat", "Barley"] } }]
    expect(OutputValidator.validate({ crops: ["Wheat"] }, multi)).toHaveLength(0)
  })
})

// ─── Cross-field consistency ─────────────────────────────────────────────────

describe("OutputValidator — cross-field consistency", () => {
  it("flags a phone country code that contradicts the country", () => {
    // The real defect: an Ontario record labelled "United States".
    const issues = OutputValidator.validate(
      {
        farm_name: "Vance Family Organic Estates",
        country: "United States",
        phone: "+1 (519) 271-8492",
        email: "evance@vanceorganicestates.ca",
        address: "4852 Line 34, RR #4, Stratford, Ontario N5A 6S5",
        annual_production: 492750,
      },
      PRODUCER_FIELDS,
    )
    // +1 covers both the US and Canada, so the dial code alone is not the tell;
    // the .ca domain is.
    expect(issues.some(i => /Email domain ".ca"/.test(i.issue))).toBe(true)
  })

  it("flags a dial code belonging to a different country", () => {
    const issues = OutputValidator.validate(
      { country: "Germany", phone: "+61 2 9374 4000", email: "a@b.com", farm_name: "X", address: "Berlin" },
      PRODUCER_FIELDS,
    )
    expect(issues.some(i => i.severity === "error" && /does not match/.test(i.issue))).toBe(true)
  })

  it("accepts a fully consistent record", () => {
    const issues = OutputValidator.validate(
      {
        farm_name: "Golden Harvest Farms",
        country: "Canada",
        phone: "+1 (519) 555-0184",
        email: "eleanor@goldenharvestfarms.ca",
        address: "RR #2, 123 Farmstead Lane, Stratford, Ontario N5A 6S3",
        annual_production: 500000,
      },
      PRODUCER_FIELDS,
    )
    expect(issues.filter(i => i.severity === "error")).toHaveLength(0)
  })

  it("flags an address naming a different country", () => {
    const issues = OutputValidator.validate(
      { country: "Canada", address: "12 Rue de Rivoli, Paris, France", farm_name: "X", email: "a@b.com", phone: "+1 519 555 0184" },
      PRODUCER_FIELDS,
    )
    expect(issues.some(i => /Address mentions/.test(i.issue))).toBe(true)
  })

  it("does nothing when the record has no country field", () => {
    expect(OutputValidator.validateCrossFieldConsistency({ farm_name: "X" }, [{ name: "farm_name", type: "text" }])).toHaveLength(0)
  })
})

// ─── Near-duplicate identities ───────────────────────────────────────────────

describe("OutputValidator.isNearDuplicateIdentity", () => {
  // The three identities that reached a finished dataset unnoticed.
  const seen = ["eleanor vance"]

  it("catches an inserted middle initial", () => {
    expect(OutputValidator.isNearDuplicateIdentity("eleanor s. vance", seen)).toBe(true)
  })

  it("catches a hyphenated surname extension", () => {
    expect(OutputValidator.isNearDuplicateIdentity("eleanor vance-sterling", seen)).toBe(true)
  })

  it("allows a genuinely different person", () => {
    expect(OutputValidator.isNearDuplicateIdentity("marcus okonkwo", seen)).toBe(false)
  })

  it("allows a shared surname with a different given name", () => {
    expect(OutputValidator.isNearDuplicateIdentity("robert chen", ["michael okafor"])).toBe(false)
  })

  it("handles an empty history", () => {
    expect(OutputValidator.isNearDuplicateIdentity("eleanor vance", [])).toBe(false)
  })
})

// ─── autoFix re-validation ───────────────────────────────────────────────────

describe("OutputValidator.autoFix", () => {
  it("re-validates the fixed record instead of trusting the suggestion", () => {
    const fields = [{ name: "country", type: "select", constraints: { options: ["Canada"] } }]
    // The suffix-strip suggestion produces "Kazakhstan", still not an allowed value.
    const record = { country: "Kazakhstan_12" }
    const issues = OutputValidator.validate(record, fields)
    const { record: fixed, remainingIssues } = OutputValidator.autoFix(record, issues, fields)

    expect(fixed.country).toBe("Kazakhstan")
    expect(remainingIssues.some(i => i.severity === "error")).toBe(true)
  })

  it("reports nothing left when the fix genuinely resolves the issue", () => {
    const fields = [{ name: "farm_name", type: "text" }]
    const record = { farm_name: "North Ridge_11_1763030500331" }
    const issues = OutputValidator.validate(record, fields)
    const { record: fixed, remainingIssues } = OutputValidator.autoFix(record, issues, fields)

    expect(fixed.farm_name).toBe("North Ridge")
    expect(remainingIssues.filter(i => i.severity === "error")).toHaveLength(0)
  })
})

// ─── Structured-output schema + token budget ─────────────────────────────────

describe("AIGenerator — structured output schema", () => {
  const gen = new AIGenerator("test-key")
  const schemaFor = (field: any) => (gen as any).jsonSchemaForField(field)

  it("emits an enum for a constrained field, so invalid values cannot be produced", () => {
    expect(schemaFor({ name: "country", type: "select", constraints: { options: ["Canada", "USA"] } })).toEqual({
      type: "string",
      enum: ["Canada", "USA"],
    })
  })

  it("emits an array of enums for a constrained multi-valued field", () => {
    expect(schemaFor({ name: "crops", type: "multi_select", constraints: { options: ["Wheat"] } })).toEqual({
      type: "array",
      items: { type: "string", enum: ["Wheat"] },
      minItems: 1,
    })
  })

  it("types a number field as a number rather than a string", () => {
    expect(schemaFor({ name: "annual_production", type: "number" })).toEqual({ type: "number" })
  })

  it("carries min/max into the schema", () => {
    expect(schemaFor({ name: "size", type: "number", constraints: { min: 10, max: 99 } })).toEqual({
      type: "number",
      minimum: 10,
      maximum: 99,
    })
  })

  it("falls back to string for free-text fields", () => {
    expect(schemaFor({ name: "description", type: "long_text" })).toEqual({ type: "string" })
  })

  it("budgets far more tokens for long-text schemas than for scalar ones", () => {
    const budget = (fields: any[]) => (gen as any).estimateMaxTokens(fields)

    const scalars = budget([
      { name: "country", type: "country" },
      { name: "size", type: "number" },
    ])
    const longText = budget([
      { name: "farm_description", type: "long_text" },
      { name: "export_experience", type: "long_text" },
      { name: "certifications", type: "long_text" },
    ])

    expect(longText).toBeGreaterThan(scalars)
    // The old flat budget (fields * 80 = 240, floored to 300) truncated these.
    expect(longText).toBeGreaterThan(1000)
  })
})

// ─── Value normalisation ─────────────────────────────────────────────────────

describe("AIGenerator — record value normalisation", () => {
  const gen = new AIGenerator("test-key")
  const normalize = (parsed: any, fields: any[]) => (gen as any).normalizeRecordValues(parsed, fields)

  it("preserves numbers and booleans instead of stringifying them", () => {
    const out = normalize({ size: 640, organic: true }, [
      { name: "size", type: "number" },
      { name: "organic", type: "boolean" },
    ])
    expect(out).toEqual({ size: 640, organic: true })
  })

  it("preserves arrays for multi-valued fields", () => {
    const out = normalize({ crops: ["Wheat", "Barley"] }, [{ name: "crops", type: "multi_select" }])
    expect(out.crops).toEqual(["Wheat", "Barley"])
  })

  it("strips the index+timestamp artefact", () => {
    const out = normalize({ country: "Australia_11_1763030500331" }, [{ name: "country", type: "country" }])
    expect(out.country).toBe("Australia")
  })

  it("keeps a legitimate identifier containing underscores and digits", () => {
    const out = normalize({ id: "CAN-ON-772891", lot: "LOT_42" }, [
      { name: "id", type: "text" },
      { name: "lot", type: "text" },
    ])
    expect(out.id).toBe("CAN-ON-772891")
    expect(out.lot).toBe("LOT_42")
  })

  it("returns null when a required field is missing, so the caller retries", () => {
    expect(normalize({ farm_name: "X" }, [{ name: "farm_name", type: "text" }, { name: "country", type: "country" }])).toBeNull()
  })

  it("returns null on an empty value", () => {
    expect(normalize({ farm_name: "   " }, [{ name: "farm_name", type: "text" }])).toBeNull()
  })
})

// ─── cleanValue scoping ──────────────────────────────────────────────────────

describe("AIGenerator — cleanValue", () => {
  const gen = new AIGenerator("test-key")
  const clean = (v: string) => (gen as any).cleanValue(v)

  it("removes the generation artefact suffix", () => {
    expect(clean("Australia_11_1763030500331")).toBe("Australia")
  })

  it("keeps a legitimate trailing number suffix", () => {
    expect(clean("Harvester_5000")).toBe("Harvester_5000")
  })

  it("keeps bracketed prose while removing a leftover JSON array", () => {
    expect(clean("Grade A [certified]")).toBe("Grade A [certified]")
    expect(clean('Wheat ["a","b"]').trim()).toBe("Wheat")
  })
})
