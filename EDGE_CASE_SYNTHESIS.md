# Edge-Case Synthesis from Trade-Press Profiles

> **Date:** June 26, 2026
> **Repository:** ClientSynth
> **Status:** Design direction — pending validation through prototype runs
> **Purpose:** Define how trade-press *participant profiles* (magazine features, vendor write-ups, award stories — some editorial, many paid) are used as an input to synthetic population generation. The short version: they are a **discovery source for edge-case test fixtures**, never a source for the representative population.
> **Sibling document:** MarketForge `framework/evidence-relevance-tiers.md` handles the *other* job — profiles as input to a real participant's live reveal/deal decision. This document handles synthesis/testing. The two jobs treat profile bias in **opposite** ways; see §1.

---

## 1. Why This Is a Different Job (and the Bias Flips Sign)

In the live-decision frame (the MarketForge evidence tiers), a trade-press profile is a **contaminant**: it is self-selected, self-presented, often paid, and its bias pollutes a real participant's decision. There you discount it, flag its provenance, and gate it.

In **synthesis for testing**, the job is not to represent a true population accurately — it is to **exercise the digital twin across its input space, including the corners**. An edge case is non-representative *by definition*; that is what makes it an edge case. So the very properties that make a magazine profile dangerous as live intelligence (unusual, outlier, shiny, self-selected) are exactly what make it valuable as a **test fixture**.

The conflict — "this profile is biased and non-representative, but it surfaces a great edge case" — dissolves once you notice it is one artifact held against two incompatible jobs. Separate the jobs and the tension goes away.

---

## 2. The Handling Rule: Two Populations, Hard Boundary

ClientSynth already maintains a **representative population** discipline through the variation layer — `DistributionManager` enforces target distributions, `PatternDetector` / `SimilarityScorer` keep records realistic. Edge cases must not be allowed to distort any of that.

So model two distinct outputs that **must never mix**:

| Population | Purpose | Realism criterion | Profile material allowed? |
|---|---|---|---|
| **Representative population** | Demos, sponsor presentations, base-rate market behavior, "passes a sniff test with a real shop owner" | Statistically plausible; correct base rates | **No** — outliers distort the distribution |
| **Edge-case fixture library** | Coverage; stress-testing matching/deal logic against unusual inputs | Deliberately unusual; spans the corners | **Yes** — this is its home |

