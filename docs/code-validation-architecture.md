# Code Validation & Fix Architecture

## 核心流程

```
Babel 编译 / Remotion Player runtime
  → 错误检测 (客户端)
  → 用户点击 "Ask AI to fix"
  → CustomEvent("studio:retry-scene")
  → ChatPanel 监听 → 构造 prompt → agent 消息流
  → write/edit tool → 文件变更 → Preview 自动重编译
```

## 1. 错误检测

### Compile Errors

`lib/remotion-compile.ts` → `compileRemotionCode()`

1. Babel AST 转换 — `createStripModuleSyntax()` 移除 import/export
2. Babel 转译 — presets: `["react", "typescript"]`
3. `new Function()` 执行 — 注入 React、Remotion、THREE 等全局变量
4. 验证返回值是函数
5. 错误增强 — 对未定义变量提供相似参数名建议

`LivePreview.tsx` 中 scene 变化后 600ms debounce 编译，第一个错误存入 `error` state。

### Runtime Errors

`LivePreview.tsx` — Remotion `<Player>` 的 `errorFallback` prop 捕获渲染时异常。错误截取首行、最多 200 字符。

## 2. Fix 触发

三个入口，同一个事件 `studio:retry-scene`:

| 入口 | 触发条件 |
|------|----------|
| Runtime error overlay | Player 渲染抛异常 |
| Compile error screen | `compiled.length === 0` |
| Tool error card retry | Scene write tool 失败 |

## 3. Fix 处理

`ChatPanel.tsx` 监听 `studio:retry-scene`：

- 提取 filename, error, type
- 构造 prompt: `"Fix {type} error in {filename}\n\nError: {error}"`
- 调用 `send()` → 复用标准 agent 消息流

## 4. 事件通信

| 事件 | 方向 | 用途 |
|------|------|------|
| `studio:retry-scene` | LivePreview / ToolCallCard → ChatPanel | 触发 fix |
| `studio:refresh` | useChatAgent → CodeStudio | 文件变更通知 |
| `studio:render-data` | LivePreview → RenderQueue | 编译后 scene 数据 |
| `studio:scene-update` | LivePreview → CodeStudio | scene 索引变化 |
| `studio:agent-status` | useChatAgent → Export button | streaming 状态 |

## 5. 关键文件

| 文件 | 职责 |
|------|------|
| `lib/remotion-compile.ts` | Babel 编译、代码求值、错误增强 |
| `app/components/code-studio/LivePreview.tsx` | 错误检测、Fix 按钮、事件 dispatch |
| `app/components/chat/ChatPanel.tsx` | Fix 事件监听、prompt 构造 |
| `app/components/chat/useChatAgent.ts` | SSE 解析、tool/stream 错误处理 |
