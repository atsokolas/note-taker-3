# Noeis maintained investment dossier — product contract

**Date:** 2026-07-23

**Status:** first reusable contract implemented; creation and structured valuation UI remain open

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

### Next bounded product slices

1. **Structured valuation engine** — deterministic service and persisted snapshot using the contract above.
2. **Company-dossier creation receipt** — ticker-to-CIK resolution, latest filings attached, EDGAR watcher armed, and first trusted-head review.
3. **Valuation component** — compact assumptions and scenario table shared by private and public readers.
4. **Maintenance comparison** — show both claim deltas and expectation deltas in plain English.
5. **Activation proof** — five real users create a dossier, accept a judgment, and return after a filing or price refresh.

## Acceptance

The product is working when a user can:

- create a company dossier from a ticker without manual scripting;
- recognize their own judgment rather than an agent-invented one;
- see what the price requires without reading a spreadsheet;
- understand why the product/technical moat changes the economic case;
- inspect what a new filing changed and what it preserved;
- reject a candidate without losing the trusted page;
- share a public-safe proof object with an honest accepted-through clock.
