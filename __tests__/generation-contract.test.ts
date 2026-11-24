/**
 * Loading the generation contract compiled out of the wiki.
 *
 * The load-side gate is the point of this file. The compiler refuses to EMIT a
 * rule type the generator cannot apply, but the compiler lives in a different
 * repository on a different release cadence, so a contract naming a category
 * this build has never heard of will arrive eventually. Accepting it would
 * reproduce the failure the gate exists to prevent, from the other side.
 */

import {
  IMPLEMENTED_RULE_TYPES,
  applyContract,
  examplesFor,
  expandSynonyms,
  loadGenerationContract,
  permittedValuesFor,
} from "@/lib/commoncontext/generation-contract"

const CONTRACT = {
  contract_version: "1.0",
  vertical: "manufacturing",
  compiled_at: "2026-11-24",
  supported_rule_types: IMPLEMENTED_RULE_TYPES,
  permitted_values: { processes: ["milling", "turning"], materials: ["Inconel 718"] },
  vocabulary: {
    processes: [
      {
        field: "processes",
        preferred_label: "3-axis milling",
        alternative_labels: ["3 axis mill", "vertical milling"],
      },
    ],
  },
  synonyms: { "3-axis milling": ["3 axis mill", "vertical milling"] },
  seed_rules: [
    {
      id: "certs",
      type: "conditional_enum",
      sourceField: "headcount",
      targetFields: ["certifications"],
      config: { conditions: [{ when: { gt: 500 }, allow: ["AS9100D"] }] },
    },
  ],
  examples: { lead_time_days: [{ value: 21, source: "source_cgc" }, { value: 35 }] },
  persona_axes: [{ axis: "scale", values: ["small", "mid"], field: "headcount" }],
}

// ── Loading ──────────────────────────────────────────────────────────────────
describe("loadGenerationContract", () => {
  it("loads a well-formed contract", () => {
    const { contract, errors, rejected } = loadGenerationContract(CONTRACT)
    expect(errors).toEqual([])
    expect(rejected).toEqual([])
    expect(contract?.vertical).toBe("manufacturing")
    expect(contract?.seed_rules).toHaveLength(1)
  })

  it("refuses something that is not a contract", () => {
    expect(loadGenerationContract({ hello: "world" }).contract).toBeNull()
    expect(loadGenerationContract(null).contract).toBeNull()
  })

  it("rejects a rule type this build does not implement", () => {
    const newer = {
      ...CONTRACT,
      seed_rules: [
        ...CONTRACT.seed_rules,
        { id: "future", type: "temporal_window", sourceField: "a", targetFields: ["b"], config: { x: 1 } },
      ],
    }
    const { contract, rejected } = loadGenerationContract(newer)

    expect(rejected).toHaveLength(1)
    expect(rejected[0].id).toBe("future")
    expect(rejected[0].reason).toContain("never enforced")
    expect(contract?.seed_rules.map((r) => r.id)).toEqual(["certs"])
  })

  it("keeps the rules it can enforce when one is rejected", () => {
    // One unknown category must not cost the run every other rule.
    const mixed = {
      ...CONTRACT,
      seed_rules: [
        { id: "future", type: "nope", sourceField: "a", targetFields: ["b"], config: { x: 1 } },
        ...CONTRACT.seed_rules,
      ],
    }
    expect(loadGenerationContract(mixed).contract?.seed_rules).toHaveLength(1)
  })

  it("reports a malformed rule without discarding the vocabulary", () => {
    // One bad rule page should not cost a generation run its whole vocabulary.
    const broken = {
      ...CONTRACT,
      seed_rules: [{ id: "bad", type: "dependency", config: {} }],
    }
    const { contract, errors } = loadGenerationContract(broken)
    expect(errors).toHaveLength(1)
    expect(contract?.permitted_values.processes).toEqual(["milling", "turning"])
  })

  it("every implemented rule type loads", () => {
    for (const type of IMPLEMENTED_RULE_TYPES) {
      const one = {
        ...CONTRACT,
        seed_rules: [{ id: type, type, sourceField: "a", targetFields: ["b"], config: { x: 1 } }],
      }
      expect(loadGenerationContract(one).rejected).toEqual([])
    }
  })
})

