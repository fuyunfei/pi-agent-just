"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

const CodeStudio = dynamic(() => import("./components/code-studio"), { ssr: false });
const ChatPanel = dynamic(
  () => import("./components/chat").then((m) => ({ default: m.ChatPanel })),
  { ssr: false },
);

function Splitter({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastX.current = e.clientX;

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientX - lastX.current;
        lastX.current = ev.clientX;
        onDrag(delta);
      };
      const onMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.documentElement.classList.remove("dragging");
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.documentElement.classList.add("dragging");
    },
    [onDrag],
  );

  return (
    <div onMouseDown={onMouseDown} className="splitter-handle group">
      <div className="splitter-line group-hover:bg-cyan-500/60" />
    </div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [studioWidth, setStudioWidth] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDrag = useCallback((deltaX: number) => {
    setStudioWidth((prev) => {
      const container = containerRef.current;
      if (!container) return prev;
      const total = container.offsetWidth;
      const current = prev ?? total * 0.6;
      const next = current + deltaX;
      return Math.max(350, Math.min(next, total - 300));
    });
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", flexDirection: "row", height: "100dvh", overflow: "hidden" }}
    >
      {mounted ? (
        <CodeStudio
          style={{
            width: studioWidth ?? "60%",
            minWidth: 350,
            flexShrink: 0,
            overflow: "hidden",
          }}
        />
      ) : null}
      {mounted ? <Splitter onDrag={handleDrag} /> : null}
      <div style={{ flex: 1, minWidth: 300, overflow: "hidden" }}>
        {mounted ? <ChatPanel /> : null}
      </div>
    </div>
  );
}
