# Agent Next Leap + Hugging Face Model Evaluation

Date: 2026-04-24
Workspace: `/Users/athantsokolas/Documents/GitHub/note-taker-3-1`

## Executive Decision

The next leap is not picking one better model. The product should move from a single global `HF_TEXT_MODEL` to a task-aware agent model router:

1. **Thought partner / grounded chat:** `openai/gpt-oss-120b:groq`, fallback `openai/gpt-oss-120b:cerebras`, then `openai/gpt-oss-120b:fireworks-ai`.
2. **Structured planning / proposal JSON:** `openai/gpt-oss-120b:groq` with `json_schema`, same provider fallbacks.
3. **Deep critique / slow deliberate pass:** `Qwen/Qwen3-Next-80B-A3B-Thinking` on Novita only for explicit challenge, audit, contradiction, or high-stakes planning modes.
4. **Secondary non-OpenAI fallback:** `Qwen/Qwen3-Next-80B-A3B-Instruct` on Novita for grounded prose, plus `google/gemma-4-26B-A4B-it` on Novita for structured JSON fallback.
5. **Do not make Kimi K2.6 or MiniMax M2.7 the default yet.** Both are promising current models, but live checks showed analysis leakage or weaker tool-call compliance for this app's UX.

This is a correction to the earlier direction. Reasoning is not a negative. Uncontained reasoning leakage, slow default latency, and weak structured-output reliability are the negatives. Reasoning should be routed into the workflows that need it, then hidden behind reviewable artifacts and validated proposals.

## Product Workflow I Am Optimizing For

The agentic product is already closer to the intended vision than a plain chat app:

- **Concept/readings thought partner:** grounded conversation over active workspace, retrieved material, conversation history, and active concepts.
- **Writing partner:** summarize, challenge, draft notes, draft questions, synthesize, create briefs, shape slide outlines, and prepare handoffs.
- **Library/workspace agent:** find duplicates, missing links, stale summaries, contradictions, concept candidates, and hygiene work.
- **Human-reviewed executor:** stage proposed changes, artifact drafts, structure proposals, and reversible organization actions before they mutate the library.

The current code supports much of this:

- `server/services/collaborativeAgentService.js` builds a grounded partner prompt and calls HF chat.
- `server/services/agentSkillCatalog.js` defines understanding, critique, drafting, output, and maintenance skills.
- `server/services/agentProposalBundles.js` stages proposal bundles, including `organize_workspace`.
- `server/services/agentArtifactDrafts.js` and `server/routes/agentArtifactDraftRoutes.js` support reviewable artifact drafts.
- `server/services/agentStructureProposals.js`, `server/services/agentStructureExecution.js`, and `note-taker-ui/src/components/agent/StructureProposalReview.jsx` support review/apply/rollback for structure proposals.

The important gap is orchestration: the app has the pieces, but the model layer treats most work like one chat completion. The next leap is making the agent choose the right model contract per workflow.

## Current Local Model Setup

Current config is still effectively one global text model:

| Setting | Current value |
|---|---|
| `HF_PROVIDER` | `novita` |
| `HF_TEXT_MODEL` | `Qwen/Qwen3.5-35B-A3B` |
| `HF_TEXT_MODEL_FALLBACKS` | `Qwen/Qwen3.5-27B,Qwen/Qwen3.5-122B-A10B` |
| Client | HF router chat completions |

That is misaligned with the product vision. It cannot express that chat, critique, tool routing, and structure planning have different latency and correctness requirements.

## Hugging Face Availability Check

Verified through the Hugging Face plugin on 2026-04-24:

| Family | Current HF status | Inference providers observed | Keep evaluating? | Notes |
|---|---:|---|---|---|
| `openai/gpt-oss-120b` | Established, heavily used | Groq, Novita, Cerebras, Sambanova, Nscale, Together, Fireworks, Scaleway, OVH | Yes | HF docs call out tool calling, structured outputs, streaming, reasoning controls, and Responses API support. |
| `deepseek-ai/DeepSeek-V4-Pro` | New official release, created 2026-04-22, updated 2026-04-24 | Together | Yes | Strong candidate for future deep reasoning, but current provider surface is narrow. |
| `deepseek-ai/DeepSeek-V4-Flash` | New official release, created 2026-04-22 | No usable chat provider in test | Later | Live chat call returned “not a chat model.” |
| `moonshotai/Kimi-K2.6` | Current release, created 2026-04-14, updated 2026-04-23 | Novita, Together, Fireworks | Yes, not default | Strong model family, but live output leaked analysis into final text and missed tool calls. |
| `MiniMaxAI/MiniMax-M2.7` | Current release, created 2026-04-09, updated 2026-04-20 | Novita, Together, Fireworks | Yes, not default | Good speed and JSON fallback, but chat/tool behavior was less aligned. |
| `google/gemma-4-26B-A4B-it` | Current Gemma 4 release, updated 2026-04-10 | Novita | Yes | Good structured JSON fallback; slower and less agent-native than gpt-oss. |
| `google/gemma-4-31B-it` | Current Gemma 4 release, updated 2026-04-10 | Novita, Together | Limited | Too slow for default chat in live check. |
| `Qwen/Qwen3-Next-80B-A3B-Instruct` | Official current Qwen Next, updated 2025-09-17 | Novita, Featherless | Yes | Good prose fallback; Novita supports `json_object`, not `json_schema`. |
| `Qwen/Qwen3-Next-80B-A3B-Thinking` | Official current Qwen Thinking, updated 2025-09-15 | Novita | Yes, routed only | Strong deliberate mode, but slow and structured outputs unsupported in this provider test. |
| `Qwen/Qwen3-Coder-Next` | Official current Qwen Coder Next, created 2026-01-30 | Novita | Maybe | Good tool call, but JSON failed in compatible JSON check. |
| `Qwen 3.7` | No official Qwen HF repo found in plugin search | N/A | Link required | I found third-party/newer Qwen-like uploads, but not an official Qwen 3.7 model suitable as a production default. |

## Live Agent Benchmark Matrix

Prompt used: an agent workflow prompt about developing an `AI reading partner` concept from scattered Readwise highlights, concept notebook, thought-partner chat, artifact drafts, and structure proposals.

| Model/provider | Chat latency | Chat quality signal | Structured output | Tool call | Decision |
|---|---:|---|---|---|---|
| `openai/gpt-oss-120b:groq` | 307 ms | Clean, concise, directly usable | Valid `json_schema`, 574 ms | Correct `create_artifact_draft`, 520 ms | **Primary default** |
| `openai/gpt-oss-120b:cerebras` | 394 ms | Clean, concise | Valid `json_schema`, 521 ms | Correct `create_artifact_draft`, 349 ms | **Primary fallback** |
| `openai/gpt-oss-120b:fireworks-ai` | 299 ms | Clean, concise | Valid `json_schema`, 711 ms | Correct `create_artifact_draft`, 347 ms | **Primary fallback** |
| `Qwen/Qwen3-Next-80B-A3B-Instruct:novita` | 1.8 s | Good, slightly generic | Valid `json_object`, 3.6 s | Correct tool call, 1.3 s | Good prose fallback |
| `Qwen/Qwen3-Next-80B-A3B-Thinking:novita` | 10.9 s | Good deliberate answer | Structured output unsupported | Correct tool call, 13.3 s | Deep critique only |
| `Qwen/Qwen3-Coder-Next:novita` | 2.3 s | Detailed, sometimes verbose | Invalid/truncated JSON in check | Correct tool call, 0.9 s | Tool/coding-adjacent fallback, not planner default |
| `Qwen/Qwen3-Coder-480B-A35B-Instruct:novita` | 2.8 s | Detailed, verbose | Valid schema, 11.4 s | Did not tool-call | Too slow/uneven for default |
| `deepseek-ai/DeepSeek-V4-Pro:together` | 2.2 s | Strong planning prose | Invalid/truncated JSON in compatible check | Tool-called, but wrong tool for request | Watchlist, not default |
| `google/gemma-4-26B-A4B-it:novita` | 4.5 s | Useful but slower | Valid schema, 4.9 s | Correct tool call, 1.7 s | Structured fallback |
| `google/gemma-4-31B-it:together` | 15.3 s | Usable | Not carried into shortlist | Not carried into shortlist | Too slow |
| `moonshotai/Kimi-K2.6:fireworks-ai` | 1.7 s | Leaked analysis into final text | Invalid/truncated JSON in compatible check | Did not tool-call | Watchlist only |
| `MiniMaxAI/MiniMax-M2.7:fireworks-ai` | 1.0 s | Leaked analysis into final text | Valid schema, 3.2 s | Did not tool-call | Watchlist only |