// ── Accessors ────────────────────────────────────────────────────────────────
describe("accessors", () => {
  const { contract } = loadGenerationContract(CONTRACT)

  it("returns examples as strings for the prompt", () => {
    expect(examplesFor(contract, "lead_time_days")).toEqual(["21", "35"])
  })

  it("returns an empty list for a field with no examples", () => {
    expect(examplesFor(contract, "nothing")).toEqual([])
  })

  it("returns permitted values, or null when unconstrained", () => {
    expect(permittedValuesFor(contract, "processes")).toEqual(["milling", "turning"])
    expect(permittedValuesFor(contract, "unconstrained")).toBeNull()
  })

  it("expands a preferred label to its alternatives", () => {
    expect(expandSynonyms(contract, "3-axis milling")).toEqual([
      "3-axis milling",
      "3 axis mill",
      "vertical milling",
    ])
  })

  it("expands from an alternative label back to the preferred one", () => {
    // A query written with the informal name must still reach the chunk.
    const expanded = expandSynonyms(contract, "3 axis mill")
    expect(expanded).toContain("3-axis milling")
    expect(expanded).toContain("vertical milling")
  })

  it("leaves an unknown term alone", () => {
    expect(expandSynonyms(contract, "welding")).toEqual(["welding"])
  })
})

// ── Merging ──────────────────────────────────────────────────────────────────
describe("applyContract", () => {
  const { contract } = loadGenerationContract(CONTRACT)

  it("fills options for a field that declares none", () => {
    const { definition } = applyContract({ fields: [{ name: "processes" }] }, contract)
    expect(definition.fields?.[0].options).toEqual(["milling", "turning"])
  })

  it("intersects rather than replaces existing options", () => {
    // Replacing would let the contract silently widen a field the schema had
    // deliberately narrowed.
    const { definition } = applyContract(
      { fields: [{ name: "processes", options: ["milling", "grinding"] }] },
      contract
    )
    expect(definition.fields?.[0].options).toEqual(["milling"])
  })

  it("leaves a field the contract does not mention untouched", () => {
    const { definition } = applyContract(
      { fields: [{ name: "other", options: ["a", "b"] }] },
      contract
    )
    expect(definition.fields?.[0].options).toEqual(["a", "b"])
  })

  it("keeps the schema's options and warns when the intersection is empty", () => {
    // Handing the generator zero options for a field it must fill produces a run
    // that fails per record for a reason no message explains.
    const { definition, warnings } = applyContract(
      { fields: [{ name: "processes", options: ["welding"] }] },
      contract
    )
    expect(definition.fields?.[0].options).toEqual(["welding"])
    expect(warnings[0]).toContain("nothing in common")
  })

  it("appends contract rules", () => {
    const { definition } = applyContract({ fields: [], seed_rules: [] }, contract)
    expect(definition.seed_rules).toHaveLength(1)
  })

  it("a locally defined rule wins over the contract's version of it", () => {
    // Silently swapping it would make the local override look as if it had been
    // applied when it had been replaced.
    const local = {
      id: "certs",
      type: "exclusion" as const,
      sourceField: "x",
      targetFields: ["y"],
      config: { a: ["b"] },
    }
    const { definition, warnings } = applyContract({ fields: [], seed_rules: [local] }, contract)
    expect(definition.seed_rules).toHaveLength(1)
    expect(definition.seed_rules?.[0].type).toBe("exclusion")
    expect(warnings[0]).toContain("defined locally")
  })

  it("is a no-op without a contract", () => {
    const original = { fields: [{ name: "a", options: ["x"] }] }
    expect(applyContract(original, null).definition).toBe(original)
  })
})
