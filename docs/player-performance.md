# Player 播放性能优化

## 问题

Remotion Player 播放时界面卡顿。

## 根因

`LivePreview.tsx` 中 `RemotionPreview` 组件监听了 Remotion Player 的 `frameupdate` 事件，每帧（30fps）调用 `setCurrentFrame()`，导致 React **每秒重渲染整个组件 30 次**。

`currentFrame` 仅用于两处纯展示更新：
1. 进度条当前 segment 的宽度百分比
2. 时间显示 `mm:ss / mm:ss`

每次重渲染都要重新计算进度条 JSX + React diff + DOM 更新，与 Player 自身的渲染争抢主线程。

## 修复

将 `currentFrame` 从 `useState` 改为 `useRef`，在 `frameupdate` 回调中直接操作 DOM：

- `activeSegRef` → 直接设置进度条 `style.width`
- `timeRef` → 直接设置 `textContent`

修改后 `frameupdate` 不再触发任何 React re-render，开销接近零。

## 关键文件

- `app/components/code-studio/LivePreview.tsx` — `RemotionPreview` 组件

## 教训

高频事件（动画帧、鼠标移动等）驱动的纯展示更新，应避免 `setState`，优先用 `useRef` + 直接 DOM 操作。
