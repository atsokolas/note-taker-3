# Noeis maintained investment dossier — product contract

**Date:** 2026-07-23

**Status:** version-2 research contract, ticker-first creation, free SEC bootstrap, structured valuation, explicit owner acceptance, and maintenance explanation are implemented; real-user activation proof remains open

**Product frame:** one maintained Noeis page with an investment-dossier profile, not a separate investing application

## Product promise

Give Noeis a ticker and a real starting judgment. Noeis builds one evidence-backed company dossier, keeps its reported facts synchronized to free public sources, recalculates the expectations embedded in the security price, and shows exactly which claims changed, survived, gained support, or became contradicted.

The product is not the generated article. The product is the durable object:

1. a user-owned judgment;
2. a source-backed claims ledger;
3. a technical and economic model of the moat;
4. a structured valuation snapshot;
5. explicit falsifiers;
6. public evidence clocks;
7. reviewable maintenance receipts.

## Required dossier structure

Every SEC-watched company dossier should maintain these nine decision surfaces:

1. **Current Judgment** — the decision-relevant conclusion, separating business quality from security attractiveness.
2. **Implied Expectations** — dated market input, normalized operating base, return hurdle, horizon, and terminal assumptions.
3. **Thesis-Changing Questions** — the few questions whose answers could materially change expected return.
4. **Product and Technical Moat** — architecture, workflow capital, system integration, distribution, switching costs, and the mechanisms that can erode them.
5. **System and Unit Economics** — customer outcome per accepted unit of work, utilization, energy, deployment time, reliability, and engineering burden.
6. **Operating Engine and Capital Allocation** — revenue quality, margins, cash conversion, research intensity, repurchases, debt, and ecosystem investment.
7. **Obligations, Concentration, and Policy** — supply commitments, customer power, financing dependencies, regulation, and stranded-capacity risk.
8. **What Would Change the Thesis** — observable falsifiers and strengthening evidence.
9. **Next Evidence and Maintenance Test** — the exact filing or public evidence expected to update the object.

The headings are stable product surfaces; the analysis underneath them is selected by business model. “Product and Technical Moat” means the mechanism by which the company creates and defends customer value. It must not force semiconductor or AI-infrastructure vocabulary onto retailers, financial companies, marketplaces, industrial companies, or healthcare businesses.

## Decision-grade research compiler

A dossier is not decision-ready because a model filled the nine sections. New company dossiers persist a versioned research profile with:

- a classified business model;
- the customer’s unit of value;
- required evidence archetypes;
- required deterministic analysis modules;
- claim-level outputs for each completed module;
- reproducible calculations where the module requires arithmetic;
- at least one non-obvious, reproducible insight;
- explicit missing evidence and missing modules.

The universal analysis modules are:

1. current judgment;
2. customer value unit;
3. control-point moat;
4. unit economics and cash conversion;
5. capital reinvestment;
6. competitive substitution;
7. reverse expectations;
8. falsifiers;
9. next evidence clock.

Business-model adapters add the economics the universal layer cannot specify:

- subscription: retention, expansion, sales efficiency, implementation and switching cost;
- marketplace: liquidity, take rate, contribution margin, disintermediation;
- industrial: price/volume/mix, installed base, aftermarket, working capital;
- consumer or brand: volume/price/mix, repeat, distribution, promotion dependence;
- membership retail: membership economics, merchandise value gap, inventory funding, warehouse density;
- financial or payments: funding, losses, transaction yield, regulatory capital and liquidity;
- semiconductor or infrastructure: accepted-work economics, utilization, reliability, capacity and refresh;
- healthcare or biotech: pipeline probability, clinical and regulatory gates, runway and dilution.

The model may explain completed modules. It may not complete a module by asserting that the prose is analytical.

## Decision-grade acceptance gate

Investment-dossier candidates fail closed when any of the following is true:

- the business model is unclassified;
- the version-2 research profile is absent;
- a required analysis module is incomplete;
- a required evidence archetype is absent;
- a decision claim is unsupported or uncited;
- reverse expectations or unit economics lack reproducible calculations;
- the article lacks a reproducible, source-linked insight;
- one of the nine decision surfaces is absent;
- the result is shorter than the minimum needed to contain the analytical units.

Word count alone never creates a pass. The current minimum prevents filing abstracts from passing, while the decisive checks are structured module completion, evidence coverage, claim support, and reproducible analysis.

Rejected maintenance candidates must restore the `investmentDossier` profile with the rest of the trusted page. Research-plan state cannot leak from a rejected candidate into the accepted object.

The reader must lead with the dossier article. An investment dossier must not be replaced or visually buried by the Living Thesis shell merely because a judgment record exists. When the owner has supplied a real judgment, its decision record remains available after the research article in a collapsed workspace. When the owner has not supplied a judgment, the compiler must not create an empty or synthetic `judgment` object.

## Source policy

The current proof phase uses free sources:

- SEC EDGAR filings and XBRL facts are the authoritative company clock.
- Company investor-relations material is allowed when it is filed or clearly labeled.
- Exchange or public market pages may provide a dated price snapshot.
- Official technical documentation, benchmark records, and reproducible public artifacts may support product and workload claims.
- Paid transcript feeds are optional and are not an acceptance dependency.

