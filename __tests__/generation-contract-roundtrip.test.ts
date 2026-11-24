/**
 * The seam between CommonContext and ClientSynth, exercised on a real artefact.
 *
 * The fixture is not hand-written. It is the literal output of
 * `python wiki_compile.py` run over a wiki containing one vocabulary page, two
 * rule pages, one exemplar page and one axis page. Regenerate it with:
 *
 *   python wiki_compile.py --wiki <wiki> --vertical manufacturing \
 *     -o ClientSynth/__tests__/fixtures/generation-contract.json
 *
 * That matters because the two sides are different languages in different
 * repositories on different release cadences. The unit tests on either side
 * check each half against its own idea of the contract; only this one checks
 * that the idea is the same. A field renamed from `source_field` to
 * `sourceField` on one side and not the other passes every other test in both
 * repositories and silently produces a population that obeys no rules.
 */

import fs from "fs"
import path from "path"

import {
  applyContract,
  examplesFor,
  expandSynonyms,
  loadGenerationContract,
} from "@/lib/commoncontext/generation-contract"
import { RuleValidator } from "@/lib/validation/rule-validator"

const raw = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "generation-contract.json"), "utf-8")
)

describe("a contract compiled from the wiki", () => {
  it("loads with nothing rejected and nothing malformed", () => {
    const { contract, errors, rejected } = loadGenerationContract(raw)
    expect(errors).toEqual([])
    expect(rejected).toEqual([])
    expect(contract).not.toBeNull()
  })

  it("carries both rule pages across, in this build's shape", () => {
    const { contract } = loadGenerationContract(raw)
    const ids = contract!.seed_rules.map((r) => r.id).sort()
    expect(ids).toEqual(["certs_by_headcount", "lead_time_range"])
    // camelCase on this side. The compiler emits it directly so there is no
    // adapter between the two vocabularies to drift.
    expect(contract!.seed_rules[0].sourceField).toBeTruthy()
    expect(Array.isArray(contract!.seed_rules[0].targetFields)).toBe(true)
  })

  it("turns a vocabulary page into the field's options", () => {
    const { contract } = loadGenerationContract(raw)
    const { definition } = applyContract({ fields: [{ name: "processes" }] }, contract)
    expect(definition.fields![0].options).toEqual(["3-axis milling"])
  })

  it("turns an exemplar page into the generator's examples", () => {
    const { contract } = loadGenerationContract(raw)
    expect(examplesFor(contract, "lead_time_days")).toEqual(["21", "35", "60"])
  })

  it("turns alternative labels into retrieval synonyms", () => {
    const { contract } = loadGenerationContract(raw)
    expect(expandSynonyms(contract, "3 axis mill")).toContain("3-axis milling")
  })

  it("carries the persona axis", () => {
    const { contract } = loadGenerationContract(raw)
    expect(contract!.persona_axes.map((a) => a.axis)).toContain("scale")
  })
})

describe("the compiled rules enforce against real records", () => {
  const { contract } = loadGenerationContract(raw)
  const { definition } = applyContract({ fields: [], seed_rules: [] }, contract)
  const rules = definition.seed_rules!

  it("catches a small shop claiming a certification only large ones hold", () => {
    const issues = RuleValidator.validate(
      { headcount: 20, certifications: "NADCAP", lead_time_days: 30 },
      rules
    )
    expect(issues.map((i) => i.field)).toContain("certifications")
  })

  it("catches a lead time outside the stated range", () => {
    const issues = RuleValidator.validate(
      { headcount: 600, certifications: "NADCAP", lead_time_days: 900 },
      rules
    )
    expect(issues.map((i) => i.field)).toContain("lead_time_days")
  })

  it("catches a lead time that is not a number at all", () => {
    const issues = RuleValidator.validate(
      { headcount: 600, certifications: "NADCAP", lead_time_days: "about a month" },
      rules
    )
    expect(issues.map((i) => i.field)).toContain("lead_time_days")
  })

  it("passes a record consistent with every rule", () => {
    expect(
      RuleValidator.validate(
        { headcount: 600, certifications: "NADCAP", lead_time_days: 30 },
        rules
      )
    ).toEqual([])
  })
})
