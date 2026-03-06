# Pi Coding Agent 框架分析

> 基于 `@mariozechner/pi-agent-core@0.55.3` 和 `@mariozechner/pi-coding-agent` 源码

---

## 架构分层

```
pi-coding-agent          工具定义 + Operations 接口 + AgentSession
       ↓
pi-agent-core            Agent 状态机 + Agent Loop + 事件系统 + LLM 流式调用
```

底层是通用 AI Agent 运行时，上层是编程专用工具集。两层通过 `AgentTool` 接口连接。

---

## Agent Loop — 一切的核心

用户发一条消息，LLM 被**反复调用**直到它不再产生 tool call。这是一个双层 while 循环：

```
外层: follow-up 循环
│
│  内层: tool-call 循环
│  │
│  │  1. 注入 pending messages（steering 或 follow-up）
│  │  2. 调用 LLM
│  │  3. LLM 返回 tool calls？
│  │     ├─ 有 → 顺序执行工具 → 结果加入上下文 → 回到 2
│  │     └─ 没有 → 退出内层
│  │
│  │  每个工具执行后检查 steering 队列
│  │  有 steering → 跳过剩余工具，回到 1
│  │
│  检查 follow-up 队列
│  ├─ 有 → 继续外层
│  └─ 没有 → 结束
```

**为什么是双层？** 解决两个不同场景：
- **Steering**（内层）：用户在 agent 运行中发新消息 → 打断当前工具链，LLM 重新决策
- **Follow-up**（外层）：agent "自然结束"后，系统追加消息让它继续

优先级：Steering > Follow-up。两者都支持 `"one-at-a-time"` 或 `"all"` 出队模式。

---

## 两个关键设计决策

### 1. 工具顺序执行，不并行

工具之间是 steering 检查点。如果 LLM 一次返回 3 个 tool call：

```
tool_1 执行 → 检查 steering → tool_2 执行 → 检查 steering → tool_3 执行
                   ↑
            如果用户发了新消息，
            tool_2, tool_3 被跳过，
            返回 "Skipped due to queued user message."
            LLM 拿到这个结果后重新决策
```

这牺牲了并行性能，换来了**可中断性**和**确定性**。

### 2. Context 两步管道

```
AgentMessage[]  →  transformContext()  →  convertToLlm()  →  Message[]  →  LLM
  (全量消息)         (裁剪/压缩/注入)       (过滤为 LLM 格式)    (user|assistant|toolResult)
```

- `transformContext`：应用层控制上下文窗口（compaction、注入系统信息）
- `convertToLlm`：过滤掉自定义消息类型，只留 LLM 能理解的三种角色

这使得 `AgentMessage[]` 可以包含任意应用层消息（通过 declaration merging 扩展），而 LLM 永远只看到干净的对话。

---

## Operations 适配器模式

框架最核心的解耦设计。每个工具（bash, read, write, edit, grep, find, ls）定义一个 Operations 接口，工具逻辑只依赖接口：

```
createWriteTool(cwd, { operations: myWriteOps })
```

应用层决定 operations 的实现指向哪里：
- 本地 Node.js fs → 直接文件操作
- OverlayFs → 内存虚拟文件系统（本项目）
- SSH / 云沙箱 → 远程执行

工具代码不变，执行环境可插拔。这就是 pi-agent-just 能用 ~150 行适配函数把整个 agent 跑在内存里的原因。

---

## 事件系统 — 四层可观测性

```
agent_start / agent_end                          ← Agent 生命周期
  turn_start / turn_end                          ← 一次 LLM 调用
    message_start / message_update / message_end ← 消息流式
    tool_execution_start / update / end          ← 工具执行
```

`message_update` 内嵌 LLM 流式事件（text_delta, thinking_delta, toolcall_delta），前端据此实现逐字渲染。

---

## AgentSession — 会话层封装

`AgentSession` 在 `Agent` 之上增加：

| 能力 | 说明 |
|------|------|
| 工具激活 | `setActiveToolsByName()` — 动态启停工具，自动重建 system prompt |
| System prompt 构建 | 根据活跃工具 + skills + 项目上下文 + 自定义提示组装 |
| 上下文压缩 | `compact()` — 自动/手动压缩历史消息 |
| 模型切换 | `cycleModel()` — 运行时切换 LLM |
| Skill 系统 | 通过 ResourceLoader 加载 SKILL.md，注入 system prompt |

---

## pi-agent-just 的适配

本项目将 pi-coding-agent 跑在浏览器可访问的 Next.js 后端上，核心适配：

```
pi-coding-agent tool  →  adapter (singleton.ts)  →  just-bash (OverlayFs + Bash)
```

**Singleton 管理**：每个浏览器 session 一个独立的 `{ OverlayFs, AgentSession }`，TTL 1h，最多 10 并发。

**SSE 桥接**：`session.subscribe(event)` → 转换为 `data: {json}\n\n` → 前端 `useChatAgent` 解析渲染。

---

## 一句话总结

Pi Coding Agent 是一个 **Operations 可插拔的 agentic loop 框架**，通过双层循环 + 两级消息队列实现自动续写和优雅中断，通过适配器模式让同一套工具跑在任意执行环境上。
