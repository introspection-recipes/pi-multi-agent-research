# multi-agent-research Recipe

An Introspection (Pi) recipe that reproduces **Anthropic's multi-agent research system** — the orchestrator-worker architecture from [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — as a runnable Pi agent.

A **lead researcher** (Opus) analyzes a question, decomposes it into independent slices, and dispatches **research subagents** (Sonnet) that search the web in parallel. The lead synthesizes their findings, then a **citation agent** attaches precise sources before the answer is returned. It follows the same recipe layout as the `pi-claude-recipe` and `nextplay-recipe` examples.

## What This Is

An Introspection recipe is a package of runtime behavior. This repository contains:

- `.introspection/multi-agent-research-agent.yaml`: the GitOps manifest Introspection discovers.
- `SYSTEM.md`: the shared research-agent foundation (identity + operating principles) inherited by the lead.
- `agents/agent.yaml`: the default runnable agent — the **lead researcher** (orchestrator).
- `agents/research.yaml`: the parallel **research worker** (agent name `research`) the lead spawns.
- `agents/citations.yaml`: the **citation agent** that runs the final attribution pass.
- `skills/research-process/`: the lead's end-to-end workflow (assess → plan → delegate → synthesize → cite).
- `extensions/`: the web tools (`WebSearch`, `WebFetch`) and the `todo_write` planning tool.

When you create a runtime from this repo, Introspection reads the manifest, pins the selected git commit, and launches the default agent (`agent`, the lead researcher).

## How It Maps to the Article

| Article concept | Where it lives here |
|---|---|
| Orchestrator-worker architecture | `agents/agent.yaml` (lead) + `agents/research.yaml` (workers) |
| Lead agent: decompose, scale effort, delegate | `agents/agent.yaml` + `skills/research-process/SKILL.md` |
| Subagents search 3+ tools in parallel; OODA loop | `agents/research.yaml` |
| Lead spawns subagents in parallel, not serially (up to 6 concurrent) | delegation guidance in the lead prompt + skill |
| Effort scaling (1 / 2-4 / 10+ subagents) | the scaling table in `skills/research-process/SKILL.md` |
| CitationAgent (final attribution pass) | `agents/citations.yaml` |
| Broad-to-narrow search, source-quality heuristics | `SYSTEM.md` operating principles |
| Web search + retrieval tools | `extensions/web-tools.ts` (`WebSearch` via Parallel AI, `WebFetch` via native `fetch()`) |
| Plan as a controllable scratchpad | `todo_write` in `extensions/research-tools.ts` |

Model assignment follows the article: **Opus** lead, **Sonnet** subagents. Pi's tool names are used throughout (`WebSearch`, `WebFetch`, `read`, `write`, `todo_write`). The lead's `subagents` list (`research`, `citations`) is what makes those agents spawnable; the runtime validates each name against an agent in `agents/`, auto-adds the `agent` tool to the lead, and the lead starts each child with `name` + `task`.

## Repository Layout

```text
.introspection/
  multi-agent-research-agent.yaml
README.md
SYSTEM.md
package.json
agents/
  README.md
  agent.yaml              # lead researcher (orchestrator)
  research.yaml           # parallel research worker
  citations.yaml          # final citation pass
skills/
  README.md
  research-process/
    SKILL.md
extensions/
  README.md
  web-tools.ts            # WebSearch + WebFetch
  research-tools.ts       # todo_write (planning)
```

## Configure

`WebSearch` is backed by the [Parallel AI Search API](https://docs.parallel.ai) and needs an API key in the recipe environment:

| Env var | Purpose | Default |
|---|---|---|
| `PARALLEL_API_KEY` | API key (required for WebSearch) | — |
| `PARALLEL_SEARCH_PROCESSOR` | processor tier: `base` or `pro` | `base` |
| `PARALLEL_SEARCH_MAX_RESULTS` | max results per search | `5` |

Without `PARALLEL_API_KEY`, `WebSearch` returns an actionable error (research depends on it). `WebFetch` needs no key. To swap in a different search backend, change the `WebSearch` `execute` body in `extensions/web-tools.ts` — the tool name and prompt stay the same.

## Customize

Edit these files first:

- `agents/agent.yaml` — the lead's delegation strategy, effort scaling, and model.
- `skills/research-process/SKILL.md` — the decomposition/synthesis workflow and brief template.
- `agents/research.yaml` — how individual workers search and what they return.
- `agents/citations.yaml` — citation style and strictness.
- `SYSTEM.md` — shared principles for every agent in the system.
