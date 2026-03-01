# pi-agent-just

[English](./README.md) | 中文

一个浏览器端的 AI 编程沙盒，将两个独立系统——[pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)（AI agent 运行时）和 [just-bash](https://github.com/niclas-niclas/just-bash)（纯 TypeScript 实现的 bash 解释器 + 内存文件系统）——融合为一个完整的沙盒环境。AI 在其中编写和执行真实代码，一切都在内存中完成。

## 为什么这样做

大多数 AI 编程工具要么只生成代码文本（不执行），要么需要真实的操作系统级沙盒（Docker、VM、WASM）。这个项目走了第三条路：

**AI agent 拥有真实的 bash shell 和文件系统，但一切都在纯 TypeScript 进程内运行。** 没有容器，没有 WASM，没有系统调用。Agent 可以 `write` 文件、`bash` 执行脚本、`grep` 搜索内容——与人类开发者完全相同的工作流——但整个执行过程发生在 JavaScript 运行时内。文件只存在于内存中。沙盒的创建零成本，快照瞬时完成，回滚轻而易举。

这一切通过两个系统之间的适配层实现：

```
pi-coding-agent                    just-bash
┌─────────────────┐               ┌─────────────────┐
│  AgentSession   │               │    OverlayFs    │
│  ┌───────────┐  │    适配器     │  (内存虚拟文件系统)│
│  │ bash 工具 │──┼───────────────┼──▶ Bash          │
│  │ read 工具 │──┼───────────────┼──▶ readFile      │
│  │ write 工具│──┼───────────────┼──▶ writeFile     │
│  │ edit 工具 │──┼───────────────┼──▶ read+write    │
│  │ ls 工具   │──┼───────────────┼──▶ readdir+stat  │
│  │ find 工具 │──┼───────────────┼──▶ glob 遍历     │
│  │ grep 工具 │──┼───────────────┼──▶ readFile      │
│  └───────────┘  │               └─────────────────┘
│  模型、会话、    │
│  压缩、上下文管理│
└─────────────────┘
```

pi-coding-agent 的每个工具定义了一个 **operations 接口**（`BashOperations`、`ReadOperations` 等）。`singleton.ts` 中的适配函数通过委托给 just-bash 的 `OverlayFs` 和 `Bash` 类来实现这些接口。Agent 完全不知道自己运行在虚拟文件系统中——它使用的工具与真实系统上的完全一致。

## 架构

```
浏览器                                服务端 (Next.js)
┌──────────────────────────────┐    ┌──────────────────────────────┐
│                              │    │                              │
│  Code Studio    │  对话面板  │    │  /api/agent (SSE 流)         │
│  ┌────────────┐ │            │    │    │                         │
│  │ 文件树     │ │  消息      │    │    ▼                         │
│  │ (侧边栏)  │ │  + 工具    │◀──▶│  AgentSession (单例)        │
│  ├────────────┤ │  + 斜杠   │ SSE│    │                         │
│  │ 代码视图   │ │    命令    │    │    ├─ Agent 循环 (LLM 调用)  │
│  │ (Shiki)    │ │            │    │    ├─ 工具执行               │
│  ├────────────┤ │  Token/   │    │    └─ 上下文管理              │
│  │ 实时预览   │ │  费用追踪  │    │                              │
│  │ (iframe/   │ │            │    │  OverlayFs + Bash            │
│  │  Sandpack) │ │            │    │  (纯内存沙盒)                │
│  └────────────┘ │            │    │                              │
└──────────────────────────────┘    └──────────────────────────────┘
```

服务端维护一个跨请求持久化的**单例**：一个 `OverlayFs` 实例、一个 `Bash` 实例、一个 `AgentSession`。每条用户消息触发一个 agent 循环，可能调用多个工具，全部操作同一个内存文件系统。浏览器实时轮询文件变更并渲染。

### 文件系统快照

每次 agent 回合结束时，`OverlayFs` 的状态会被快照并以会话条目 ID 为键存储。用户可以回滚到任意历史检查点——对话历史和文件系统状态被原子性地恢复。这只有在文件系统是纯内存数据结构时才可行。

## 快速开始

```bash
pnpm install

# 设置 API 密钥
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
# 或者: OPENROUTER_API_KEY=sk-or-...

pnpm dev
```

## 许可证

Apache-2.0
