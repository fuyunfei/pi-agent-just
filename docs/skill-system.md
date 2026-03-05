# Skill System

## Overview

Skills inject domain knowledge (e.g. Remotion best practices) into the agent's context via progressive disclosure: the system prompt lists skill names + descriptions, and the agent reads full content on-demand.

## Architecture

```
Build time          Runtime (agent)
─────────────       ────────────────────────
skills/             OverlayFs /project/skills/
  remotion-…/         remotion-…/
    SKILL.md    ──→     SKILL.md        ← agent reads here
    rules/              rules/
      *.md                *.md
```

### Why not native `loadSkills()`

pi-coding-agent's `loadSkills()` uses `readFileSync` and sets `filePath` to real FS paths.
The agent's `read` tool goes through OverlayFs, which only knows `/project/...` paths.
So we copy files into OverlayFs at startup and point `filePath` to the virtual path.

Native components still used:
- `parseFrontmatter` / `SkillFrontmatter` — frontmatter parsing
- `Skill` type — skill metadata interface
- `formatSkillsForPrompt` — via `AgentSession.buildSystemPrompt` reading `resourceLoader.getSkills()`

## Files

| File | Role |
|------|------|
| `skills/` | Bundled skill directories (excluded from tsconfig) |
| `app/api/agent/skills-loader.ts` | Copies skills into OverlayFs, returns `Skill[]` |
| `app/api/agent/singleton.ts` | Calls loader, injects into `resourceLoader.getSkills()` |
| `app/api/agent/command/route.ts` | `skills` command — returns skill list for UI |
| `app/components/chat/types.ts` | `SkillInfo` interface |
| `app/components/chat/useChatAgent.ts` | Fetches skills, handles `/skill` and `/skill:name` |
| `app/components/chat/SlashCommandMenu.tsx` | `/skill` menu with sub-menu |
| `app/components/chat/ChatPanel.tsx` | Skill read tool cards (BookOpen icon) |
| `app/components/code-studio/FileTreeSidebar.tsx` | Skills section in sidebar |

## Adding a new skill

1. Create `skills/<name>/SKILL.md` with frontmatter:
   ```yaml
   ---
   name: my-skill
   description: What this skill does
   ---
   ```
2. Add rule files in `skills/<name>/rules/` (referenced from SKILL.md)
3. Restart dev server — auto-discovered

## User interaction

- **Automatic**: Agent reads skills on-demand when relevant to the task
- **Slash command**: `/skill` lists skills, `/skill:name` loads a specific one
- **Sidebar**: Click a skill name to load it into context

## Key details

- `clearSingleton()` calls `overlayFs.restore()` which wipes all memory — skills are re-loaded after restore
- `getUserFiles()` filters out `/skills/` prefix so skill files don't appear as user project files
- `/skill:name` sends a prompt to the agent (can't use `_expandSkillCommand` which needs real FS `readFileSync`)
