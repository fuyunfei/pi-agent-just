# Agent 沙盒方案对比

三种方案解决同一个问题：**给 AI Agent 提供文件系统和 bash 执行能力**。

## 方案概览

```
                  just-bash           Serverless /tmp        Vercel Sandbox
                  (内存模拟)            (函数自带磁盘)           (独立 VM)
─────────────────────────────────────────────────────────────────────────────
文件系统           纯内存 (JS 对象)      真实磁盘 (/tmp)         真实磁盘 (完整 Linux)
Bash 引擎          TypeScript 模拟      TypeScript 模拟 *       真实 /bin/bash
能跑真实程序        ✗                    ✗                      ✓ (npm, node, python...)
额外成本           $0                   $0 (含在函数费用里)      按分钟计费
启动时间           0                    0                      2-5 秒
用户隔离           天然 (独立 JS 对象)    子目录隔离               天然 (独立 VM)
容量限制           服务器内存            512MB (所有用户共享)      GB 级
持久化             序列化 JS 对象        实例活着就在，死了就没     可持久化 (sandboxId)
快照/回滚          ✓ (O(1) 内存快照)     ✗                      ✗
安全               天然隔离，不碰宿主     需防路径穿越             天然隔离
可运行环境          任意 JS runtime       Serverless 函数内        需要 Vercel 基础设施

* Serverless /tmp 通常搭配 just-bash 使用 — /tmp 放文件，just-bash 解释 bash 命令
```

## 它们的关系

```
┌─ bash-tool (Vercel 的高层抽象，AI SDK 集成) ─────────────────────┐
│                                                                  │
│   后端 A: just-bash          后端 B: @vercel/sandbox             │
│   ┌────────────────────┐     ┌────────────────────┐              │
│   │  InMemoryFs (纯内存) │     │  真实 VM            │              │
│   │  OverlayFs (/tmp)   │     │  真实 bash          │              │
│   │  TS 模拟 bash       │     │  真实文件系统        │              │
│   └────────────────────┘     └────────────────────┘              │
└──────────────────────────────────────────────────────────────────┘
```

- **just-bash** = bash 解释器 + 内存文件系统（可选挂载 /tmp 做只读底层）
- **Serverless /tmp** = 存储层，搭配 just-bash 使用，不是独立方案
- **@vercel/sandbox** = 完整 VM，能跑任意程序，独立计费

## 选型决策

```
Agent 需要跑 npm install / node / python 等真实程序？
  ├── 是 → Vercel Sandbox (或 E2B / Docker / Fly.io)
  │        代价：按分钟计费，冷启动延迟，客单价必须高
  └── 否，只需要 读/写/grep/find 文件 + 简单 bash
      │
      Agent 需要处理大文件（>100MB）？
        ├── 是 → just-bash OverlayFs 挂载 /tmp，大文件在磁盘，写入在内存
        └── 否 → just-bash InMemoryFs，全部在内存，最简单
```

## C 端 SaaS 影响

| 指标 | just-bash | Vercel Sandbox |
|------|-----------|----------------|
| 1000 并发成本 | 1 台 8GB 服务器 | ~$600-3000/小时 |
| 用户体验 | 即时响应 | 冷启动等待 2-5s |
| Agent 能力 | 文件操作 + 文本处理 | 全栈开发 |
| 适合产品 | 代码生成+预览 (v0/PageOn) | 完整 IDE (Replit/Bolt) |
