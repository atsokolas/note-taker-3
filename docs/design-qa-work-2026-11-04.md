# Work design and regression QA — 4 November 2026

Approved reference: Library libfile_90947c4f8ebc819196f6196f223f4e7f, warm-paper Today / Tokyo Midnight note. Inspected the original 1774×887 image and the real local app at 1440×1000, 1280×900 and 430×932. Fixture data is fictional and isolated by an Axios adapter; no production account or records were used.

## Visible result

- The narrow 244px rail starts directly under the actual NOEIS top bar. Search and notebook filter precede Today, Upcoming and existing Open views. Blue, violet, amber and green Feather icons add wayfinding without replacing labels. Projects and Notes disclose independently; nested folders and note memberships remain visible, including the same note in its project and notebook.
- Today uses an editorial serif title/date, chronological appointment time ranges, separate checkbox Priorities and initially collapsed From earlier. Calendar/day/week navigation, natural language planning, day margin and Close the day remain available. Earlier-day and current-day writing remain real records.
- The note keeps one readable measure with its dated writing and Open items below. Existing title, notebook, meeting date, project, rich text, autosave, recovery, Make Open and Continue this note are retained.
- Deliberate differences from the reference: actual global navigation/settings remain, existing calendar and recovery capabilities remain, new dated-entry controls retain their existing behavior pending the separately requested sticky/dropdown enhancement, and fixture content is fictional.

## Browser evidence

Local preview: http://127.0.0.1:3103/work?view=today, served on Athan’s Mac. Inspected screenshots in ignored output/playwright: today-light-desktop.png, note-tokyo-desktop.png, note-tokyo-mobile.png. Verified light, dark and Tokyo Midnight appearance; no horizontal overflow at desktop/sidebar/mobile widths. Light rail icon contrast measured 4.42–5.83:1 against its surface. Tokyo colors derive from semantic warning/success/muted roles and blue/violet mixed toward current ink. Existing text and theme tokens are reused.

Verified native keyboard Enter/Space disclosures; mobile Notes & folders reveals the complete hierarchy, with measured 44px rail row/disclosure/manage targets. From earlier starts closed and opens accessibly. Upcoming groups a real future appointment. A selected note expands its project and notebook ancestors. Expanded week columns were inspected after scoping agenda styles away from them. Reduced-motion rules remain unchanged.

## Checks

- Work UI: 184 tests / 17 suites pass (receipt tmp/test-receipts/1793829475459-f97b7d).
- Work API regression: 17 assertions / two node test files pass with isolated temporary MongoDB (receipt tmp/test-receipts/1793829474172-aa66b6). Initial sandbox-only attempt could not bind a local socket; rerun with approved local socket access passed.
- Full production UI build passes, including the actual application entry point; fixture entry was restored and is not committed.
- git diff --check passes. Independent review found earlier-deadline and compact-week styling issues, both corrected with targeted coverage/visual inspection; scoped delta review passed with no remaining findings.

No database migrations, persisted status changes, credentials or production writes. WorkPlanItem replaces Calendar’s inline task/appointment render functions and reuses those actions for Upcoming. Upcoming qualifies incomplete non-jot items with valid future planned/due dates, uses the earliest applicable day, excludes completed/past/invalid matches, and shows a quiet empty state when none qualify. Current Node 22.22.3 is below the declared 22.23.4 minimum; exact-head remote CI remains the release gate.
