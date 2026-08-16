/**
 * @jest-environment node
 */
/**
 * Schema edit round-trip.
 *
 * The schema edit page used to rebuild each field from five properties on both
 * load and save, so opening a *discovered* schema and pressing Save silently
 * destroyed `constraints` (the option sets schema induction infers from example
 * data) and `linkedFieldConfig`, plus the definition's own `metadata`.
 *
 * That mattered beyond the UI: generation turns `constraints.options` into a
 * JSON-schema enum, and the population exporter validates against the same
 * options. Losing them silently reintroduces out-of-vocabulary values that are
 * rejected at the Cosolvent ingest boundary, with no visible cause.
 *
 * These tests pin the transformation the page performs.
 */

interface Field {
  id: string
  name: string
  type: string
  description: string
  required: boolean
  constraints?: { min?: number; max?: number; options?: string[]; format?: string }
  linkedFieldConfig?: any
}

/** The load-side mapping from app/dashboard/schemas/[id]/edit/page.tsx */
function loadFields(rawFields: any[]): Field[] {
  const fieldsWithIds = rawFields.map((f: any, index: number) => ({
    ...f,
    id: f.id || `field-generated-${index}`,
    name: f.name || "",
    type: f.type || "text",
    description: f.description || "",
    required: f.required || false,
  }))
  return fieldsWithIds.map(f => ({ ...f }))
}

/** The save-side mapping from the same page. */
function buildSchemaDefinition(existingDefinition: any, currentFields: Field[]) {
  return {
    ...(existingDefinition || {}),
    fields: currentFields.map(f => ({
      ...f,
      id: f.id || "field-generated",
      name: f.name.trim(),
      type: f.type,
      description: f.description || "",
      required: f.required || false,
    })),
  }
}

const DISCOVERED_DEFINITION = {
  fields: [
    {
      id: "field_1",
      name: "country",
      type: "select",
      description: "Country of operation",
      required: true,
      constraints: { options: ["Canada", "USA"] },
    },
    {
      id: "field_2",
      name: "annual_production",
      type: "number",
      description: "Annual output",
      required: false,
      constraints: { min: 1000, max: 5000000 },
    },
    {
      id: "field_3",
      name: "region",
      type: "text",
      description: "Region",
      required: false,
      linkedFieldConfig: { dependsOn: "country", strict: true },
    },
  ],
  metadata: { version: "1.0", created_at: "2026-01-01T00:00:00.000Z", source: "discovery" },
}

describe("schema edit round-trip", () => {
  it("preserves discovered option constraints through load and save", () => {
    const loaded = loadFields(DISCOVERED_DEFINITION.fields)
    const saved = buildSchemaDefinition(DISCOVERED_DEFINITION, loaded)

    expect(saved.fields[0].constraints).toEqual({ options: ["Canada", "USA"] })
  })

  it("preserves numeric constraints", () => {
    const saved = buildSchemaDefinition(DISCOVERED_DEFINITION, loadFields(DISCOVERED_DEFINITION.fields))
    expect(saved.fields[1].constraints).toEqual({ min: 1000, max: 5000000 })
  })

  it("preserves linked field configuration", () => {
    const saved = buildSchemaDefinition(DISCOVERED_DEFINITION, loadFields(DISCOVERED_DEFINITION.fields))
    expect(saved.fields[2].linkedFieldConfig).toEqual({ dependsOn: "country", strict: true })
  })

  it("preserves schema definition metadata", () => {
    const saved = buildSchemaDefinition(DISCOVERED_DEFINITION, loadFields(DISCOVERED_DEFINITION.fields))
    expect(saved.metadata).toEqual(DISCOVERED_DEFINITION.metadata)
  })

  it("still applies the user's edits", () => {
    const loaded = loadFields(DISCOVERED_DEFINITION.fields)
    loaded[0].description = "Updated description"
    loaded[0].required = false

    const saved = buildSchemaDefinition(DISCOVERED_DEFINITION, loaded)

    expect(saved.fields[0].description).toBe("Updated description")
    expect(saved.fields[0].required).toBe(false)
    // ...without collateral damage to the constraints.
    expect(saved.fields[0].constraints).toEqual({ options: ["Canada", "USA"] })
  })

  it("trims field names and fills missing ids", () => {
    const saved = buildSchemaDefinition({ fields: [] }, [
      { id: "", name: "  spaced_name  ", type: "text", description: "", required: false },
    ])
    expect(saved.fields[0].name).toBe("spaced_name")
    expect(saved.fields[0].id).toBeTruthy()
  })

  it("survives repeated edit cycles without eroding the definition", () => {
    let definition: any = DISCOVERED_DEFINITION
    for (let i = 0; i < 3; i++) {
      definition = buildSchemaDefinition(definition, loadFields(definition.fields))
    }
    expect(definition.fields[0].constraints).toEqual({ options: ["Canada", "USA"] })
    expect(definition.fields[2].linkedFieldConfig).toEqual({ dependsOn: "country", strict: true })
    expect(definition.metadata).toEqual(DISCOVERED_DEFINITION.metadata)
  })
})
