# Hugging Face Model Evaluation

Date: 2026-04-22

## Scope

This evaluation is for the current app integration path:

- Router: `https://router.huggingface.co/v1/chat/completions`
- Provider: `novita`
- Request shape: OpenAI-compatible chat completion with `reasoning_effort: "low"`

The goal is not "best model on the internet". The goal is "best model that works well on the exact Hugging Face path this app is using today."

## Sources

- Hugging Face Inference Providers Hub API:
  - https://huggingface.co/docs/inference-providers/hub-api
- Hugging Face Chat Completion docs:
  - https://huggingface.co/docs/inference-providers/tasks/chat-completion
- Hugging Face Novita provider docs:
  - https://huggingface.co/docs/inference-providers/en/providers/novita
- Representative model cards:
  - https://huggingface.co/openai/gpt-oss-120b
  - https://huggingface.co/Qwen/Qwen3-Coder-Next
  - https://huggingface.co/deepseek-ai/DeepSeek-V3.1
  - https://huggingface.co/Qwen/Qwen3.5-35B-A3B

## Executive Summary

- Best default to try first: `openai/gpt-oss-120b`
- Best conservative fallback: `Qwen/Qwen3.5-35B-A3B`
- Best coding-focused option: `Qwen/Qwen3-Coder-Next`
- Best second fast general option: `deepseek-ai/DeepSeek-V3.1`

Reasoning:

- `openai/gpt-oss-120b` was the fastest model tested by a wide margin on your live HF+Novita path while still passing structured JSON output checks.
- `Qwen/Qwen3.5-35B-A3B` is a known-good model in this repo and produces solid outputs, but it is much slower and burns substantial reasoning tokens even on simple tasks.
- `Qwen/Qwen3-Coder-Next` is extremely fast, deterministic, and a strong fit if the agent becomes more code- or tool-centric.
- `deepseek-ai/DeepSeek-V3.1` is viable, but slower than `gpt-oss-120b` and not clearly better for your current use case.

## Inventory

Hugging Face Hub API currently lists:

- 49 Novita-backed text/chat models for `pipeline_tag=text-generation`
- 21 Novita-backed vision/chat models for `pipeline_tag=image-text-to-text`

This app currently uses text chat models only.

## Shortlist Matrix

Benchmarks below used two prompts:

1. `thought_partner`
2. `structured_json`

All requests used your current provider and request shape, including `reasoning_effort: "low"`.

| Model | HF/Novita mapping | Thought prompt | JSON prompt | Notes | Verdict |
| --- | --- | --- | --- | --- | --- |
| `openai/gpt-oss-120b` | live / conversational | 345-678 ms across 3 runs | 360 ms, valid JSON | Fastest tested. No visible reasoning leakage. `reasoning_tokens=0` in tested calls. | Best default |
| `Qwen/Qwen3.5-35B-A3B` | live / conversational | 8.1-11.8 s across 3 runs | 9.3 s, valid JSON | Strong quality, already used here, but expensive in latency and reasoning token overhead. | Best conservative fallback |
| `deepseek-ai/DeepSeek-V3.1` | live / conversational | 8.6-9.8 s across 3 runs | 3.1 s, valid JSON | Good general model. Slower than `gpt-oss-120b`. | Good secondary option |
| `Qwen/Qwen3-Coder-Next` | live / conversational | 2.6 s | 1.3 s, valid JSON | Very fast. Model card says it is designed for coding agents and non-thinking mode. | Best coding-focused choice |
| `Qwen/Qwen3-Coder-480B-A35B-Instruct` | live / conversational | 2.0 s | 1.1 s, valid JSON | Strong coding-oriented alternative. | Good if you want a larger coder model |
| `openai/gpt-oss-20b` | live / conversational | 809 ms | 351 ms, valid JSON | Very fast, likely cheaper/lighter than 120b. | Best budget option to test |
| `Qwen/Qwen3.5-122B-A10B` | live / conversational | 9.8 s | 11.1 s, valid JSON | Better than expected, but not compelling versus `gpt-oss-120b`. | Not worth defaulting to |
| `Qwen/Qwen3.5-27B` | live / conversational | 13.4 s | 13.8 s, valid JSON | Slower than the 35B A3B in tests. | Do not use as primary |
| `moonshotai/Kimi-K2-Instruct` | live / conversational | 7.9 s | 2.0 s, valid JSON | Usable. Not clearly better than top options. | Optional alternative |
| `deepseek-ai/DeepSeek-R1-0528` | live / conversational | 5.4 s | 4.0 s, invalid raw JSON in test | Emits `<think>` blocks in raw output. Can be cleaned, but it is not ideal for strict structured output. | Avoid as default |
| `meta-llama/Llama-3.3-70B-Instruct` | live / conversational | 400 on current request shape | 400 on current request shape | Works without `reasoning_effort`, fails with your current payload. | Needs code change |
| `zai-org/GLM-5` | live / conversational | 503 | 503 | Listed, but not reliable in live test. | Avoid for now |

