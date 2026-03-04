# SSE Tool Call Card Timing

## Problem

Tool call cards in the chat UI sometimes appear late — the user sees the model "thinking" with no visual feedback, then cards pop in all at once. This varies by model provider.

## Root Cause

pi-agent-core emits tool call events in three phases:

```
Model streaming                          Tool execution
─────────────────────────────────────    ──────────────────────────
toolcall_start → toolcall_delta → toolcall_end → tool_execution_start → tool_execution_end
   (id, name)      (args JSON)      (full args)     (id, name, args)        (result)
```

These surface as `message_update` events with `assistantMessageEvent.type`:

| pi-agent-core event | SSE event sent to frontend | Data available |
|---|---|---|
| `toolcall_start` | `tool-call-started` | `id`, `toolName`, no args |
| `toolcall_end` | `tool-input-available` | `id`, `toolName`, full `args` |
| `tool_execution_start` | `tool-call-started` | `id`, `toolName`, `args` |
| `tool_execution_end` | `tool-output-available` | `id`, `result` |

### Model behavior differences

- **Anthropic (Claude):** Streams `toolcall_start` early, then `toolcall_delta` incrementally, then `toolcall_end`. Cards appear quickly.
- **Google (Gemini), DeepSeek, others:** May not stream tool calls incrementally. `toolcall_start`, `toolcall_delta`, and `toolcall_end` arrive nearly simultaneously, right before execution. Cards appear late.

## Solution

Handle `toolcall_start` in `route.ts` to create the card immediately when the model begins generating a tool call — even before args are available:

```typescript
// route.ts — inside session.subscribe()
else if (inner.type === "toolcall_start") {
    const partial = inner.partial;
    const tc = partial.content?.findLast(
        (c: { type: string }) => c.type === "toolCall",
    ) as { id: string; name: string } | undefined;
    if (tc) {
        enqueue({
            type: "tool-call-started",
            toolCallId: tc.id,
            toolName: tc.name,
            input: {},  // no args yet
        });
    }
}
```

The frontend (`useChatAgent.ts`) already handles deduplication — if a card exists when later events arrive (`tool-input-available`, `tool-call-started` from execution), it updates rather than creates a duplicate.

## Frontend deduplication flow

```
tool-call-started (from toolcall_start)
  → partsTracker has no card → CREATE card (empty args, running)

tool-input-available (from toolcall_end)
  → partsTracker has card → UPDATE args

tool-call-started (from tool_execution_start)
  → partsTracker has card → UPDATE args (merge)

tool-output-available (from tool_execution_end)
  → UPDATE state to completed
```

## Files

- `app/api/agent/route.ts` — SSE event mapping (backend → frontend)
- `app/components/chat/useChatAgent.ts` — SSE parsing + card state management
- `app/components/chat/ChatPanel.tsx` — `ToolCallCard` rendering

## Key design note

The `toolcall_start` event from `message_update` provides tool info via `inner.partial.content` (the partial `AssistantMessage`), not directly on the event. The last `toolCall` content item in the array is the one being started. The `toolcall_end` event provides the complete `ToolCall` object directly via `inner.toolCall`.