## Recommended Model Router

| Agent workflow | Primary | Fallbacks | Reasoning setting | Output contract |
|---|---|---|---|---|
| Grounded chat partner | `openai/gpt-oss-120b:groq` | `:cerebras`, `:fireworks-ai`, then `Qwen/Qwen3-Next-80B-A3B-Instruct:novita` | `low` or `medium` | Plain text, max 2-4 sentences by default |
| Challenge / critique | `openai/gpt-oss-120b:groq` | `Qwen/Qwen3-Next-80B-A3B-Thinking:novita` for explicit deep mode | `medium`; thinking model only on demand | Artifact draft or critique brief |
| Synthesis / research brief | `openai/gpt-oss-120b:groq` | `Qwen/Qwen3-Next-80B-A3B-Instruct:novita`, `google/gemma-4-26B-A4B-it:novita` | `medium` | Artifact draft |
| Tool routing | `openai/gpt-oss-120b:groq` | `:cerebras`, `:fireworks-ai`, `Qwen/Qwen3-Coder-Next:novita` | `low` | Tool call only; no prose required |
| Structure proposal planner | `openai/gpt-oss-120b:groq` | `:cerebras`, `:fireworks-ai`, `google/gemma-4-26B-A4B-it:novita` | `medium` | `json_schema` validated proposal |
| Workspace hygiene loops | `openai/gpt-oss-120b:groq` | `Qwen Thinking` for audit mode, Gemma 26B for JSON fallback | `medium` or routed deep | Structured report plus proposed actions |

## Next Leap Implementation Plan

### 1. Add an `agentModelRouter`

Replace single-model assumptions with named profiles:

- `partner_chat`
- `critique`
- `artifact_draft`
- `tool_router`
- `structure_planner`
- `hygiene_scan`
- `deep_audit`

Each profile should define model, provider, reasoning effort, max tokens, response format, fallback chain, and parser strategy.

### 2. Update HF client for provider-specific fallbacks

Current `server/ai/hfTextClient.js` can fall back across models, but not across model/provider pairs. The router needs fallback entries like:

```json
[
  { "model": "openai/gpt-oss-120b", "provider": "groq" },
  { "model": "openai/gpt-oss-120b", "provider": "cerebras" },
  { "model": "openai/gpt-oss-120b", "provider": "fireworks-ai" }
]
```

Provider-specific model suffixes such as `openai/gpt-oss-120b:groq` should also be supported because HF docs use that form for advanced features.

### 3. Make structure planning a first-class agent workflow

`organize_workspace` currently creates a proposal bundle operation, while full `AgentStructureProposal` creation exists in import/system flows. The leap is to let chat invoke:

1. model-generated structure plan,
2. schema validation,
3. conversion into `AgentStructureProposal`,
4. UI review,
5. apply/rollback.

This turns “help me restructure my library” into a real reversible workflow instead of a generic suggestion.

### 4. Separate reasoning from final output

Reasoning is valuable for agentic work, but final user-facing text must stay clean. The app should:

- Preserve reasoning metadata for logs/evaluation when providers expose it separately.
- Strip reasoning blocks and reject responses that begin with meta-analysis for chat UX.
- Use deep reasoning only behind critique/planning/audit workflows where latency is acceptable.
- Validate final artifacts against schemas before saving or showing action buttons.

### 5. Add a recurring model benchmark harness

The live checks should become a repo script, not a one-off:

- `partner_chat_quality`
- `critique_quality`
- `artifact_draft_quality`
- `structure_json_validity`
- `tool_call_correctness`
- `latency`
- `analysis_leakage`

Run it before model changes and store dated artifacts under `tmp/` or `docs/evals/`.

## Final Recommendation

Use `openai/gpt-oss-120b` as the default model family on Hugging Face, routed primarily through Groq with Cerebras and Fireworks fallbacks. Keep Qwen Thinking as a deliberate deep-reasoning mode, not default chat. Keep Gemma 4 26B as a structured-output fallback. Keep Kimi K2.6, MiniMax M2.7, and DeepSeek V4 Pro on the watchlist, but do not make them production defaults until they pass clean-chat, schema, and tool-call checks reliably.

This gets the product closer to the vision: not a smarter autocomplete, but a grounded partner that can converse, challenge, draft, plan, and stage reversible changes to the user's knowledge workspace.
