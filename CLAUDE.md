# CLAUDE.md

## What this is

pi-agent-just fuses [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) (AI agent runtime) with [just-bash](https://github.com/niclas-niclas/just-bash) (TypeScript bash + in-memory FS) into a browser-based coding playground. The AI gets a real shell and filesystem, but everything runs in-process — no Docker, no WASM, no system calls.

## Commands

```bash
pnpm dev              # Start dev server (Turbopack)
npx tsc --noEmit      # Type check (ignore .next/dev/types/validator.ts)
pnpm build            # Production build
```

## Core architecture

```
app/api/agent/singleton.ts    ← The heart: OverlayFs + Bash + AgentSession singleton
app/api/agent/route.ts        ← SSE streaming endpoint
app/api/agent/command/        ← Slash command API (/compact, /session)
app/api/checkpoint/           ← Conversation + FS snapshot rollback
app/api/model/                ← Model switching
app/api/sandbox/              ← File change list + session reset
app/components/chat/          ← Chat UI, slash commands, SSE parsing
app/components/code-studio/   ← File tree, code viewer, live preview
components/ai-elements/       ← Shared chat primitives (don't modify unless necessary)
```

### The adapter pattern

pi-coding-agent defines tool **operations interfaces** (`BashOperations`, `ReadOperations`, etc.). The `singleton.ts` adapter functions implement them by delegating to just-bash's `OverlayFs` and `Bash`. This is the only glue code between the two systems — ~150 lines total.

```
pi-coding-agent tool  →  adapter function  →  OverlayFs / Bash method
bash                     createJustBashOps     Bash.exec()
read                     createOverlayReadOps  OverlayFs.readFile()
write                    createOverlayWriteOps OverlayFs.writeFile()
edit                     createOverlayEditOps  readFile + writeFile
ls                       createOverlayLsOps    readdir + stat + exists
find                     createOverlayFindOps  recursive walk + minimatch
grep                     createOverlayGrepOps  readFile + isDirectory
```

### Adding a tool

1. Import `createXTool` + `type XOperations` from `@mariozechner/pi-coding-agent`
2. Write `createOverlayXOps(fs: OverlayFs): XOperations` adapter
3. Add to `sandboxedTools` map
4. Update system prompt

### SSE streaming

`route.ts` streams agent events as `data: {json}\n\n`. The frontend `useChatAgent.ts` hook parses them. Key events: `text-delta`, `tool-call-started`, `tool-input-available`, `tool-output-available`, `finish` (with usage).

### Filesystem snapshots

Each agent turn, `OverlayFs.snapshot()` is stored keyed by entry ID. Rollback restores both conversation tree and FS state atomically.

## Environment

- `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` (OpenRouter takes priority)
- `PI_MODEL` — defaults to `claude-haiku-4.5`

## Guidelines

- UI: shadcn/ui + Lucide icons + Tailwind CSS 4 with shadcn tokens
- File operations must go through OverlayFs adapters, never real filesystem
- Always `npx tsc --noEmit` after changes
