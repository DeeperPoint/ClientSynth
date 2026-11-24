/**
 * The generation contract compiled out of the wiki.
 *
 * The permitted values, domain rules and example values a population is
 * generated against are domain knowledge. They lived in code and in a
 * hand-populated `example_data` table, while the knowledge they encode lived in
 * the wiki — so the two drifted, and the drift surfaced as a synthetic
 * population contradicting the reference library the same system answers
 * questions from.
 *
 * `wiki_compile.py` in CommonContext emits this; this module reads it.
 *
 * THE GATE RUNS BOTH WAYS
 *
 * The compiler refuses to emit a rule type the generator does not implement.
 * That is only half the guarantee: a contract compiled by a newer CommonContext
 * can name a category this build has never heard of, and the compiler is in a
 * different repository on a different release cadence, so this will happen.
 * Accepting such a rule would reproduce exactly the failure the gate exists to
 * prevent — documented, accepted, silently unenforced — just from the other
 * direction. So loading validates against the categories implemented HERE.
 */

import type { SeedRule, RuleType } from "../types/schema-extensions"

/** The rule categories this build's RuleValidator actually interprets. */
export const IMPLEMENTED_RULE_TYPES: RuleType[] = [
  "dependency",
  "exclusion",
  "conditional_enum",
  "range_constraint",
]

export interface ContractExample {
  value: unknown
  source?: string
}

export interface VocabularyTerm {
  field: string
  preferred_label: string
  alternative_labels?: string[]
  broader?: string[]
  narrower?: string[]
  source_page?: string
}

export interface PersonaAxis {
  axis: string
  values: string[]
  field?: string
  source_page?: string
}

export interface GenerationContract {
  contract_version: string
  vertical: string
  compiled_at?: string
  supported_rule_types?: string[]
  permitted_values: Record<string, string[]>
  vocabulary: Record<string, VocabularyTerm[]>
  synonyms: Record<string, string[]>
  seed_rules: Array<SeedRule & { source_page?: string }>
  examples: Record<string, ContractExample[]>
  persona_axes: PersonaAxis[]
}

export interface ContractLoadResult {
  contract: GenerationContract | null
  errors: string[]
  /** Rules dropped because this build cannot enforce them, with the reason. */
  rejected: Array<{ id: string; type: string; reason: string }>
}

const EMPTY: GenerationContract = {
  contract_version: "0",
  vertical: "",
  permitted_values: {},
  vocabulary: {},
  synonyms: {},
  seed_rules: [],
  examples: {},
  persona_axes: [],
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as any) : {}
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * Parse and validate a contract.
 *
 * Returns the usable parts alongside the problems rather than throwing: one
 * malformed rule page should not cost a generation run its whole vocabulary.
 * A rule this build cannot enforce is rejected loudly and listed, so the caller
 * can surface it instead of discovering it as records that break a constraint.
 */
export function loadGenerationContract(raw: unknown): ContractLoadResult {
  const errors: string[] = []
  const rejected: Array<{ id: string; type: string; reason: string }> = []

  const source = asRecord(raw)
  if (!source.contract_version) {
    return { contract: null, errors: ["not a generation contract: no contract_version"], rejected }
  }

  const seedRules: Array<SeedRule & { source_page?: string }> = []
  for (const entry of asArray<any>(source.seed_rules)) {
    const id = String(entry?.id ?? "(unnamed)")
    const type = String(entry?.type ?? "")

    if (!IMPLEMENTED_RULE_TYPES.includes(type as RuleType)) {
      rejected.push({
        id,
        type,
        reason:
          `this build does not implement rule type "${type}" ` +
          `(implemented: ${IMPLEMENTED_RULE_TYPES.join(", ")}). ` +
          `Accepting it would mean a documented constraint that is never enforced.`,
      })
      continue
    }
    if (!entry.sourceField || !Array.isArray(entry.targetFields) || entry.targetFields.length === 0) {
      errors.push(`rule "${id}" is missing sourceField or targetFields`)
      continue
    }
    if (!entry.config || typeof entry.config !== "object") {
      errors.push(`rule "${id}" has no config`)
      continue
    }
    seedRules.push(entry as SeedRule)
  }

  const contract: GenerationContract = {
    ...EMPTY,
    contract_version: String(source.contract_version),
    vertical: String(source.vertical ?? ""),
    compiled_at: source.compiled_at ? String(source.compiled_at) : undefined,
    supported_rule_types: asArray<string>(source.supported_rule_types),
    permitted_values: asRecord(source.permitted_values),
    vocabulary: asRecord(source.vocabulary),
    synonyms: asRecord(source.synonyms),
    seed_rules: seedRules,
    examples: asRecord(source.examples),
    persona_axes: asArray<PersonaAxis>(source.persona_axes),
  }

  return { contract, errors, rejected }
}

