# pi-agent-just

Browser-based AI coding playground. AI creates files in a sandboxed virtual filesystem — you browse, preview, and download.

Built on [just-bash](https://github.com/niclas-niclas/just-bash) for secure sandboxed execution and [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) for the AI agent runtime.

## Architecture

```
┌────────────────────────────────────────┬──────────────────────┐
│┌──────┐                                │                      │
││ src/ │ [◨] [index.ts] [App.tsx]  4files│  What would you      │
││ index│─────────────────────────────── │  like to build?      │
││ App  │  1│ import { useState }        │                      │
││      │  2│ from "react";              │  [suggestions...]    │
││Filter│  3│                            │                      │
│└──────┘  4│ export default ...         │  [📎] 12k · $0.02   │
└────────────────────────────────────────┴──────────────────────┘
```

**Left panel** — Code Studio with full-height file tree sidebar (slide-open animation, file search filter), tabbed file viewer with Shiki syntax highlighting, live HTML/React preview, markdown rendering, JSON formatting.

**Right panel** — Chat with AI agent. Slash commands (`/new`, `/compact`, `/session`, `/model`), real-time tool call cards, token/cost/context tracking, checkpoint rollback.

**Sandbox** — All file operations happen in a pure in-memory OverlayFS. Click **Download** to export files as a ZIP. Click **Clear** to reset the session.

## Quick Start

```bash
# Install dependencies
pnpm install

# Set API key in .env.local
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
# or
echo "OPENROUTER_API_KEY=sk-or-..." > .env.local

# Start dev server
pnpm dev
```

## API Routes

### Agent (`/api/agent`)

POST endpoint that streams SSE events from the AI agent. Events:

| Event | Description |
|-------|-------------|
| `text-delta` | Streaming text chunk |
| `reasoning-start/delta/end` | Thinking/reasoning content |
| `tool-call-started` | Tool invocation begins |
| `tool-input-available` | Tool arguments ready |
| `tool-output-available` | Tool result |
| `auto_compaction_start/end` | Context compaction in progress |
| `finish` | Turn complete (includes `usage` stats) |

### Agent Commands (`/api/agent/command`)

POST with `{ command: "compact" | "session" }`:
- **compact** — Manually compress context, returns token savings
- **session** — Returns model, message counts, token breakdown, cost, context window usage

### Sandbox (`/api/sandbox`)

| Method | Description |
|--------|-------------|
| `GET` | List all overlay changes (created/modified/deleted files) |
| `POST {action:"clear"}` | Reset session (destroy sandbox + agent state) |

### Checkpoint (`/api/checkpoint`)

| Method | Description |
|--------|-------------|
| `GET` | List user-message checkpoints with entry IDs |
| `POST {action:"rollback", entryId}` | Rollback conversation + restore FS snapshot |

### Model (`/api/model`)

| Method | Description |
|--------|-------------|
| `GET` | Current model + available models list |
| `POST {provider, modelId}` | Switch model (supports OpenRouter routing) |

## Agent Tools

| Tool | Description |
|------|-------------|
| `bash` | Run commands in the virtual bash environment |
| `read` | Read files from the overlay filesystem |
| `write` | Create/overwrite files (in-memory) |
| `edit` | Edit existing files with string replacement |
| `ls` | List directory contents |
| `find` | Search for files by glob pattern |
| `grep` | Search file contents with regex |

## Slash Commands

Type `/` in the chat input to see the autocomplete menu:

| Command | Description |
|---------|-------------|
| `/new` | Clear chat, reset sandbox, start fresh |
| `/compact` | Compress context to save tokens |
| `/session` | Show model, messages, tokens, cost, context% |
| `/model` | Switch AI model (sub-menu with all providers) |

## Code Studio Features

- **Syntax highlighting** — Shiki with github-dark/github-light themes, 15+ languages
- **Live preview** — HTML (sandboxed iframe), React/JSX (Sandpack), Markdown, SVG, JSON
- **File tree** — Full-height sidebar with slide animation, search filter, change indicators (+/~/-)
- **Tabs** — Middle-click close, Cmd+W close, Cmd+[ / Cmd+] cycle
- **Sidebar toggle** — Cmd+B or toolbar button, 150ms slide transition
- **Draggable splitter** — Resize studio and chat panels
- **Download** — Export all files as ZIP (browser-side)

## Chat Features

- **Streaming** — Real-time text + reasoning + tool call cards
- **Token tracking** — Footer shows total tokens, cost, context window %
- **Context colors** — Green < 60%, yellow 60-85%, red > 85%
- **Auto-compaction** — Prevents context overflow on long sessions
- **Checkpoint rollback** — Revert conversation + filesystem to earlier state
- **File attachments** — Paste or attach images and text files

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `OPENROUTER_API_KEY` | — | OpenRouter API key (takes priority) |
| `PI_MODEL` | `claude-haiku-4.5` | Model ID |

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **just-bash** — TypeScript bash interpreter + OverlayFS
- **pi-coding-agent** — AI agent session with tool use
- **Shiki 4** — Syntax highlighting
- **Sandpack** — React/JSX live preview
- **shadcn/ui** — UI components
- **Tailwind CSS 4** — Styling
- **React 19** — UI

## License

Apache-2.0
