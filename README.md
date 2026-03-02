# pi-agent-just

English | [中文](./README.zh-CN.md)

An AI-powered motion graphics generator. Describe what you want, and the AI creates animated videos using [Remotion](https://remotion.dev) (React-based video framework). Preview instantly in the browser, export as MP4 via AWS Lambda.

Built on [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) (AI agent runtime) + [just-bash](https://github.com/niclas-niclas/just-bash) (in-memory TypeScript bash/filesystem).

## How it works

```
User: "Create a 60s product launch video"
         │
         ▼
   AI Agent generates Remotion .tsx files
         │
         ▼
   ┌─────────────────────────────────┐
   │  Browser Preview                │
   │  ┌───────────────────────────┐  │
   │  │     Remotion Player       │  │
   │  │  (live compile + render)  │  │
   │  └───────────────────────────┘  │
   │  ━━━━━━━●━━━━━━━━━━━━━━━━━━━━  │
   │  Intro    Features    Outro    │
   └─────────────────────────────────┘
         │
         ▼  Export
   AWS Lambda → MP4 (single or multi-scene)
```

- **Preview**: AI-generated Remotion code is compiled in-browser via `@babel/standalone` + `new Function()` with 50+ injected Remotion APIs. Multi-scene files play as a seamless playlist with a segmented progress bar.
- **Export**: Selected scenes are sent to AWS Lambda, compiled and composed with `<Sequence>`, rendered as a single MP4. Per-clip or full video export via hover checkbox UI.
- **Sandbox**: The AI agent writes code to an in-memory filesystem (OverlayFs). No Docker, no WASM — pure TypeScript.

## Quick Start

```bash
pnpm install

# Set API key (OpenRouter recommended for model variety)
echo "OPENROUTER_API_KEY=sk-or-..." > .env.local
# or: ANTHROPIC_API_KEY=sk-ant-...

pnpm dev
```

### MP4 Export (optional)

Requires AWS credentials and a one-time Lambda deployment:

```bash
# Add to .env.local
REMOTION_AWS_ACCESS_KEY_ID=...
REMOTION_AWS_SECRET_ACCESS_KEY=...

# Deploy Lambda function + S3 site bundle
node deploy.mjs
```

## Architecture

```
Browser                              Server (Next.js)
┌──────────────────────────────┐    ┌──────────────────────────────┐
│                              │    │                              │
│  Video Player  │  Chat       │    │  /api/agent (SSE stream)     │
│  ┌────────────┐│             │    │    │                         │
│  │ Remotion   ││  Prompt     │    │    ▼                         │
│  │ Player     ││  + Tools   │◀──▶│  AgentSession (singleton)    │
│  ├────────────┤│  + Models   │ SSE│    │                         │
│  │ Progress   ││             │    │    ├─ Agent loop (LLM calls) │
│  │ Bar        ││  Token/     │    │    ├─ Tool execution         │
│  ├────────────┤│  Cost       │    │    └─ Context management     │
│  │ Export     ││  Tracking   │    │                              │
│  │ Controls   ││             │    │  /api/render → AWS Lambda    │
│  └────────────┘│             │    │  /api/render/progress        │
│                              │    │                              │
└──────────────────────────────┘    └──────────────────────────────┘
```

### Key files

```
lib/remotion-compile.ts           ← Shared compiler (browser + Lambda)
app/components/code-studio/
  LivePreview.tsx                  ← Remotion Player + playlist + custom controls
  StudioToolbar.tsx                ← Export UI with scene selection
remotion/
  DynamicComp.tsx                  ← Lambda-side composition (Sequence)
  Root.tsx                         ← Remotion Composition registration
config.mjs / deploy.mjs           ← Lambda deployment config + script
app/api/agent/singleton.ts         ← Agent + OverlayFs + system prompt
```

## License

Apache-2.0
