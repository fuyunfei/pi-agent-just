# Agent 优化规划

> 经源码验证 + Pi 设计哲学辩证 + abort/follow-up 行为修正，2026-03-06

---

## 关键认知

1. **abort 不丢消息**。`agent.abort()` 只中断当前 LLM 请求，`_state.messages` 保留所有已完成的 tool results。
2. **stop 按钮只断前端**。前端 abort 只断 SSE 连接，server 端 agent 继续跑浪费 token。
3. **steering 边际收益小**。abort 不丢消息，steering 只在多 tool call 中间插入时有意义，实际场景少。
4. **Remotion 知识属于 system prompt**。垂直 MG 创作器，知识是常驻需求不是临时 skill。
5. **follow-up 不是用来续写的**。agent loop 的循环由 LLM 的 tool call 驱动 — LLM 调 tool 就继续，返回纯文本就停。LLM 过早停止是 prompt 引导问题，不应该用 follow-up 补救。follow-up 原生用途是外部注入新指令（如 extension 追加 TODO）。

---

## 已完成

### transformContext — 上下文摘要 + 动态项目状态

`singleton.ts` → `new Agent({ transformContext })`，每次 LLM 调用前执行：
1. 将大于 500 字符的 write/edit tool result 替换为摘要，释放上下文空间
2. 扫描 OverlayFs 中 .tsx 文件，解析 `@remotion` 配置，将项目状态（scene 列表 + 总时长）注入最后一条 user message

### 修复 stop 按钮

- 后端：`/api/sandbox` 新增 `action: "stop"` → `session.abort()`
- 前端：stop 回调同时 abort fetch + 调 server stop API

### System prompt 续写引导优化

将模糊的 "automatic continue the next round" 改为明确指令：
- 写完一批后如果视频还没完 → 继续调 write，不要停下来总结或询问
- 只在整个视频完成后才停止

配合 transformContext 注入的项目状态，LLM 每轮都知道进度，自主决定继续还是停止。这比 follow-up 更可靠 — 让 LLM 通过 tool call 驱动循环，而非外部代码猜测任务是否完成。
