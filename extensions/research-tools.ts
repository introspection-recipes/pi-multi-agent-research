/**
 * Agent-facing tools for the multi-agent-research recipe.
 *
 * Pi ships the core file/search/shell tools (read, edit, write, grep, find,
 * bash). This extension adds a `todo_write` task-list tool. The lead researcher
 * uses it to externalize its research plan — the decomposed subtasks, which are
 * dispatched, and which are synthesized — so the plan survives a long
 * orchestration loop and stays visible to the user.
 */

import type { ExtensionContext, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

const TodoStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
]);

const TodoItem = Type.Object({
  id: Type.String({
    description: "Stable id for this todo. Reuse the same id when updating an existing item.",
  }),
  content: Type.String({
    description: 'Imperative task text, e.g. "Add input validation to the signup route".',
  }),
  activeForm: Type.String({
    description: 'Present continuous form shown while active, e.g. "Adding input validation".',
  }),
  status: TodoStatus,
});

const TodoWriteParams = Type.Object({
  todos: Type.Array(TodoItem, {
    description:
      "The complete updated todo list for the current session. Keep exactly one item in_progress while working.",
  }),
});

type TodoWriteInput = Static<typeof TodoWriteParams>;
type TodoItemValue = TodoWriteInput["todos"][number];

type TodoWriteDetails = {
  oldTodos: TodoItemValue[];
  newTodos: TodoItemValue[];
  activeTodo: TodoItemValue | null;
};

function reconstructTodos(ctx: ExtensionContext): TodoItemValue[] {
  let todos: TodoItemValue[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role !== "toolResult" || message.toolName !== "todo_write") continue;
    const details = message.details as TodoWriteDetails | undefined;
    if (details?.newTodos) {
      todos = details.newTodos;
    }
  }
  return todos;
}

const extension: ExtensionFactory = (pi) => {
  let todos: TodoItemValue[] = [];

  pi.on("session_start", async (_event, ctx) => {
    todos = reconstructTodos(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    todos = reconstructTodos(ctx);
  });

  pi.registerTool<typeof TodoWriteParams, TodoWriteDetails>({
    name: "todo_write",
    label: "Todo",
    description:
      "Update the session todo list. Use this proactively for non-trivial multi-step work. Always provide the complete list, with content, activeForm, and status for each item. Keep exactly one item in_progress while working, and mark each task completed as soon as it is done.",
    promptSnippet: "Track the current task checklist with pending, in_progress, and completed items.",
    promptGuidelines: [
      "Use todo_write for non-trivial multi-step tasks.",
      "Provide the complete updated todo list on every call.",
      "Keep exactly one item in_progress while actively working.",
      "Mark each task completed as soon as you finish it. Do not batch completions.",
    ],
    parameters: TodoWriteParams,
    async execute(_toolCallId, params) {
      const oldTodos = [...todos];
      const allComplete =
        params.todos.length > 0 && params.todos.every((todo) => todo.status === "completed");
      todos = allComplete ? [] : params.todos;
      const activeTodo = todos.find((todo) => todo.status === "in_progress") ?? null;
      return {
        content: [{ type: "text", text: "Todo list updated." }],
        details: { oldTodos, newTodos: todos, activeTodo },
      };
    },
  });
};

export default extension;
