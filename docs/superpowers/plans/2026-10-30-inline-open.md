# Inline Open Implementation Plan

> Implement in this isolated checkout using executing-plans; user has authorized mockup and implementation without another approval wait.

Goal: create Open records inside a note without a new screen.
Architecture: a small composer replaces the modal trigger in WorkFollowups. An account/note scoped draft controller keeps unsubmitted text outside auto-flush, then transfers an immutable submission to the existing Work session with stable identity.
Tech: React, existing CSS tokens, localStorage, Work session, Jest/Testing Library and synthetic Playwright browser QA.
Spec: docs/superpowers/specs/2026-10-30-inline-open-design.md

Global constraints: preserve note prose and editor; inherit actual note folder; literal title; unplanned; no API/schema changes or bullet spacing changes. Synthetic fixtures only.
Review focus: lost response/crash between draft and queue; storage failure; parent id becoming server id; token switch; IME/mobile keyboard.

- [ ] Task 1: Add tests for separate drafts, durable submission identity and reload/retry in workSession.test.js. Observe failure, implement workOpenComposer.js and minimal Work session hooks, then run session/draft/session lifecycle suites.
- [ ] Task 2: Add integration tests in WorkNotes.test.jsx and reconciliation coverage for both kinds, actual scope, literal titles, empty state, draft retention/cancel, IME and editor preservation. Observe failure, implement WorkOpenComposer.jsx and WorkFollowups wiring with local CSS. Run directly related Work suites.
- [ ] Task 3: Render synthetic mockup and final desktop/1280/mobile screenshots. Verify browser flow and build. Review whole diff independently, fix substantive findings with tests, then commit and open draft PR. No merge/deploy.
