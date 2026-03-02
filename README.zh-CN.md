# pi-agent-just

[English](./README.md) | 中文

AI 驱动的动态图形生成器。描述你想要的画面，AI 使用 [Remotion](https://remotion.dev)（基于 React 的视频框架）创建动画视频。浏览器内即时预览，通过 AWS Lambda 导出 MP4。

基于 [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)（AI agent 运行时）+ [just-bash](https://github.com/niclas-niclas/just-bash)（内存中的 TypeScript bash/文件系统）。

## 工作原理

```
用户: "做一个 60 秒的产品发布视频"
         │
         ▼
   AI Agent 生成 Remotion .tsx 文件
         │
         ▼
   ┌─────────────────────────────────┐
   │  浏览器预览                      │
   │  ┌───────────────────────────┐  │
   │  │     Remotion Player       │  │
   │  │  (实时编译 + 渲染)         │  │
   │  └───────────────────────────┘  │
   │  ━━━━━━━●━━━━━━━━━━━━━━━━━━━━  │
   │  开场     功能展示     结尾     │
   └─────────────────────────────────┘
         │
         ▼  导出
   AWS Lambda → MP4（单场景或多场景合成）
```

- **预览**：AI 生成的 Remotion 代码在浏览器中通过 `@babel/standalone` + `new Function()` 编译，注入 50+ Remotion API。多场景文件作为无缝播放列表播放，配有分段进度条。
- **导出**：选中的场景发送到 AWS Lambda，编译后用 `<Sequence>` 合成，渲染为单个 MP4。支持逐片段或完整视频导出，通过 hover 复选框选择。
- **沙盒**：AI agent 将代码写入内存文件系统（OverlayFs）。无 Docker，无 WASM——纯 TypeScript。

## 快速开始

```bash
pnpm install

# 设置 API 密钥（推荐 OpenRouter，模型选择更多）
echo "OPENROUTER_API_KEY=sk-or-..." > .env.local
# 或者: ANTHROPIC_API_KEY=sk-ant-...

pnpm dev
```

### MP4 导出（可选）

需要 AWS 凭证和一次性 Lambda 部署：

```bash
# 添加到 .env.local
REMOTION_AWS_ACCESS_KEY_ID=...
REMOTION_AWS_SECRET_ACCESS_KEY=...

# 部署 Lambda 函数 + S3 站点包
node deploy.mjs
```

## 架构

```
浏览器                                服务端 (Next.js)
┌──────────────────────────────┐    ┌──────────────────────────────┐
│                              │    │                              │
│  视频播放器    │  对话面板   │    │  /api/agent (SSE 流)         │
│  ┌────────────┐│             │    │    │                         │
│  │ Remotion   ││  提示词     │    │    ▼                         │
│  │ Player     ││  + 工具    │◀──▶│  AgentSession (单例)         │
│  ├────────────┤│  + 模型     │ SSE│    │                         │
│  │ 进度条     ││             │    │    ├─ Agent 循环 (LLM 调用)  │
│  │            ││  Token/     │    │    ├─ 工具执行               │
│  ├────────────┤│  费用追踪   │    │    └─ 上下文管理             │
│  │ 导出控件   ││             │    │                              │
│  │            ││             │    │  /api/render → AWS Lambda    │
│  └────────────┘│             │    │  /api/render/progress        │
│                              │    │                              │
└──────────────────────────────┘    └──────────────────────────────┘
```

### 关键文件

```
lib/remotion-compile.ts           ← 共享编译器（浏览器 + Lambda）
app/components/code-studio/
  LivePreview.tsx                  ← Remotion Player + 播放列表 + 自定义控件
  StudioToolbar.tsx                ← 导出 UI（场景选择）
remotion/
  DynamicComp.tsx                  ← Lambda 端合成（Sequence 拼接）
  Root.tsx                         ← Remotion Composition 注册
config.mjs / deploy.mjs           ← Lambda 部署配置 + 脚本
app/api/agent/singleton.ts         ← Agent + OverlayFs + 系统提示词
```

## 许可证

Apache-2.0
