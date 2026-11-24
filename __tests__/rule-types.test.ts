/**
 * conditional_enum and range_constraint.
 *
 * Both were declared in RuleType and interpreted nowhere. A rule of either type
 * reached the generator as the line "Rule (range_constraint): Ensures domain
 * consistency" and was never checked afterwards — so a documented constraint was
 * silently not applied, which is worse than not supporting it, because the
 * schema says it is supported.
 */

import { RuleValidator } from "@/lib/validation/rule-validator"
import {
  matchesCondition,
  resolveAllowed,
  resolveRange,
  toNumber,
} from "@/lib/validation/rule-conditions"
import type { SeedRule } from "@/lib/types/schema-extensions"

// ── Conditions ───────────────────────────────────────────────────────────────
describe("matchesCondition", () => {
  it("matches an exact value across string and number forms", () => {
    expect(matchesCondition(5, { eq: "5" })).toBe(true)
    expect(matchesCondition("5", { eq: 5 })).toBe(true)
  })

  it("matches set membership", () => {
    expect(matchesCondition("Alberta", { in: ["Alberta", "Saskatchewan"] })).toBe(true)
    expect(matchesCondition("Ontario", { in: ["Alberta", "Saskatchewan"] })).toBe(false)
  })

  it("compares numerically", () => {
    expect(matchesCondition(600, { gt: 500 })).toBe(true)
    expect(matchesCondition(500, { gt: 500 })).toBe(false)
    expect(matchesCondition(500, { gte: 500 })).toBe(true)
  })

  it("ANDs its clauses", () => {
    expect(matchesCondition(75, { gte: 50, lte: 100 })).toBe(true)
    expect(matchesCondition(120, { gte: 50, lte: 100 })).toBe(false)
  })

  it("fails a numeric comparison for a non-numeric value rather than skipping it", () => {
    // Skipping is how "about 600" passes a maximum of 500.
    expect(matchesCondition("about 600", { lte: 500 })).toBe(false)
    expect(matchesCondition("about 600", { gt: 500 })).toBe(false)
  })

  it("treats an empty string as absent, not as zero", () => {
    // Number("") is 0 in JavaScript, so a blank field would otherwise satisfy
    // `lt: 10` and pass a constraint nobody checked it against.
    expect(toNumber("")).toBeNull()
    expect(matchesCondition("", { lt: 10 })).toBe(false)
  })

  it("handles presence", () => {
    expect(matchesCondition("x", { exists: true })).toBe(true)
    expect(matchesCondition(null, { exists: false })).toBe(true)
    expect(matchesCondition("  ", { exists: true })).toBe(false)
  })

  it("matches a pattern case-insensitively", () => {
    expect(matchesCondition("AS9100D", { matches: "^as91" })).toBe(true)
  })

  it("does not throw on a malformed pattern", () => {
    expect(matchesCondition("x", { matches: "([" })).toBe(false)
  })

  it("an empty condition matches anything, which is how a default is written", () => {
    expect(matchesCondition("anything", {})).toBe(true)
  })

  it("an absent value cannot satisfy a value-comparing clause", () => {
    expect(matchesCondition(undefined, { eq: "x" })).toBe(false)
    expect(matchesCondition(undefined, { in: ["x"] })).toBe(false)
  })
})

describe("resolveAllowed", () => {
  const config = {
    conditions: [
      { when: { gt: 500 }, allow: ["enterprise"] },
      { when: { gt: 50 }, allow: ["mid"] },
    ],
    default: ["small"],
  }

  it("takes the first matching branch, not the union", () => {
    // Branches are written most-specific-first; unioning would let the general
    // branch widen the narrow one back out.
    expect(resolveAllowed(600, config)).toEqual(["enterprise"])
  })

  it("falls through to a later branch", () => {
    expect(resolveAllowed(100, config)).toEqual(["mid"])
  })

  it("falls back to the default", () => {
    expect(resolveAllowed(10, config)).toEqual(["small"])
  })

  it("returns null when nothing applies and there is no default", () => {
    expect(resolveAllowed(10, { conditions: [{ when: { gt: 500 }, allow: ["x"] }] })).toBeNull()
  })
})

describe("resolveRange", () => {
  it("inherits the unset bound from the rule", () => {
    // "normally 0–100, but at least 50 for members" is one clause, not two.
    const range = resolveRange("member", {
      min: 0,
      max: 100,
      conditions: [{ when: { eq: "member" }, min: 50 }],
    })
    expect(range).toEqual({ min: 50, max: 100, integer: undefined })
  })

  it("returns the base bounds when no branch matches", () => {
    expect(resolveRange("other", { min: 0, max: 100 })).toEqual({
      min: 0,
      max: 100,
      integer: undefined,
    })
  })

  it("returns null for an empty config", () => {
    expect(resolveRange("x", {})).toBeNull()
  })
})

