# Noeis ordinary Wiki quality standard

**Status:** implementation contract  
**Scope:** ordinary personal-library Wiki pages only  
**Excluded:** investment dossiers, repository dossiers, weekly editions, project logs, and question pages keep their purpose-built contracts.

## Recovered product reference

The useful historical reference is not a particular card or dossier layout. The May 2026 LLM-native Wiki reshape defined the correct primitive: a Wikipedia-shaped article that the agent maintains from the user's sources, while the user reads, sources, questions, and explicitly accepts consequential changes. The June 4 QA report recorded the successful output class as full sourced articles: Opportunity Cost at 655 words and 14 claims, Mental Models at 1,263 words, and a Compound Interest / Opportunity Cost build at roughly 1,093 words.

The qualities worth restoring are:

- reading-first rather than editor-first;
- subject-specific prose and headings rather than a universal template;
- paragraph-level citations back to durable Library objects;
- inline links to related Wiki pages;
- a comfortable reading measure, contents rail, references, and backlinks;
- clear separation between the article, source provenance, and agent maintenance state.

Word count is evidence of prior depth, not the target by itself. A long generic article still fails.

## What makes a great personal-library Wiki page

### 1. It answers the subject immediately

The first sentence says what the subject is. It defines important terms and notation before analogies, applications, or personal interpretation.

### 2. It metabolizes the user's Library

The article is not a source digest. It combines the user's saved material into a durable explanation while every factual paragraph remains traceable to exact Library objects. Repeated highlights from one article count as one evidence family.

### 3. Its structure belongs to the subject

Headings teach the reader how the subject is organized. “Compounding frequency,” “Nominal and effective rates,” and “A worked example” are useful; “Overview,” “Evidence,” “Implications,” and “Open Questions” repeated on every topic are not.

### 4. It explains mechanism, not atmosphere

The body should contain definitions, causal or technical mechanisms, concrete examples, boundary cases, and observable implications. Generic phrases such as “analysts often,” “plays an important role,” or “provides a framework” do not substitute for explanation.

### 5. It separates epistemic roles

The page distinguishes:

- what a source directly establishes;
- what Noeis synthesizes or infers;
- what is only an analogy;
- what remains unknown or contested.

Formal equivalence language is forbidden unless cited evidence directly establishes it.

### 6. It is personal without becoming parochial

The page may connect the subject to other ideas in the user's Wiki and explain why it recurs in their reading. Those connections must clarify the subject; they cannot replace its generally useful definition or mechanism.

### 7. It fails honestly

If the Library does not contain material that directly addresses the subject, Noeis preserves the trusted article and says which evidence is missing. It does not use the current AI draft to search for more of its own framing, cite adjacent material as authority, or invite a blind retry.

## Compound Interest acceptance example

A passing page should, when supported by the Library:

1. define principal, periodic rate, number of periods, and accumulated interest;
2. show the discrete formula and one worked example;
3. distinguish nominal and effective annual rates and explain compounding frequency;
4. cover continuous compounding only when supported;
5. distinguish contractual compounding from business reinvestment or network-effect analogies;
6. cite at least one source that directly addresses compound interest;
7. state missing evidence rather than importing plausible general knowledge.

A page fails if it calls network effects “mathematically identical” to compound interest, treats the discount rate as simply the inverse of an interest rate, or builds most of the article from business-strategy sources that do not directly explain the subject.

## Release proof

- Focused maintenance tests cover source-query contamination, topical grounding, evidence-family diversity, formal-equivalence overreach, and purpose-built page exclusions.
- The UI displays structured quality failures and confirms that the existing article is unchanged.
- `npm run wiki:qa` passes.
- Rendered checks cover 1440px, 1320px, and 430px.
- One real Compound Interest rebuild is attempted only after deployment. A quality rejection is a correct fail-closed result, but it does not count as a completed content migration.
- Two unrelated ordinary pages must pass the same contract before broad rebuilds are considered safe.

