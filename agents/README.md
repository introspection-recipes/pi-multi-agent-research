# Agents

Each `*.yaml` here is a Pi agent definition loaded via the `pi.agents` glob in `package.json`.

| Agent | Role | Model | Tools |
|---|---|---|---|
| `agent` | Lead researcher / orchestrator (default agent) | opus | todo_write, WebSearch, WebFetch, read, write |
| `research` | Parallel research worker | sonnet | WebSearch, WebFetch |
| `citations` | Final citation / attribution pass | sonnet | WebFetch |

The lead spawns `research` and `citations` via the auto-added `agent` tool (start a child with `name` + `task`; it runs in the background, collect it with the `status` action). Each name in a `subagents` list must match another agent's `name` field — the runtime validates this and refuses to load the recipe otherwise. The `agent` tool is added automatically to any agent that declares `subagents`.

## Schema

```yaml
name: <agent name>            # the value used as the `name` arg of the agent tool
description: <when to use>     # surfaced to the lead for delegation decisions
model:                        # optional; omit to inherit the session/default model
  name: anthropic/claude-opus-4-8
  reasoning_effort: high      # off | minimal | low | medium | high | xhigh
tools: [WebSearch, WebFetch]
skills: [research-process]    # skill names the agent may load
subagents: [research, citations]  # spawnable subagents; each must match an agent name
system_instructions:
  mode: replace | append      # replace = standalone prompt; append = add to SYSTEM.md
  content: |
    ...
```

The lead `agent` uses `mode: append` so it inherits `SYSTEM.md` and adds orchestration guidance. `research` and `citations` use `mode: replace` because each ships a complete standalone system prompt. The agent YAML schema is strict (`additionalProperties: false`) — only the fields above are allowed.