**The boundary rule:** profile-derived material may feed *only* the edge-case fixture library, and must **never** be promoted into the representative population or counted in its base-rate statistics, distribution targets, or realism scoring. This is the same architectural move ClientSynth and the DeeperPoint stack already use elsewhere — quarantine by purpose, block promotion across the boundary (cf. the live layer's rule that sponsored content never enters the authoritative reference library).

---

## 3. Mine the *Shape*, Not the *Claim*

Do not ingest a profile as a real entity. Lift the **interesting configuration** — the unusual capability combination, the rare constraint, the surprising deal dimension — and synthesize a fictional participant around it. A single move resolves three problems at once:

- **Verification** — irrelevant here. You do not need the magazine's claim to be *true*, only *plausible enough to be worth testing*. A much lower, and entirely legitimate, bar.
- **Self-presentation bias** — irrelevant. You are not asserting anything about the real subject; you are borrowing a plausible shape.
- **Confidentiality / legal** — sidestepped. Because ClientSynth produces fictional profiles (see the README's strict synthetic-vs-real boundary), a profile-derived fixture must be **transformed, not copied**: strip the real named entity, keep the abstract configuration. This avoids basing a fictional "bad actor" or distressed-shop stress case on a real, named company — which would both violate the synthetic/real separation and invite appropriation/defamation risk.

---

## 4. The Residual Risk You Must Not Wave Away

Selection bias survives the reframe in one specific, important way. Trade press oversamples the **shiny corner** — successful, growing, marketing-savvy, or paying. So profiles will hand you *prosperity* edge cases and badly under-supply *distress* edge cases (the shop about to fold, the desperate buyer working under a deadline) — which are usually the **more important** ones to test, and the ones the confidential-matching thesis most needs to handle well.

Therefore:

- **Profiles seed; they do not span.** Use them to *discover* edge cases you would not have imagined, then deliberately synthesize the **complementary/inverse** cases (if a profile yields a thriving shop with exotic five-axis capacity, also generate the distressed shop with the same capacity and an urgent cash need).
- **Cap the dosage.** Edge cases are a minority of any test suite by design; the representative population is the bulk. Profile-derived oddities should be a bounded fraction, used for coverage, not volume.
- **Audit the source skew.** Because the discovery source is itself skewed, tag every profile-derived fixture so you can measure and correct for the bias (see §6).

---

## 5. The Retain / Discard Test

Reframe the retain-or-discard decision. It is **not** "is this representative?" (never) or "is it verified?" (does not matter here). It is:

> **Does this surface a configuration my edge-case library does not already cover?**

- **Yes** → mine the shape, de-identify, tag, retain the *derived fixture* (not the profile).
- **No** (just another success story with no novel configuration) → discard; it adds bias without adding coverage.

**Retain for novel coverage, not for information.** That criterion is what cuts the knot.

---

## 6. Provenance Tagging on Fixtures

Every profile-derived fixture carries provenance so it can always be excluded from representativeness analysis and audited for source skew:

```yaml
edge_case_fixture:
  origin: "profile_derived"          # vs. hand_authored | rule_generated | inverse_synthesized
  purpose: "edge_case_test"          # never "representative"
  source:
    publication: "Modern Machine Shop"
    provenance: "sponsored"          # editorial | sponsored | self_published | unknown(->sponsored)
    date: "2026-05-30"
  configuration:                     # the SHAPE that was mined — not the real entity
    capability_combo: "5-axis titanium + AS9100 + same-week turnaround"
    rare_constraint: "single-source spindle, 18-month lead on replacement"
  de_identified: true                # real named subject stripped; fictional participant synthesized
  coverage_gap_filled: "high-capability + urgent-turnaround corner"
  inverse_synthesized: true          # complementary distress case also generated (see §4)
  excluded_from:
    - representative_distribution
    - base_rate_statistics
    - realism_scoring
```

---

## 7. The Source List

The candidate sources for profile mining are **the same trade publications already catalogued** for the news/regulatory feed monitor: `NewsFeedSourceRegistry.md` in the **mfgllmwiki** repo, **§1 "Industry trade publications"** (Modern Machine Shop, The Fabricator, Canadian Metalworking, Canadian Manufacturing, Plant.ca, IndustryWeek, etc.).

This is the *only* coupling between this work and mfgllmwiki: that registry's trade-publication rows are, essentially, the profile-source list ClientSynth needs. Reuse it rather than maintaining a second list. Two notes:

- The registry's `Serves` tags (`closure`, `liquidation`, `capex`, `regulatory`, `demand`) and reliability scores are tuned for *event* monitoring; for profile mining what matters instead is which publications run **participant features** (most of §1 do) and whether a given feature is editorial or paid (the `provenance` field in §6).
- The registry's ToS/robots discipline and "paraphrase, don't copy" policy apply here too — reinforced by §3's transform-don't-copy rule.

---

## 8. Where This Fits in the Roadmap

This capability sits inside **Track D (Digital Twin & Simulation)** and extends **C2.1 (scenario definition language)**:

- The representative population is what C2.1–C2.5 already generate.
- The **edge-case fixture library** is a sibling output of the same scenario engine, drawing on profile-mined shapes plus deliberately synthesized inverses.
- `DistributionManager` is the natural enforcement point for the §2 boundary: edge-case fixtures are excluded from its target-distribution accounting.

No new infrastructure is required to start — a profile can be hand-mined into a scenario-definition fragment today. Automation (profile fetch → shape extraction → fixture synthesis) is a later step and is left to implementation.

---

## 9. What This Does NOT Resolve

1. **Shape-extraction mechanics.** *How* a profile is parsed into a reusable configuration fragment (LLM extraction, human curation) is unspecified here.
2. **Inverse-case generation policy.** §4 states the principle (synthesize the distress complement); the concrete rules for what counts as a meaningful inverse are left to implementation.
3. **Dosage tuning.** The fraction of any test suite that should be edge cases, and the sub-fraction that may be profile-derived, needs empirical tuning.
4. **Editorial-vs-paid detection.** How `provenance` is determined for a given feature (disclosure-label parsing, publisher heuristics) is an ingestion concern shared with the live-layer pipeline.
