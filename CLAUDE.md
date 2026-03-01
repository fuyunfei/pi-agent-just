# CLAUDE.md

## Project Overview

pi-agent-just is a browser-based AI coding playground. Users chat with an AI agent that creates files in a sandboxed in-memory filesystem. Files are viewed, previewed, and downloaded via a Code Studio UI.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server (Turbopack)
pnpm build            # Production build
pnpm lint             # Run ESLint
npx tsc --noEmit      # Type check
```

## Architecture

```
app/
├── page.tsx                     # Root layout: CodeStudio | Splitter | ChatPanel
├── api/
│   ├── agent/
│   │   ├── route.ts             # SSE streaming endpoint (POST)
│   │   ├── singleton.ts         # AgentSession + OverlayFs + tools (persists across requests)
│   │   └── command/route.ts     # Slash commands API (compact, session)
│   ├── checkpoint/route.ts      # Conversation rollback + FS snapshot restore
│   ├── model/route.ts           # Model switching (GET/POST)
│   └── sandbox/route.ts         # File changes list + session reset
└── components/
    ├── chat/
    │   ├── ChatPanel.tsx        # Chat UI (messages, input, footer)
    │   ├── useChatAgent.ts      # Hook: SSE streaming, slash commands, state
    │   ├── SlashCommandMenu.tsx  # Autocomplete menu for / commands
    │   └── types.ts             # ChatMessage, ToolCall, SessionUsage, ModelInfo
    ├── code-studio/
    │   ├── CodeStudio.tsx       # Main layout + keyboard shortcuts
    │   ├── CodeStudioContext.tsx # State: tabs, sidebar, changes
    │   ├── StudioToolbar.tsx    # Toolbar: sidebar toggle, tabs, file count, actions
    │   ├── FileTreeSidebar.tsx  # File tree with search filter + slide animation
    │   ├── FileTreeNode.tsx     # Tree node with icons + change indicators
    │   ├── ContentArea.tsx      # Tab content: code viewer or preview
    │   ├── EmptyState.tsx       # No files placeholder
    │   └── types.ts             # StudioTab, TreeNode, OverlayChange
    └── ai-elements/             # Reusable chat UI primitives (prompt-input, message, etc.)
```

## Key Patterns

### Singleton (singleton.ts)
Module-level singleton holds `AgentSession` + `OverlayFs` + `Bash` across requests. All tools use adapter functions that wrap OverlayFs methods into SDK operation interfaces (`BashOperations`, `ReadOperations`, etc.).

### SSE Streaming (route.ts)
Agent events → SSE `data:` lines → frontend `useChatAgent` hook parses them. Events: `text-delta`, `tool-call-started`, `tool-input-available`, `tool-output-available`, `finish` (with usage stats).

### Slash Commands (useChatAgent.ts)
Input starting with `/` intercepted before API call. `/new` resets everything. `/compact` and `/session` call `/api/agent/command`. `/model` handled in `SlashCommandMenu` (switches via `useChatAgent.switchModel`).

### Code Studio State (CodeStudioContext.tsx)
React context + reducer pattern. Actions: `OPEN_FILE`, `CLOSE_TAB`, `SET_ACTIVE_TAB`, `TOGGLE_SIDEBAR`, `TOGGLE_PREVIEW`, `SET_CHANGES`, `FILE_WRITTEN`.

## Agent Tools (7 total)

All tools operate on OverlayFs (pure in-memory, no disk writes):

| Tool | Adapter | SDK Interface |
|------|---------|---------------|
| bash | `createJustBashOps` | `BashOperations` |
| read | `createOverlayReadOps` | `ReadOperations` |
| write | `createOverlayWriteOps` | `WriteOperations` |
| edit | `createOverlayEditOps` | `EditOperations` |
| ls | `createOverlayLsOps` | `LsOperations` |
| find | `createOverlayFindOps` | `FindOperations` |
| grep | `createOverlayGrepOps` | `GrepOperations` |

## Adding a New Tool

1. Import `createXTool` and `type XOperations` from `@mariozechner/pi-coding-agent`
2. Write `createOverlayXOps(fs: OverlayFs): XOperations` adapter in `singleton.ts`
3. Add to `sandboxedTools` map
4. Update system prompt tool list

## Environment Variables

- `ANTHROPIC_API_KEY` — Anthropic API key
- `OPENROUTER_API_KEY` — OpenRouter key (takes priority, routes all providers)
- `PI_MODEL` — Model ID (default: `claude-haiku-4.5` / `anthropic/claude-haiku-4.5` for OpenRouter)

## Guidelines

- Always run `npx tsc --noEmit` after changes (ignore `.next/dev/types/validator.ts` errors)
- UI uses shadcn/ui components from `components/ui/` + Lucide icons
- Styling: Tailwind CSS 4 with shadcn tokens (`bg-background`, `text-foreground`, `border-border`, etc.)
- The `components/ai-elements/` directory contains shared chat primitives — avoid modifying unless necessary
- File operations must go through OverlayFs adapters, never touch real filesystem
- SSE events follow a strict format: `data: {json}\n\n` — parse errors are silently skipped