A price observation must never masquerade as a company filing or advance the accepted SEC clock. It is a separately dated input that can be refreshed without rewriting historical filing acceptance.

## Creation flow

The intended product flow is:

1. User chooses **Company dossier** and enters a ticker.
2. Noeis resolves the CIK, attaches the latest 10-K and 10-Q, and arms the EDGAR watcher.
3. The user supplies the actual starting judgment, required return, and horizon. Noeis must not fabricate the user's conviction.
4. Noeis drafts the nine decision surfaces and labels missing evidence.
5. The user accepts the first trusted head.
6. New filings create candidates and claim deltas. Trusted content changes only after acceptance.
7. A price refresh recalculates implied expectations without pretending the company changed.

## Structured valuation contract

Valuation should move out of prose into a structured, versioned snapshot:

```js
{
  asOf,
  currency: 'USD',
  price,
  dilutedShares,
  equityValue,
  netCashOrDebt,
  enterpriseValue,
  operatingBase: {
    metric: 'free_cash_flow',
    period,
    value,
    derivation,
    sourceRefIds
  },
  hurdle: {
    annualReturn,
    horizonYears,
    terminalMultiples
  },
  scenarios: [{
    terminalMultiple,
    requiredOperatingValue,
    requiredCagr
  }],
  sensitivityBoundaries: [],
  sourceRefIds: [],
  calculatedAt
}
```

The calculation service must be deterministic and tested. The model may explain the results, but it may not invent or alter the arithmetic.

## Maintenance semantics

Two clocks update different parts of the same object:

- **Evidence clock:** a new accepted SEC filing may change the operating base, claims, falsifiers, and current-through stamp.
- **Expectations clock:** an explicit price refresh may change valuation burden and scenario outputs, but it does not change filing acceptance.

Every accepted maintenance run should expose:

- source event;
- previous and resulting revision;
- claims added, changed, gained support, contradicted, preserved, or removed;
- valuation assumptions changed;
- whether the judgment changed;
- the next evidence test.

## Public proof boundary

A public dossier may show the article, public citations, valuation assumptions, accepted clocks, and maintenance deltas. It must not expose private highlights, notes, backlinks, portfolio weights, user conviction, agent state, or unpublished candidates.

“Proven” remains an editorial and evidence decision bound to the accepted head. A fresh market quote alone cannot make a dossier proven.

## Productization sequence

### Landed in this pass

- SEC-watched pages now receive the reusable investment-dossier structure and generation rules.
- The prompt explicitly separates company quality from security attractiveness.
- It requires implied-expectations analysis, technical-to-economic moat analysis, falsifiers, and a named next evidence test.
- NVIDIA is the first full example of the valuation contract in prose.
- New dossiers persist a version-2 business-model research profile.
- The quality gate rejects unclassified, two-filing, generic-prose dossiers.
- Membership retail is the first non-AI adapter, validated with Costco.
- A user can create a private maintained dossier from a ticker, their own starting judgment, return hurdle, and horizon.
- Creation resolves the CIK, attaches the latest free 10-K and 10-Q, arms the EDGAR watcher, and returns a durable provenance receipt.
- Repeating identical creation inputs reopens the existing active dossier; changed owner inputs fail with an explicit conflict instead of being silently discarded; archived dossiers do not block recreation.
- A deterministic valuation service persists dated price, diluted shares, net cash or debt, a source-backed operating base, terminal scenarios, and the required operating CAGR.
- The private article reader exposes a compact expectations editor before the dossier; the public reader exposes only complete public-safe assumptions and scenarios.
- The expectations clock advances independently from the accepted filing clock and writes both a revision and a durable refresh receipt.
- Local QA created a Fastenal dossier from the real user path with current free SEC filings and no paid transcript or market-data dependency.
- Initial and later research candidates remain private and cannot replace the trusted head until the owner reviews the exact revision and explicitly accepts it.
- Decision-grade dossiers created before the acceptance contract can be adopted once, by the human owner, without regenerating or changing the current article, claims, sources, valuation, or evidence clock. Adoption requires an existing owner judgment, a passing current quality gate, an exact confirmation, a bound revision, and a durable first-head receipt.
- Accepted maintenance now persists a reader-facing explanation of what changed, why it matters, what the valuation burden did, and whether the owner judgment changed.
- A database-level active owner-and-CIK key prevents simultaneous requests from creating duplicate active dossiers; archiving releases the key.
- The five-user activation protocol is defined in `docs/noeis-company-dossier-five-user-activation-test-2026-07-25.md`, and its four durable funnel steps map to existing receipts and analytics events.

### Next bounded product slices

1. **Activation proof** — run the defined protocol with five real users; QA/demo accounts do not count.
2. **Research-quality calibration** — inspect the first five accepted dossiers against the NVIDIA/Gavin Baker bar and tighten business-model adapters where the analysis remains generic.

## Acceptance

The product is working when a user can:

- create a company dossier from a ticker without manual scripting;
- recognize their own judgment rather than an agent-invented one;
- see what the price requires without reading a spreadsheet;
- understand why the product/technical moat changes the economic case;
- inspect what a new filing changed and what it preserved;
- reject a candidate without losing the trusted page;
- share a public-safe proof object with an honest accepted-through clock.