/** Example values for one field, in the shape the generator's prompt wants. */
export function examplesFor(contract: GenerationContract | null, field: string): string[] {
  if (!contract) return []
  return (contract.examples?.[field] ?? [])
    .map((e) => (e && typeof e === "object" ? e.value : e))
    .filter((v) => v !== undefined && v !== null)
    .map((v) => String(v))
}

/** Permitted values for one field, or null when the contract does not constrain it. */
export function permittedValuesFor(
  contract: GenerationContract | null,
  field: string
): string[] | null {
  const values = contract?.permitted_values?.[field]
  return Array.isArray(values) && values.length > 0 ? values : null
}

/**
 * Query terms for a field value, the preferred label plus its alternatives.
 *
 * §6.2: an exact-term corpus is precisely where asking for a thing by its other
 * name returns nothing, so the alternatives are what make lexical retrieval
 * reach the chunk.
 */
export function expandSynonyms(contract: GenerationContract | null, term: string): string[] {
  if (!contract) return [term]
  const direct = contract.synonyms?.[term]
  if (Array.isArray(direct) && direct.length) return [term, ...direct]

  // Also accept an alternative label as the way in, so a query written with the
  // informal name still reaches the preferred one.
  for (const [preferred, alternatives] of Object.entries(contract.synonyms ?? {})) {
    if (Array.isArray(alternatives) && alternatives.some((a) => a.toLowerCase() === term.toLowerCase())) {
      return [term, preferred, ...alternatives.filter((a) => a.toLowerCase() !== term.toLowerCase())]
    }
  }
  return [term]
}

export interface SchemaLikeField {
  name: string
  options?: string[]
  [key: string]: any
}

export interface SchemaLikeDefinition {
  fields?: SchemaLikeField[]
  seed_rules?: SeedRule[]
  [key: string]: any
}

/**
 * Merge a contract into a schema definition, without discarding what is there.
 *
 * Options INTERSECT rather than replace where a field already declares them.
 * Replacing would let the contract silently widen a field the schema had
 * deliberately narrowed; and a field whose options the contract does not mention
 * is left exactly as it was, so adopting a contract is additive.
 *
 * An empty intersection is reported rather than written: handing the generator
 * zero options for a field it must fill produces a run that fails per record for
 * a reason no message explains.
 */
export function applyContract(
  definition: SchemaLikeDefinition,
  contract: GenerationContract | null
): { definition: SchemaLikeDefinition; warnings: string[] } {
  if (!contract) return { definition, warnings: [] }

  const warnings: string[] = []
  const fields = (definition.fields ?? []).map((field) => {
    const permitted = permittedValuesFor(contract, field.name)
    if (!permitted) return field

    if (!Array.isArray(field.options) || field.options.length === 0) {
      return { ...field, options: [...permitted] }
    }

    const intersection = field.options.filter((o) => permitted.includes(o))
    if (intersection.length === 0) {
      warnings.push(
        `field "${field.name}": the contract's vocabulary and the schema's options have ` +
          `nothing in common, so the schema's options are kept. ` +
          `Schema: [${field.options.join(", ")}]. Contract: [${permitted.join(", ")}].`
      )
      return field
    }
    return { ...field, options: intersection }
  })

  // Contract rules are appended. An id already present in the definition keeps
  // the definition's version: a locally pinned rule beats a compiled one, and
  // silently swapping it would make the override look as if it had been applied.
  const existingIds = new Set((definition.seed_rules ?? []).map((r) => r.id))
  const added = contract.seed_rules.filter((r) => !existingIds.has(r.id))
  for (const rule of contract.seed_rules) {
    if (existingIds.has(rule.id)) {
      warnings.push(`rule "${rule.id}" is defined locally; the contract's version was not applied.`)
    }
  }

  return {
    definition: { ...definition, fields, seed_rules: [...(definition.seed_rules ?? []), ...added] },
    warnings,
  }
}
