/**
 * Turn a Cosolvent profile schema into ClientSynth generation fields.
 *
 * This closes the integration loop. Cosolvent publishes the schema, ClientSynth
 * generates *against* it, and the population export ships records that were
 * valid by construction rather than filtered after the fact.
 *
 * Without this step the generator has no idea a field is restricted, so it
 * invents plausible values ("Kazakhstan", "Netherlands") for a marketplace that
 * only accepts "Canada" or "USA" — every one of which is rejected downstream.
 */

import type { TargetField, TargetSchema } from "./types"

export interface AlignedField {
  name: string
  type: string
  description?: string
  required: boolean
  constraints?: {
    options?: string[]
    min?: number
    max?: number
  }
}

/** Cosolvent field type -> the ClientSynth generation type that best matches it. */
function generationTypeFor(field: TargetField): string {
  switch ((field.type || "text").toLowerCase()) {
    case "rich_text":
      return "long_text"
    case "number":
      return "number"
    case "date":
      return "date"
    case "select":
      // A restricted select is driven by its options; an open one is free text.
      return field.options && field.options.length > 0 ? "select" : "text"
    case "multi_select":
      return "multi_select"
    case "location":
      return "address"
    default:
      return "text"
  }
}

/**
 * Build the generation field list for a target profile schema.
 *
 * Asset fields (file / files) are skipped: they are uploaded in Cosolvent, not
 * generated here, and carry no value in a population record.
 */
export function alignFieldsToTargetSchema(schema: TargetSchema): AlignedField[] {
  return schema.fields
    .filter(f => !["file", "files", "image", "images", "pdf"].includes((f.type || "").toLowerCase()))
    .map(field => {
      const aligned: AlignedField = {
        name: field.name,
        type: generationTypeFor(field),
        required: !!field.required,
        description: describeField(field),
      }
      if (field.options && field.options.length > 0) {
        aligned.constraints = { options: [...field.options] }
      }
      return aligned
    })
}

function describeField(field: TargetField): string {
  const base = `The ${field.name.replace(/_/g, " ")} of this ${"participant"}`
  if (field.options && field.options.length > 0) {
    return `${base}. Must be chosen from: ${field.options.join(", ")}.`
  }
  if ((field.type || "").toLowerCase() === "number") {
    return `${base}, as a realistic number for the domain.`
  }
  return `${base}.`
}

/** A ClientSynth `schema_definition` aligned to a Cosolvent participant type. */
export function buildAlignedSchemaDefinition(schema: TargetSchema): {
  fields: AlignedField[]
  metadata: { version: string; aligned_to: string; source: string }
} {
  return {
    fields: alignFieldsToTargetSchema(schema),
    metadata: {
      version: "1.0",
      aligned_to: schema.participantType,
      source: "cosolvent:export-profile-schema",
    },
  }
}
