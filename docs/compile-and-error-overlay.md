# 编译 & 错误蒙层 — 数据流与触发时机

## 数据流总览

```
Agent (SSE)
  │
  ├─ tool-output (write/edit/bash) ──► studio:refresh (无 detail, 触发 fetch /api/sandbox)
  │                                      debounce 300ms
  └─ finish (agent_end) ────────────► studio:refresh (带 detail.changes, 直接 dispatch，无 fetch)
        │
        ▼
  CodeStudioContext (SET_CHANGES)
        │
        ▼
  ContentArea → LivePreview
        │
        ├─ collectRemotionScenes(changes, activeFilename, activeContent)
        │   → RemotionScene[] (所有 .tsx 的 filename + code)
        │
        ▼
  RemotionPreview({ scenes })
        │
        ├─ scenesKey = scenes.map(s => s.code).join("\0")
        │   scenesKey 变化 → 触发编译 (debounce 600ms)
        │
        ▼
  编译循环 → compiled[] + error
        │
        ▼
  Player 渲染 + 错误蒙层
```

## 编译触发时机

| 触发源 | 路径 | 频率 |
|--------|------|------|
| Agent 每完成一次 write/edit/bash | SSE → `studio:refresh` (无 detail) → fetch `/api/sandbox` → SET_CHANGES → scenes 变化 → scenesKey 变化 → **重编译所有 scene** | 每个 tool output 一次 (debounce 300ms fetch + 600ms compile) |
| Agent 回合结束 (finish) | SSE → `studio:refresh` (带 changes) → 直接 dispatch SET_CHANGES → 同上 | 每轮对话结束一次 |

关键：**编译是全量的**。任何一个 scene 的 code 变化都会触发所有 scene 重新编译。

## 错误状态模型

```typescript
// RemotionPreview 内部
const [error, setError] = useState<string | null>(null);         // 编译错误 (全局单一值)
const [runtimeError, setRuntimeError] = useState<string | null>(null);  // 运行时错误 (全局单一值)
```

### 编译循环逻辑

```typescript
const results: CompiledScene[] = [];
let firstError: string | null = null;

for (const scene of scenes) {
    const result = compileRemotionCode(scene.code);
    if (result.Component) {
        results.push({ Component, config, filename, code });
    } else if (!firstError) {
        firstError = `${scene.filename}: ${result.error}`;  // 只记录第一个错误
    }
}

if (results.length > 0) {
    setCompiled(results);  // 成功的 scene 正常进入播放列表
    setError(firstError);  // ← 但 error 也可能非 null
} else {
    setError(firstError || "No valid scenes");
}
```

### 蒙层渲染条件

```
error 非 null          → 编译错误蒙层 (覆盖整个播放器)
!error && runtimeError → 运行时错误蒙层 (覆盖整个播放器)
```

蒙层是 `position: absolute; inset: 0` 在播放器容器上，不区分当前播放的是哪个 scene。

## 已知问题

### 1. 一个 clip 报错 → 全局蒙层

`error` 是单一全局值。Scene A 编译失败 → `error = "A: xxx"` → 蒙层覆盖正在播放的 Scene B。

根因：error 没有 per-scene 粒度，蒙层条件只看 `error != null`。

### 2. 所有 clip 都能 preview 但仍显示蒙层

Agent 写文件过程中，中间态的代码（不完整）被实时推送：

```
Agent 调 write tool → tool-output → studio:refresh → fetch → SET_CHANGES
→ scenes 包含一个写到一半的 .tsx → 编译失败 → error 非 null → 蒙层出现
```

即使 600ms debounce，agent 的 write tool 完成时文件已落盘，但 scene 代码可能在语法上是合法的却在逻辑上会 crash（或反过来：write 了一半的多文件操作）。这个 error 会一直保留到下一次 scenesKey 变化触发重编译。

### 3. runtimeError 切 scene 不清除

```typescript
useEffect(() => { setRuntimeError(null); }, [compiled]);  // 只在 compiled 变化时清除
```

切换 scene (setCurrentIndex) 不改变 compiled → runtimeError 残留 → 蒙层跟着到下一个正常 scene。

## 改进方向

### error 粒度：全局 → per-scene

```
Map<filename, errorMsg>  而不是  string | null
```

蒙层条件改为：当前播放的 scene 有 error 时才显示。

### 编译触发策略：增量而非全量

只重编译 code 实际变化的 scene，不影响其他 scene 的 error 状态。

### runtimeError 跟随 scene 切换

切换 scene 时清除 runtimeError：

```typescript
useEffect(() => { setRuntimeError(null); }, [compiled, sceneIndex]);
```

### Agent 写文件期间：抑制编译 或 标记 in-flight

考虑在 agent streaming 期间（status !== "ready"）不触发中间态编译，或只在 finish 事件时编译。
