# Extensions

Pi extensions loaded at runtime from this directory via the `pi.extensions` glob in `package.json`. An extension is a TypeScript module whose default export is an `ExtensionFactory` `(pi) => void`. It can register tools, subscribe to lifecycle events (hooks), and add commands/shortcuts.

| Extension | Purpose |
|-----------|---------|
| `web-tools.ts` | The research system's data access. `WebSearch` (backed by the [Parallel AI Search API](https://docs.parallel.ai)) and `WebFetch` (native `fetch()`), both real client-side tools. The lead and every research subagent depend on these. |
| `research-tools.ts` | Registers the `todo_write` task-list tool the lead uses to externalize and track its research plan across a long orchestration loop. |

## Web search

Pi has no built-in web tools and no native web search, so `WebSearch` is implemented against the **Parallel AI Search API** (`POST https://api.parallel.ai/v1/search`, `x-api-key` auth). It maps the agent's `query` to Parallel's `objective` + `search_queries`, requests compressed per-result excerpts, applies `allowed_domains` / `blocked_domains` filtering client-side, and returns markdown result blocks. Configure via environment:

| Env var | Purpose | Default |
|---|---|---|
| `PARALLEL_API_KEY` | API key (required for WebSearch) | — |
| `PARALLEL_SEARCH_PROCESSOR` | processor tier: `base` or `pro` | `base` |
| `PARALLEL_SEARCH_MAX_RESULTS` | max results per search | `5` |

If `PARALLEL_API_KEY` is unset, `WebSearch` returns an actionable error instead of failing silently. To swap in a different search backend, change the `WebSearch` `execute` body — the tool name and prompt stay the same.

## Hooks

Pi's equivalent of Claude Code's user-configured "hooks" is event subscriptions via `pi.on(...)`. The available events include `session_start`, `before_agent_start`, `tool_call` (can block), `tool_result`, `turn_start`/`turn_end`, and more. `research-tools.ts` uses `session_start` and `session_tree` to reconstruct the todo list when a session is resumed or navigated.

To add a tool or hook, drop a new `*.ts` file (or `<name>/index.ts`) here and export an `ExtensionFactory`.
