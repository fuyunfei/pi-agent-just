# pi-agent-just

A browser-based AI coding playground that fuses two independent systems — [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) (AI agent runtime) and [just-bash](https://github.com/niclas-niclas/just-bash) (TypeScript bash interpreter with in-memory filesystem) — into a single sandboxed environment where AI writes and executes real code, entirely in memory.

## Why this matters

Most AI coding tools either generate code as text (no execution) or require a real OS-level sandbox (Docker, VM, WASM). This project takes a third path:

**The AI agent gets a real bash shell and filesystem, but everything runs in-process in pure TypeScript.** No containers, no WASM, no system calls. The agent can `write` a file, `bash` run a script, `grep` through results — the same workflow a human developer uses — but the entire execution happens in a JavaScript runtime. Files exist only in memory. The sandbox is zero-cost to create, instant to snapshot, and trivial to rollback.

This is made possible by the adapter layer between the two systems:

```
pi-coding-agent                    just-bash
┌─────────────────┐               ┌─────────────────┐
│  AgentSession   │               │    OverlayFs    │
│  ┌───────────┐  │   adapters    │  (in-memory VFS) │
│  │ bash tool │──┼───────────────┼──▶ Bash          │
│  │ read tool │──┼───────────────┼──▶ readFile      │
│  │ write tool│──┼───────────────┼──▶ writeFile     │
│  │ edit tool │──┼───────────────┼──▶ read+write    │
│  │ ls tool   │──┼───────────────┼──▶ readdir+stat  │
│  │ find tool │──┼───────────────┼──▶ glob walk     │
│  │ grep tool │──┼───────────────┼──▶ readFile      │
│  └───────────┘  │               └─────────────────┘
│  Model, Session,│
│  Compaction,    │
│  Context mgmt   │
└─────────────────┘
```

Each pi-coding-agent tool defines an **operations interface** (`BashOperations`, `ReadOperations`, etc.). The adapter functions in `singleton.ts` implement these interfaces by delegating to just-bash's `OverlayFs` and `Bash` classes. The agent doesn't know it's running in a virtual filesystem — it uses the same tools it would use on a real system.

## Architecture

```
Browser                              Server (Next.js)
┌──────────────────────────────┐    ┌──────────────────────────────┐
│                              │    │                              │
│  Code Studio    │  Chat      │    │  /api/agent (SSE stream)     │
│  ┌────────────┐ │            │    │    │                         │
│  │ File Tree  │ │  Messages  │    │    ▼                         │
│  │ (sidebar)  │ │  + Tools   │◀──▶│  AgentSession (singleton)   │
│  ├────────────┤ │  + Slash   │ SSE│    │                         │
│  │ Code View  │ │  Commands  │    │    ├─ Agent loop (LLM calls) │
│  │ (Shiki)    │ │            │    │    ├─ Tool execution          │
│  ├────────────┤ │  Token/    │    │    └─ Context management     │
│  │ Preview    │ │  Cost      │    │                              │
│  │ (iframe/   │ │  Tracking  │    │  OverlayFs + Bash            │
│  │  Sandpack) │ │            │    │  (pure in-memory sandbox)    │
│  └────────────┘ │            │    │                              │
└──────────────────────────────┘    └──────────────────────────────┘
```

The server maintains a **singleton** that persists across requests: one `OverlayFs` instance, one `Bash` instance, one `AgentSession`. Each user message triggers an agent loop that may invoke multiple tools, all operating on the same in-memory filesystem. The browser polls for file changes and renders them in real-time.

### Filesystem snapshots

Every agent turn, the `OverlayFs` state is snapshotted and keyed by session entry ID. Users can rollback to any previous checkpoint — both the conversation history and the filesystem state are restored atomically. This is only practical because the filesystem is pure data structures in memory.

## Quick Start

```bash
pnpm install

# Set API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
# or: OPENROUTER_API_KEY=sk-or-...

pnpm dev
```

## License

Apache-2.0
