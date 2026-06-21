# Skills

Each `<name>/SKILL.md` here is a Pi skill loaded via the `pi.skills` glob in `package.json`. A skill is a reusable instruction bundle the agent reads on demand (with the `read` tool) when a task matches its description.

| Skill | Purpose |
|---|---|
| `research-process` | The lead researcher's end-to-end workflow: assess the question type, plan and scale effort, decompose into parallel subagent briefs, synthesize findings, and run the citation pass. The lead loads this at the start of every research task. |

## Schema

```markdown
---
name: <skill name>
description: <when to load this skill>
allowed-tools: <comma-separated tool names the skill expects>
---

# <Title>

...instructions...
```
