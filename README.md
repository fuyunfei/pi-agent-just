# pi-agent-just

Browser-based AI coding playground. AI creates files in a sandboxed virtual filesystem — you browse, preview, and download.

Built on [just-bash](https://github.com/vercel-labs/just-bash) for secure sandboxed execution and [pi-coding-agent](https://github.com/niclas-niclas/pi-coding-agent) for the AI agent runtime.

## Architecture

```
┌──────────────────────────────────────┬────────────────────┐
│  [◨]  4 files        [Download][Clear] │                    │
├──[index.ts]──[App.tsx]──[preview]─────┤                    │
│┌────────┬────────────────────────────┐│  Terminal          │
││ src/   │  1│ import { useState }    ││  (AI chat + bash)  │
││  index │  2│ from "react";          ││                    │
││  App   │  3│                        ││                    │
││        │  4│ export default ...     ││                    │
│└────────┴────────────────────────────┘│                    │
└──────────────────────────────────────┴────────────────────┘
```

**Left panel** — Code Studio. Tabbed file viewer with Shiki syntax highlighting, live HTML preview, markdown rendering, JSON formatting. File tree sidebar with change indicators.

**Right panel** — Terminal with AI agent. Chat naturally or run bash commands directly. Commands execute in a sandboxed virtual filesystem.

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

## How It Works

### Agent API (`/api/agent`)

POST endpoint that streams SSE events from the AI agent. The agent has access to sandboxed tools:

| Tool | Description |
|------|-------------|
| `bash` | Run commands in the virtual bash environment |
| `read` | Read files from the overlay filesystem |
| `write` | Create/overwrite files (in-memory) |
| `edit` | Edit existing files with string replacement |
| `ls` | List directory contents |

### Sandbox API (`/api/sandbox`)

| Method | Description |
|--------|-------------|
| `GET /api/sandbox` | List all overlay changes (created/modified/deleted files) |
| `POST /api/sandbox` `{action:"clear"}` | Reset the session (destroy sandbox + agent state) |

### Code Studio

- **Syntax highlighting** — Shiki with github-dark/github-light themes, 15+ languages
- **Live preview** — HTML (sandboxed iframe), Markdown, SVG, JSON
- **File tree** — Auto-collapsing single-child directories, change type indicators (+/~/-)
- **Tabs** — Middle-click close, Cmd+W close, Cmd+[ / Cmd+] cycle, Cmd+B toggle sidebar
- **Draggable splitter** — Resize studio and terminal panels
- **Download** — Export all files as ZIP (browser-side, no server dependency)

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
- **Shiki 4** — Syntax highlighting (browser bundle, no WASM)
- **Tailwind CSS 4** — Styling with CSS custom properties for theming
- **React 19** — UI

## License

Apache-2.0
