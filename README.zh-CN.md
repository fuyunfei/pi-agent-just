# pi-agent-just

[English](./README.md) | 中文

一个浏览器端的 AI 编程沙盒，将两个独立系统——[pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)（AI agent 运行时）和 [just-bash](https://github.com/niclas-niclas/just-bash)（纯 TypeScript 实现的 bash 解释器 + 内存文件系统）——融合为一个完整的沙盒环境。AI 在其中编写和执行真实代码，一切都在内存中完成。

当前聚焦于 **Remotion 动态图形**：AI 生成 React 视频组件，浏览器实时预览，Lambda 云端渲染导出 MP4。

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

## 架构

```
浏览器                                服务端 (Next.js)
┌──────────────────────────────┐    ┌──────────────────────────────┐
│                              │    │                              │
│  播放器          │  对话面板  │    │  /api/agent (SSE 流)         │
│  ┌────────────┐  │           │    │    │                         │
│  │ Remotion   │  │  消息     │    │    ▼                         │
│  │ Player     │  │  + 工具   │◀──▶│  AgentSession (单例)        │
│  ├────────────┤  │  + 斜杠  │ SSE│    │                         │
│  │ 分段进度条 │  │    命令   │    │    ├─ Agent 循环 (LLM 调用)  │
│  │ (场景轮播) │  │           │    │    ├─ 工具执行               │
│  ├────────────┤  │  Token/  │    │    └─ 上下文管理              │
│  │ 导出       │  │  费用追踪 │    │                              │
│  │ (clip 选择)│  │           │    │  OverlayFs + Bash            │
│  └────────────┘  │           │    │  (纯内存沙盒)                │
│                              │    │                              │
└──────────────────────────────┘    └──────────────────────────────┘
```

### Remotion 编译器

AI 生成的 TSX 代码无法直接执行——它包含 `import` 语句和 JSX 语法。编译器解决这个问题：

```
AI 生成的 TSX ──▶ @babel/standalone 转译 ──▶ new Function() 执行
                                                   │
                                   50+ 预注入的 Remotion API
                                   (AbsoluteFill, spring, interpolate,
                                    Shapes, Transitions, Three.js...)
```

`stripImports()` 去掉 import 语句，`extractComponentBody()` 提取组件函数体，Babel 转译 JSX/TypeScript，最后通过 `new Function()` 创建 React 组件——所有 Remotion API 作为参数注入。编译器在 `lib/remotion-compile.ts` 中，浏览器预览和 Lambda 渲染共享同一份代码。

### 多场景播放

长视频被 AI 拆分为多个场景文件（`scene-01-intro.tsx`、`scene-02-main.tsx`...）。预览器自动发现所有 Remotion 文件，独立编译，按文件名排序轮播：

```
scene-01 播完 ──▶ 自动切 scene-02 ──▶ 自动切 scene-03 ──▶ 循环
     │                    │                    │
     └── 分段进度条：各段按时长等比，可点击跳转 ──┘
```

### Lambda 导出

```
用户选择 clips ──▶ POST /api/render ──▶ renderMediaOnLambda()
                                              │
                                    Lambda 加载 S3 bundle
                                    DynamicComp 编译每个 scene
                                    <Sequence> 拼接
                                    输出 MP4 到 S3
                                              │
用户轮询进度  ◀── POST /api/render/progress ◀─┘
下载 MP4     ◀── S3 presigned URL
```

单 scene 直接渲染，多 scene 用 `<Sequence>` 按顺序拼接成一个连续视频。每个 scene 独立编译，无命名冲突。

### 文件系统快照

每次 agent 回合结束时，`OverlayFs` 的状态会被快照并以会话条目 ID 为键存储。用户可以回滚到任意历史检查点——对话历史和文件系统状态被原子性地恢复。

## 快速开始

```bash
pnpm install

# 设置 API 密钥
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
# 或者: OPENROUTER_API_KEY=sk-or-...

pnpm dev
```

### Lambda 导出（可选）

```bash
# 设置 AWS 凭证
echo "REMOTION_AWS_ACCESS_KEY_ID=..." >> .env.local
echo "REMOTION_AWS_SECRET_ACCESS_KEY=..." >> .env.local

# 部署 Lambda function + S3 site bundle
node deploy.mjs
```

## 许可证

Apache-2.0
