/**
 * Population diversity metrics.
 *
 * The failure these exist to catch is invisible to record-level validation:
 * every record satisfies every rule, carries a valid watermark and passes the
 * schema, while the set as a whole is four records repeated with the names
 * changed. So every test here works on a population, never a record.
 */

import {
  DEFAULT_THRESHOLDS,
  analysePopulation,
  checkDiversity,
  fieldDiversity,
  formatReport,
} from "@/lib/validation/diversity-metrics"

/**
 * A healthy population: every record genuinely different.
 *
 * headcount is `10 + i` rather than `10 + (i * 7) % 90`. The modular version
 * wrapped at i = 90, and both other fields have period 5, which divides 90 — so
 * records 90 to 99 were exact copies of 0 to 9. The duplicate metric caught it,
 * which is a fair demonstration of why the metric is worth having: the fixture
 * was written to be varied, looked varied, and was ten per cent repeats.
 */
function varied(n: number) {
  const regions = ["Hamilton", "Waterloo", "Cambridge", "Mississauga", "Toronto"]
  const processes = ["milling", "turning", "grinding", "wire EDM", "mill-turn"]
  return Array.from({ length: n }, (_, i) => ({
    id: `shop-${i}`,
    region: regions[i % regions.length],
    process: processes[(i * 3) % processes.length],
    headcount: 10 + i,
  }))
}

/** A collapsed population: plausible records, almost all the same. */
function collapsed(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `shop-${i}`,
    region: i < 2 ? "Waterloo" : "Hamilton",
    process: "milling",
    headcount: 25,
  }))
}

// ── Per-field ────────────────────────────────────────────────────────────────
describe("fieldDiversity", () => {
  it("counts distinct values and their spread", () => {
    const d = fieldDiversity(varied(10), "region")
    expect(d.populated).toBe(10)
    expect(d.distinct).toBe(5)
    expect(d.distinctRatio).toBe(0.5)
    expect(d.normalizedEntropy).toBeCloseTo(1, 5)
  })

  it("reports the dominant value's share", () => {
    const d = fieldDiversity(collapsed(100), "region")
    expect(d.topValue).toBe("Hamilton")
    expect(d.topValueShare).toBeCloseTo(0.98, 5)
  })

  it("ignores records with no value for the field", () => {
    const d = fieldDiversity([{ a: "x" }, { a: "" }, { a: null }, {}], "a")
    expect(d.populated).toBe(1)
  })

  it("entropy separates an even spread from a skewed one with the same distinct count", () => {
    // The case distinctRatio alone cannot see: 3 distinct values either way.
    const even = fieldDiversity(
      [{ a: "x" }, { a: "y" }, { a: "z" }, { a: "x" }, { a: "y" }, { a: "z" }],
      "a"
    )
    const skewed = fieldDiversity(
      [{ a: "x" }, { a: "x" }, { a: "x" }, { a: "x" }, { a: "y" }, { a: "z" }],
      "a"
    )
    expect(even.distinct).toBe(skewed.distinct)
    expect(even.normalizedEntropy).toBeGreaterThan(skewed.normalizedEntropy)
  })

  it("treats a multi-select as a set, not a sequence", () => {
    // Order is not a dimension of variation; counting it as one would report a
    // collapsed population as diverse.
    const d = fieldDiversity([{ a: ["x", "y"] }, { a: ["y", "x"] }], "a")
    expect(d.distinct).toBe(1)
  })

  it("a field with one value everywhere has zero entropy", () => {
    expect(fieldDiversity([{ a: "x" }, { a: "x" }], "a").normalizedEntropy).toBe(0)
  })
})

// ── Whole population ─────────────────────────────────────────────────────────
describe("analysePopulation", () => {
  it("measures an empty population without dividing by zero", () => {
    const report = analysePopulation([])
    expect(report.records).toBe(0)
    expect(report.duplicateRate).toBe(0)
  })

  it("excludes identity fields, which are unique by construction", () => {
    const fields = analysePopulation(varied(10)).fields.map((f) => f.field)
    expect(fields).not.toContain("id")
    expect(fields).toContain("region")
  })

  it("counts duplicate records on the measured fields only", () => {
    // Including a generated id would make every record unique by construction
    // and the metric meaningless — which is the failure it exists to catch.
    const report = analysePopulation([
      { id: "1", region: "Hamilton", process: "milling" },
      { id: "2", region: "Hamilton", process: "milling" },
      { id: "3", region: "Waterloo", process: "turning" },
    ])
    expect(report.duplicateRecords).toBe(1)
    expect(report.duplicateRate).toBeCloseTo(1 / 3, 5)
  })

  it("reports axis values the population never produced", () => {
    const report = analysePopulation(varied(10), {
      personaAxes: [
        { axis: "region", field: "region", values: ["Hamilton", "Thunder Bay", "Kenora"] },
      ],
    })
    expect(report.uncoveredAxisValues[0].missing).toEqual(["Thunder Bay", "Kenora"])
  })

  it("matches axis values case-insensitively", () => {
    const report = analysePopulation([{ scale: "Small Shop" }], {
      personaAxes: [{ axis: "scale", field: "scale", values: ["small shop"] }],
    })
    expect(report.uncoveredAxisValues).toEqual([])
  })
})

