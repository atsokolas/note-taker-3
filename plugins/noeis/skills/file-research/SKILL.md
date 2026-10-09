---
name: file-research
description: File explicitly requested research findings into a connected NOEIS Edition through the existing Power Through workflow, preserving sources, novelty, limitations, deduplication, and receipts.
---

Use authenticated NOEIS tools and their current schemas. Verify connection_info, then list_edition_profiles and list_editions; inspect get_edition when needed. Reuse the user's existing topic, cadence, sections, current issue, and saved sources. Do not invent a topic or configure a recurring search merely because an Edition has a cadence. Ask for the intended topic when ambiguous.

Read each candidate source before filing. Each item must identify its source URL, title, author/publication where known, date where known, the supported finding, what it adds beyond the current issue, and its boundary (scope, uncertainty, sample, conflict, replication, or other concrete limit). Clearly separate observed findings from your inference. Do not file a promotional announcement as established evidence. When nothing qualifies, report no new qualifying finding and pass the sections you looked at in file_edition_items `checked`; filler is not a fallback.

Use file_edition_items for additive filing into the existing issue. It is the existing Power Through path; do not create a separate feed, scheduler, receipt database, or parallel research store. Pass only new findings using the configured section keys. Keep canonical source identity and stable item identity when supplied. Let the server choose the issue window and perform durable deduplication. Do not use create_edition to replace an issue when the user asked to add findings.

Edition filing receipts establish research-item persistence only. Do not claim that unrelated browser drafts or human Edition thoughts are preserved; their conflict recovery is a separate flow.

Report the actual filing receipt: added, already-held/skipped, rejected, and any failed items, with the resulting Edition link where returned. A duplicate skip is an honest successful no-op, not a newly saved source. If the result is uncertain, reconcile the Edition before retrying. Reuse an idempotency key when the tool supports it and preserve the same source identities.

The plugin executes when invoked. It does not run continuously. Only if the user expressly requests future work, use the host's supported scheduling capability after a successful read of this exact NOEIS grant. Preserve the requested topic, cadence, scope, and delivery policy, and report schedule creation separately from completed research. No unspecified recurring topics or searches.