## Recommended Choice

### Primary

Use `openai/gpt-oss-120b` as the main default model for the current agent.

Why:

- Fastest measured by a large margin on your live route.
- Clean structured output behavior.
- Compatible with your current request shape.
- No hidden reasoning-token bloat showed up in the benchmark.

### Fallback 1

Use `Qwen/Qwen3.5-35B-A3B`.

Why:

- Already proven in this codebase.
- Reliable with the current `reasoning_effort` field.
- Good general reasoning quality.

### Fallback 2

Use `Qwen/Qwen3-Coder-Next` if the agent becomes more coding/tool heavy, otherwise `deepseek-ai/DeepSeek-V3.1`.

## Full Text Model Inventory

### Strongest current candidates

- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`
- `Qwen/Qwen3-Coder-Next`
- `Qwen/Qwen3-Coder-480B-A35B-Instruct`
- `Qwen/Qwen3.5-35B-A3B`
- `deepseek-ai/DeepSeek-V3.1`
- `moonshotai/Kimi-K2-Instruct`

### Compatible with current request shape, but lower priority

- `MiniMaxAI/MiniMax-M2.7`
- `deepseek-ai/DeepSeek-R1`
- `meta-llama/Meta-Llama-3-8B-Instruct`
- `MiniMaxAI/MiniMax-M2.5`
- `deepseek-ai/DeepSeek-V3`
- `Qwen/Qwen3-Next-80B-A3B-Instruct`
- `deepseek-ai/DeepSeek-V3.2-Exp`
- `zai-org/GLM-4.7`
- `deepseek-ai/DeepSeek-R1-Distill-Llama-70B`
- `zai-org/GLM-4.5-Air`
- `moonshotai/Kimi-K2-Thinking`
- `XiaomiMiMo/MiMo-V2-Flash`
- `zai-org/GLM-4.7-Flash`
- `Qwen/Qwen3-30B-A3B`
- `Qwen/Qwen3-235B-A22B`
- `meta-llama/Meta-Llama-3-70B-Instruct`
- `Sao10K/L3-70B-Euryale-v2.1`
- `zai-org/GLM-4.6`
- `MiniMaxAI/MiniMax-M2.1`
- `Sao10K/L3-8B-Stheno-v3.2`
- `Qwen/Qwen2.5-72B-Instruct`
- `moonshotai/Kimi-K2-Instruct-0905`
- `deepseek-ai/DeepSeek-V3-0324`
- `zai-org/GLM-4-32B-0414`
- `deepseek-ai/DeepSeek-Prover-V2-671B`
- `MiniMaxAI/MiniMax-M1-80k`
- `baidu/ERNIE-4.5-300B-A47B-Base-PT`
- `baidu/ERNIE-4.5-21B-A3B-PT`
- `zai-org/GLM-4.5`
- `Qwen/Qwen3-235B-A22B-Thinking-2507`
- `Qwen/Qwen3.5-27B`
- `Qwen/Qwen3.5-122B-A10B`
- `deepseek-ai/DeepSeek-V3.1-Terminus`
- `Qwen/Qwen3-Next-80B-A3B-Thinking`
- `MiniMaxAI/MiniMax-M2`

### Listed on Novita, but not a good fit for the current app path

- `meta-llama/Llama-3.1-8B-Instruct`
  - Fails because `reasoning_effort` is unsupported.
- `meta-llama/Llama-3.2-1B-Instruct`
  - Fails because `reasoning_effort` is unsupported.
- `Qwen/Qwen3-32B`
  - Expects a different `reasoning_effort` value contract.
- `Qwen/Qwen3-235B-A22B-Instruct-2507`
  - Fails because `reasoning_effort` is unsupported.
- `meta-llama/Llama-3.3-70B-Instruct`
  - Fails because `reasoning_effort` is unsupported.
- `deepseek-ai/DeepSeek-V3.2`
  - Listed, but not a chat model on this endpoint.
- `zai-org/GLM-5`
  - Returned `503 Service Unavailable` in live testing.
- `alpindale/WizardLM-2-8x22B`
  - Timed out in live testing.
- `Sao10K/L3-8B-Lunaris-v1`
  - Fails because `reasoning_effort` is unsupported.

## Vision Model Inventory

Novita-backed image-text-to-text models currently listed by Hugging Face:

- `moonshotai/Kimi-K2.6`
- `google/gemma-4-31B-it`
- `google/gemma-4-26B-A4B-it`
- `moonshotai/Kimi-K2.5`
- `Qwen/Qwen3.5-27B`
- `Qwen/Qwen3.5-35B-A3B`
- `Qwen/Qwen3.5-397B-A17B`
- `Qwen/Qwen3-VL-8B-Instruct`
- `Qwen/Qwen3.5-122B-A10B`
- `Qwen/Qwen3-VL-30B-A3B-Instruct`
- `zai-org/GLM-4.5V`
- `deepseek-ai/DeepSeek-OCR`
- `meta-llama/Llama-4-Scout-17B-16E-Instruct`
- `Qwen/Qwen3-VL-235B-A22B-Thinking`
- `zai-org/GLM-4.6V-Flash`
- `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8`
- `baidu/ERNIE-4.5-VL-424B-A47B-Base-PT`
- `baidu/ERNIE-4.5-VL-28B-A3B-PT`
- `Qwen/Qwen3-VL-235B-A22B-Instruct`
- `Qwen/Qwen3-VL-30B-A3B-Thinking`
- `zai-org/AutoGLM-Phone-9B-Multilingual`

These are not part of the current agent path because the app is calling text chat only.

## Practical Recommendation

If you want one model choice today without changing your app request shape:

1. Primary: `openai/gpt-oss-120b`
2. Fallback: `Qwen/Qwen3.5-35B-A3B`
3. Coding variant: `Qwen/Qwen3-Coder-Next`

If you want the broadest future model compatibility, the next engineering improvement is not a different model. It is making `reasoning_effort` optional per model/provider so the app can use the Llama and some Qwen variants that currently reject that field.

## Addendum: Latest-Model Sweep

After a deeper pass specifically prompted by Qwen 3.x, Kimi, and Gemma 4:

- There are currently zero `qwen3.7` model IDs on the Hugging Face Hub API search.
- There are also zero `qwen3.7` models on the current Novita-backed Hugging Face inventory.
- The strongest current Qwen options on this route are not the older repo default. They are:
  - `Qwen/Qwen3-Coder-Next`
  - `Qwen/Qwen3-Next-80B-A3B-Instruct`
  - `Qwen/Qwen3-Next-80B-A3B-Thinking`

### Revised comparison of the newest relevant candidates

| Model | Current HF path behavior | Structured JSON | Latency | Revised take |
| --- | --- | --- | --- | --- |
| `openai/gpt-oss-120b` | Strong direct content output | Mixed in latest rerun because output was truncated at token cap, but generally good | ~416-678 ms | Still the strongest general default on your route |
| `Qwen/Qwen3-Coder-Next` | Clean direct content | Passed | ~1.3-1.8 s | Best Qwen choice overall if you want modern Qwen on this route |
| `Qwen/Qwen3-Next-80B-A3B-Instruct` | Clean direct content | Passed | ~1.3-2.2 s | Best non-coder Qwen choice |
| `Qwen/Qwen3-Next-80B-A3B-Thinking` | High quality but heavy reasoning overhead | Passed | ~4.6-8.6 s | Good but slower and more expensive |
| `deepseek-ai/DeepSeek-V3.1` | Good direct content | Passed | ~2.8-7.7 s | Solid, but not best-in-class here |
| `google/gemma-4-26B-A4B-it` | Works only when `reasoning_effort` is omitted | Failed strict JSON in test due to fenced output | ~2.3-4.1 s | Viable after code changes, not best default today |
| `google/gemma-4-31B-it` | Works only when `reasoning_effort` is omitted | Failed strict JSON in test due to fenced output | ~20-26 s | Too slow for your default agent |
| `moonshotai/Kimi-K2.5` | Returned meta-reasoning in `content` | Failed | ~3.3-5.3 s | Not a good fit on this HF route |
| `moonshotai/Kimi-K2.6` | Returned blank `content` and reasoning in separate field | Failed on current extractor | ~3.4-5.1 s | Not usable with your current integration |
| `Qwen/Qwen3.5-397B-A17B` | Returned blank `content` and reasoning-only output | Failed on current extractor | ~3.0 s | Not usable with your current integration |

### Revised recommendation

If you want the most thorough answer for the exact route your app uses today:

1. Primary general model: `openai/gpt-oss-120b`
2. Best Qwen model: `Qwen/Qwen3-Coder-Next`
3. Best non-coder Qwen model: `Qwen/Qwen3-Next-80B-A3B-Instruct`
4. Best model worth testing after a small integration cleanup: `google/gemma-4-26B-A4B-it`

This changes the earlier Qwen recommendation materially:

- `Qwen3.5-35B-A3B` is not the best current Qwen-family choice on HF+Novita.
- It remains a stable fallback only because your repo was already wired around it.
- If you are choosing fresh today, prefer `Qwen3-Coder-Next` or `Qwen3-Next-80B-A3B-Instruct`.
