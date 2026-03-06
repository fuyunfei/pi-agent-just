# LoadSkill 设计框架

## 核心问题

pi-coding-agent 原生的 `loadSkills()` 使用 `readFileSync` 读取真实文件系统，并将 `filePath` 设为真实路径。但本项目的 agent `read` 工具走 OverlayFs，只认 `/project/...` 虚拟路径。因此不能直接使用原生加载，需要自行桥接。

## 数据流

```
启动                                    运行时
────────────────────────                ────────────────────────

skills/                                 Agent 收到带 skill 描述的
  remotion-…/                           system prompt
    SKILL.md        ─┐
    rules/*.md       │                  Agent 按需调用 read 工具
                     │                        │
  loadBundledSkills()│                        ▼
         │           │                  OverlayFs
         ▼           │                  /project/skills/remotion-…/
  1. readdirSync     │                    SKILL.md    ← 读这里
     读取真实 FS     │                    rules/*.md
  2. parseFrontmatter│
     解析 SKILL.md   │
  3. copyDirToOverlay├──写入──→  OverlayFs 内存
     写入 OverlayFs  │
  4. 返回 Skill[]    │
         │           │
         ▼
  singleton.ts
  resourceLoader.getSkills()
         │
         ▼
  AgentSession.buildSystemPrompt()
  将 skill name + description
  注入 system prompt
```

## 文件职责

| 文件 | 职责 |
|------|------|
| `skills/` | 真实 FS 上的 skill 目录，每个子目录含 `SKILL.md` + `rules/` |
| `app/api/agent/skills-loader.ts` | 启动时：真实 FS → OverlayFs 复制，返回 `Skill[]` |
| `app/api/agent/singleton.ts` | 调用 loader，管理 `skillState`，暴露 toggle/query API |
| `app/api/agent/command/route.ts` | HTTP 命令端点：`skills` 查询、`toggle-skills` 开关 |
| `app/components/chat/useChatAgent.ts` | 前端 hook：mount 时 fetch skills，处理 `/skill` 斜杠命令 |
| `app/components/chat/SlashCommandMenu.tsx` | `/skill` 菜单 + 子菜单选择 |
| `app/components/chat/ChatPanel.tsx` | ModelSelector 中的 toggle 按钮；skill read tool 卡片；侧边栏 `skill:load` 事件监听 |
| `app/components/code-studio/FileTreeSidebar.tsx` | 侧边栏 Skills 列表，点击触发 `skill:load` 事件 |
| `app/components/chat/types.ts` | `SkillInfo` 接口定义 |

## 两层状态

### 1. allSkills（始终可用）

`loadBundledSkills()` 返回的完整 `Skill[]`，存储在 `Singleton.allSkills` 上。前端通过 `getAvailableSkills()` 直接读取，不受 enabled 状态影响——确保 toggle 按钮始终可见。

### 2. skillState.enabled（控制注入）

`resourceLoader.getSkills()` 根据 `skillState.enabled` 决定是否返回 skills 给 `AgentSession`。enabled=false 时 system prompt 中不包含 skill 信息，agent 不知道 skills 的存在。

```
Singleton.allSkills ──→ getAvailableSkills() ──→ 前端 UI（列表、toggle）
                                                    始终返回全部

skillState.enabled ──→ resourceLoader.getSkills() ──→ AgentSession
                       enabled ? allSkills : []       system prompt 注入
```

通过 `Object.defineProperty` 将 `Singleton.skillsEnabled` 的 getter/setter 桥接到闭包内的 `skillState.enabled`，保证 toggle 操作同时更新两处引用。

## 复用的原生组件

| 组件 | 来源 | 用途 |
|------|------|------|
| `parseFrontmatter<SkillFrontmatter>` | pi-coding-agent | 解析 SKILL.md 的 YAML frontmatter |
| `Skill` type | pi-coding-agent | skill 元数据接口 |
| `formatSkillsForPrompt` | pi-coding-agent (内部) | `AgentSession.buildSystemPrompt` 自动调用 |

## 用户交互路径

### 自动（agent 主动）
system prompt 列出 skill 名称和描述 → agent 判断相关性 → 调用 read 工具读取 OverlayFs 中的 SKILL.md

### 斜杠命令
- `/skill` → 列出所有可用 skills
- `/skill:name` → 发送 prompt 让 agent 读取指定 skill 文件

### 侧边栏点击
FileTreeSidebar 点击 → `CustomEvent("skill:load")` → ChatPanel 监听 → 调用 `send("/skill:name")`

### Toggle 开关
ModelSelector popover 中的按钮 → `POST /api/agent/command { command: "toggle-skills" }` → `toggleSkills()` 翻转 `skillState.enabled`

## Session 生命周期

- **创建**：`getOrCreateSingleton()` → `loadBundledSkills()` 写入 OverlayFs + 返回 Skill[]
- **清除**：`clearSingleton()` → `overlayFs.restore()` 清空内存 → 重新 `loadBundledSkills()` 恢复 skill 文件
- **HMR**：module-level `globalThis` Map 保持 singleton 跨热更新存活

## 已知修复

`getAvailableSkills()` 曾经通过 `resourceLoader.getSkills()` 获取 skills，该方法在 `enabled=false` 时返回空数组。导致前端 `skillCount === 0`，toggle 按钮不显示——形成死循环。已修复为直接读取 `Singleton.allSkills`。
