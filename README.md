# pi-agent-just

English | [中文](./README.zh-CN.md)

A browser-based AI coding playground that fuses two independent systems — [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) (AI agent runtime) and [just-bash](https://github.com/niclas-niclas/just-bash) (TypeScript bash interpreter with in-memory filesystem) — into a single sandboxed environment where AI writes and executes real code, entirely in memory.

Currently focused on **Remotion motion graphics**: AI generates React video components, the browser previews them in real-time, and Lambda renders MP4 exports in the cloud.

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

## Architecture

```
Browser                              Server (Next.js)
┌──────────────────────────────┐    ┌──────────────────────────────┐
│                              │    │                              │
│  Player          │  Chat     │    │  /api/agent (SSE stream)     │
│  ┌────────────┐  │           │    │    │                         │
│  │ Remotion   │  │  Messages │    │    ▼                         │
│  │ Player     │  │  + Tools  │◀──▶│  AgentSession (singleton)   │
│  ├────────────┤  │  + Slash  │ SSE│    │                         │
│  │ Segmented  │  │  Commands │    │    ├─ Agent loop (LLM calls) │
│  │ progress   │  │           │    │    ├─ Tool execution          │
│  ├────────────┤  │  Token/   │    │    └─ Context management     │
│  │ Export     │  │  Cost     │    │                              │
│  │ (clip pick)│  │  Tracking │    │  OverlayFs + Bash            │
│  └────────────┘  │           │    │  (pure in-memory sandbox)    │
│                              │    │                              │
└──────────────────────────────┘    └──────────────────────────────┘
```

### Remotion compiler

AI-generated TSX can't run directly — it has import statements and JSX syntax. The compiler solves this:

```
AI-generated TSX ──▶ @babel/standalone transpile ──▶ new Function()
                                                          │
                                        50+ pre-injected Remotion APIs
                                        (AbsoluteFill, spring, interpolate,
                                         Shapes, Transitions, Three.js...)
```

`stripImports()` removes import statements, `extractComponentBody()` extracts the component function body, Babel transpiles JSX/TypeScript, and `new Function()` creates the React component with all Remotion APIs injected as parameters. The compiler lives in `lib/remotion-compile.ts` and is shared between browser preview and Lambda render.

### Multi-scene playback

Long videos are split by the AI into multiple scene files (`scene-01-intro.tsx`, `scene-02-main.tsx`...). The player auto-discovers all Remotion files, compiles each independently, and plays them in filename order:

```
scene-01 ends ──▶ auto-advance to scene-02 ──▶ scene-03 ──▶ loop
     │                       │                      │
     └── segmented progress bar: proportional, click to seek ──┘
```

### Lambda export

```
User selects clips ──▶ POST /api/render ──▶ renderMediaOnLambda()
                                                   │
                                         Lambda loads S3 bundle
                                         DynamicComp compiles each scene
                                         <Sequence> composition
                                         outputs MP4 to S3
                                                   │
User polls progress ◀── POST /api/render/progress ◀┘
Downloads MP4       ◀── S3 presigned URL
```

Single scene renders directly. Multiple scenes are composed with `<Sequence>` into one continuous video. Each scene is compiled independently — no naming conflicts.

## Quick Start

```bash
pnpm install

# Set API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
# or: OPENROUTER_API_KEY=sk-or-...

pnpm dev
```

### Lambda export (optional)

```bash
# Set AWS credentials
echo "REMOTION_AWS_ACCESS_KEY_ID=..." >> .env.local
echo "REMOTION_AWS_SECRET_ACCESS_KEY=..." >> .env.local

# Deploy Lambda function + S3 site bundle
node deploy.mjs
```

## License

Apache-2.0