// ── Thresholds ───────────────────────────────────────────────────────────────
describe("checkDiversity", () => {
  it("passes a varied population", () => {
    expect(checkDiversity(analysePopulation(varied(100)))).toEqual([])
  })

  it("catches a collapsed population", () => {
    const issues = checkDiversity(analysePopulation(collapsed(100)))
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some((i) => i.metric === "maxTopValueShare")).toBe(true)
    expect(issues.some((i) => i.metric === "minNormalizedEntropy")).toBe(true)
  })

  it("does not also flag duplicates that the field cardinality forces", () => {
    // collapsed() leaves two expressible combinations across a hundred records,
    // so ninety-eight MUST repeat. The real finding is that the fields carry too
    // few values, already reported as entropy and top-value share; reporting the
    // arithmetic consequence as a second independent issue is noise.
    const report = analysePopulation(collapsed(100))
    expect(report.duplicateRecords).toBeGreaterThan(90)
    expect(report.duplicatesWereAvoidable).toBe(false)
    expect(checkDiversity(report).some((i) => i.metric === "maxDuplicateRate")).toBe(false)
  })

  it("flags duplicates the population could have avoided", () => {
    // Enough expressible combinations to give every record a distinct identity,
    // and the generator repeated one anyway.
    const population = Array.from({ length: 10 }, (_, i) => ({
      name: i === 0 ? "Acme Machining" : `Shop ${i}`,
      region: ["Hamilton", "Waterloo", "Cambridge", "Toronto", "Guelph"][i % 5],
    }))
    population[0] = { ...population[1] }

    const report = analysePopulation(population)
    expect(report.duplicatesWereAvoidable).toBe(true)
    expect(checkDiversity(report).some((i) => i.metric === "maxDuplicateRate")).toBe(true)
  })

  it("names the offending value, so the report is actionable", () => {
    const issues = checkDiversity(analysePopulation(collapsed(100)))
    const share = issues.find((i) => i.metric === "maxTopValueShare")
    expect(share!.message).toContain("Hamilton")
  })

  it("skips a field that cannot be diverse", () => {
    // A boolean, or an enum the schema restricts to one term, is not evidence
    // of collapse; failing it would teach everyone to ignore the metric.
    const population = Array.from({ length: 50 }, () => ({ active: true }))
    expect(checkDiversity(analysePopulation(population))).toEqual([])
  })

  it("catches severe skew that the distinct-ratio floor cannot see", () => {
    // 85 of 100 records share one value; the other 15 are unique. distinctRatio
    // is 0.16 and clears its floor, so only the skew metrics can find this.
    const population = Array.from({ length: 100 }, (_, i) => ({
      region: i < 85 ? "Hamilton" : `Town ${i}`,
    }))
    const report = analysePopulation(population)
    const issues = checkDiversity(report, DEFAULT_THRESHOLDS, { openEndedFields: ["region"] })

    expect(report.fields[0].distinctRatio).toBeGreaterThan(DEFAULT_THRESHOLDS.minDistinctRatio)
    expect(issues.some((i) => i.metric === "minDistinctRatio")).toBe(false)
    expect(issues.some((i) => i.metric === "maxTopValueShare")).toBe(true)
  })

  it("entropy separates skew from spread at the same distinct count", () => {
    // Both have 50 distinct values across 100 records, so distinctRatio is 0.5
    // for each and cannot tell them apart. One is an even spread; the other has
    // half its records on a single value.
    const even = analysePopulation(
      Array.from({ length: 100 }, (_, i) => ({ region: `Town ${i % 50}` }))
    )
    const skewed = analysePopulation(
      Array.from({ length: 100 }, (_, i) => ({ region: i < 51 ? "Hamilton" : `Town ${i}` }))
    )

    expect(even.fields[0].distinctRatio).toBeCloseTo(skewed.fields[0].distinctRatio, 2)
    expect(skewed.fields[0].normalizedEntropy).toBeLessThan(even.fields[0].normalizedEntropy)
  })

  it("holds an open-ended field to the distinct-ratio floor when told to", () => {
    // Every company name could differ; four names across a hundred shops is
    // collapse, even though four regions across a hundred shops is not.
    const population = Array.from({ length: 100 }, (_, i) => ({
      companyName: ["Acme", "Precision", "Summit", "Apex"][i % 4],
    }))
    const report = analysePopulation(population)

    expect(checkDiversity(report)).toEqual([])
    const strict = checkDiversity(report, DEFAULT_THRESHOLDS, { openEndedFields: ["companyName"] })
    expect(strict.some((i) => i.metric === "minDistinctRatio")).toBe(true)
  })

  it("does not apply the distinct-ratio floor to a categorical field", () => {
    // A field the schema restricts to three terms cannot exceed 0.03 across a
    // hundred records, however healthy the population is.
    const population = Array.from({ length: 100 }, (_, i) => ({
      size: ["small", "medium", "large"][i % 3],
    }))
    expect(checkDiversity(analysePopulation(population))).toEqual([])
  })

  it("reports uncovered axis values as an issue", () => {
    const report = analysePopulation(varied(10), {
      personaAxes: [{ axis: "scale", field: "region", values: ["Thunder Bay"] }],
    })
    const issues = checkDiversity(report)
    expect(issues.some((i) => i.metric === "axisCoverage")).toBe(true)
  })

  it("thresholds are floors that a plausibly skewed real field still clears", () => {
    // Most shops are small and most contracts use the common payment term. A
    // metric that fails honest populations gets its threshold lowered until it
    // measures nothing.
    const realistic = Array.from({ length: 100 }, (_, i) => ({
      size: i < 60 ? "small" : i < 85 ? "medium" : "large",
      region: ["Hamilton", "Waterloo", "Cambridge", "Toronto"][i % 4],
    }))
    expect(checkDiversity(analysePopulation(realistic))).toEqual([])
  })
})

describe("formatReport", () => {
  it("renders something a human can read in CI output", () => {
    const text = formatReport(analysePopulation(varied(20)))
    expect(text).toContain("20 record(s)")
    expect(text).toContain("region")
    expect(text).toContain("duplicates")
  })
})