// ── conditional_enum through the validator ───────────────────────────────────
describe("conditional_enum", () => {
  const rule: SeedRule = {
    id: "cert-by-size",
    type: "conditional_enum",
    sourceField: "headcount",
    targetFields: ["certifications"],
    config: {
      conditions: [
        { when: { gt: 500 }, allow: ["AS9100D", "NADCAP", "ISO 9001:2015"] },
        { when: { gt: 0 }, allow: ["ISO 9001:2015"] },
      ],
    },
  }

  it("accepts a value the matching branch allows", () => {
    expect(RuleValidator.validate({ headcount: 600, certifications: "NADCAP" }, [rule])).toEqual([])
  })

  it("rejects a value the matching branch does not allow", () => {
    const issues = RuleValidator.validate({ headcount: 20, certifications: "NADCAP" }, [rule])
    expect(issues).toHaveLength(1)
    expect(issues[0].field).toBe("certifications")
    expect(issues[0].severity).toBe("error")
  })

  it("names the branch that was broken, not the raw source value", () => {
    // "when headcount is over 0" tells the reader which rule applied;
    // "when headcount is 20" leaves them to work it out.
    const issues = RuleValidator.validate({ headcount: 20, certifications: "NADCAP" }, [rule])
    expect(issues[0].message).toContain("over 0")
  })

  it("checks every element of a multi-select", () => {
    const issues = RuleValidator.validate(
      { headcount: 20, certifications: ["ISO 9001:2015", "NADCAP"] },
      [rule]
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain("NADCAP")
    expect(issues[0].message).not.toContain("ISO 9001:2015, NADCAP")
  })

  it("ignores a record that has not reached the field yet", () => {
    expect(RuleValidator.validate({ headcount: 20 }, [rule])).toEqual([])
  })

  it("narrows the options offered to the generator", () => {
    const options = RuleValidator.getValidOptions(
      "certifications",
      { headcount: 20 },
      [rule],
      ["ISO 9001:2015", "NADCAP", "AS9100D"]
    )
    expect(options).toEqual(["ISO 9001:2015"])
  })

  it("intersects with another rule narrowing the same field", () => {
    const second: SeedRule = {
      id: "cert-by-region",
      type: "conditional_enum",
      sourceField: "region",
      targetFields: ["certifications"],
      config: { conditions: [{ when: { eq: "Alberta" }, allow: ["AS9100D", "NADCAP"] }] },
    }
    const options = RuleValidator.getValidOptions(
      "certifications",
      { headcount: 600, region: "Alberta" },
      [rule, second],
      ["ISO 9001:2015", "NADCAP", "AS9100D"]
    )
    expect(options).toEqual(["NADCAP", "AS9100D"])
  })
})

// ── range_constraint through the validator ───────────────────────────────────
describe("range_constraint", () => {
  const rule: SeedRule = {
    id: "utilisation",
    type: "range_constraint",
    sourceField: "participantType",
    targetFields: ["capacity_utilization_pct"],
    config: { min: 0, max: 100, integer: true },
  }

  it("accepts a value inside the bounds", () => {
    expect(RuleValidator.validate({ capacity_utilization_pct: 72 }, [rule])).toEqual([])
  })

  it("rejects a value above the maximum", () => {
    const issues = RuleValidator.validate({ capacity_utilization_pct: 140 }, [rule])
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain("above the maximum 100")
  })

  it("rejects a value below the minimum", () => {
    const issues = RuleValidator.validate({ capacity_utilization_pct: -5 }, [rule])
    expect(issues[0].message).toContain("below the minimum 0")
  })

  it("reports both bound violations in one issue, not two", () => {
    const narrow: SeedRule = { ...rule, config: { min: 10, max: 5 } }
    const issues = RuleValidator.validate({ capacity_utilization_pct: 7 }, [narrow])
    expect(issues).toHaveLength(1)
  })

  it("rejects a non-integer when the rule says whole numbers", () => {
    const issues = RuleValidator.validate({ capacity_utilization_pct: 72.5 }, [rule])
    expect(issues[0].message).toContain("not a whole number")
  })

  it("rejects a non-numeric value rather than skipping it", () => {
    // The failure that matters: a model answering "about 80%" must not pass a
    // numeric constraint by virtue of not being a number.
    const issues = RuleValidator.validate({ capacity_utilization_pct: "about 80%" }, [rule])
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain("not a number")
  })

  it("applies a conditional branch", () => {
    const conditional: SeedRule = {
      ...rule,
      config: {
        min: 0,
        max: 100,
        conditions: [{ when: { eq: "machine_shop" }, min: 40 }],
      },
    }
    const record = { participantType: "machine_shop", capacity_utilization_pct: 20 }
    expect(RuleValidator.validate(record, [conditional])[0].message).toContain("below the minimum 40")
  })

  it("exposes the bounds in force to the generator", () => {
    expect(RuleValidator.getValidRange("capacity_utilization_pct", {}, [rule])).toEqual({
      min: 0,
      max: 100,
      integer: true,
    })
  })

  it("intersects overlapping rules to the tightest bound", () => {
    // Adding a rule must never loosen a constraint already in force.
    const tighter: SeedRule = { ...rule, id: "tighter", config: { min: 20, max: 80 } }
    expect(RuleValidator.getValidRange("capacity_utilization_pct", {}, [rule, tighter])).toEqual({
      min: 20,
      max: 80,
      integer: true,
    })
  })

  it("is not offered as an enum option list", () => {
    // getValidOptions answers "which of these choices remain"; a numeric range
    // does not enumerate, and pretending otherwise would hand the generator an
    // empty option list.
    expect(
      RuleValidator.getValidOptions("capacity_utilization_pct", {}, [rule], ["a", "b"])
    ).toEqual(["a", "b"])
  })
})

// ── The regression this closes ───────────────────────────────────────────────
describe("the gap these rule types close", () => {
  it("a declared rule is now enforced rather than silently ignored", () => {
    const rule: SeedRule = {
      id: "r",
      type: "range_constraint",
      sourceField: "x",
      targetFields: ["lead_time_days"],
      config: { min: 1, max: 365 },
      description: "Lead time is quoted in days within a year",
    }
    expect(RuleValidator.validate({ lead_time_days: 900 }, [rule]).length).toBeGreaterThan(0)
  })
})
