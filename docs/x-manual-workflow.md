# Noeis X Manual Workflow

## Current execution direction
- Primary path is now the Hermes-backed direct X API path for reading, monitoring, and controlled posting/replying.
- On this machine, the working credentials live in `/Users/athantsokolas/.hermes/.env`.
- Do not default to `xurl` for this workflow unless it is explicitly re-authenticated and verified working.
- Browser/manual workflow remains a fallback when needed for visual verification, rendering checks, or if the API path is temporarily unavailable.
- MCP/XMCP is not required for normal Noeis operations.

## Purpose
A repeatable first-pass X workflow for Noeis that prevents one-off sloppy execution.

## Rules
1. Manual first pass on a small set before codifying anything.
2. Draft 3 to 10 posts/replies before publishing.
3. Verify character count before any publish.
4. Prefer concise, founder-led, non-robotic language.
5. Verify the live result on profile/thread after posting.

## Character limits
- Hard cap: 280 characters
- Preferred post target: 180 to 240 characters
- Preferred reply target: 80 to 180 characters
- If a link is needed, prefer:
  - main post without the link when possible
  - short follow-up reply with `noeis.io`
- Never publish a draft that is near the limit without checking the exact character count.

## Post quality rules
- Lead with one clear idea.
- Avoid generic AI-productivity phrasing.
- Sound like a sharp founder, not a growth bot.
- Favor retrieval, recall, concept formation, evidence, contradiction, and reuse.
- Avoid bloated setup sentences.

## Execution sequence
1. Draft candidate posts.
2. Count characters.
3. Pick best post.
4. Publish.
5. Wait for visible publish confirmation before navigating anywhere.
6. Verify the rendered post text appeared correctly.
7. Add follow-up reply with `noeis.io` if needed.
8. Wait for visible reply confirmation before navigating anywhere.
9. Verify the rendered reply text, especially link formatting.
10. Find 3 to 5 relevant threads.
11. Draft tailored replies.
12. Publish replies.
13. Do not navigate away immediately after clicking reply.
14. Verify replies landed in the intended threads.

## Engagement targeting
Prioritize threads about:
- PKM
- Readwise
- note-taking
- research workflows
- writing workflows
- retrieval / recall
- knowledge management

Avoid low-signal generic “drop your startup” style threads unless there is a strategic reason.

## Verification checklist
- Post is under limit.
- Post appears correctly on profile.
- Rendered post text is correct, not truncated or distorted.
- Follow-up reply attached to correct post.
- Rendered reply text is correct, especially around links and auto-formatting.
- No premature navigation happened before publish confirmation.
- Engagement replies are relevant and non-spammy.
- Each live action is verified after publish.
