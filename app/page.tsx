"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, MessageSquare } from "lucide-react";

const CodeStudio = dynamic(() => import("./components/code-studio"), { ssr: false });
const ChatPanel = dynamic(
  () => import("./components/chat").then((m) => ({ default: m.ChatPanel })),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Breakpoints
// ---------------------------------------------------------------------------

const MOBILE_BREAKPOINT = 768;
const SMALL_DESKTOP_BREAKPOINT = 1024;

function useBreakpoint() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return {
    isMobile: width > 0 && width < MOBILE_BREAKPOINT,
    isSmallDesktop: width >= MOBILE_BREAKPOINT && width < SMALL_DESKTOP_BREAKPOINT,
    width,
  };
}

// ---------------------------------------------------------------------------
// Splitter (desktop only)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mobile tab bar
// ---------------------------------------------------------------------------

function MobileTabBar({
  activePanel,
  onSwitch,
}: {
  activePanel: "chat" | "studio";
  onSwitch: (panel: "chat" | "studio") => void;
}) {
  return (
    <div className="flex-shrink-0 flex border-t border-border bg-background safe-bottom">
      <button
        type="button"
        onClick={() => onSwitch("chat")}
        className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${
          activePanel === "chat" ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <MessageSquare className="size-5" />
        Chat
      </button>
      <button
        type="button"
        onClick={() => onSwitch("studio")}
        className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${
          activePanel === "studio" ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <Monitor className="size-5" />
        Studio
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main layout
// ---------------------------------------------------------------------------

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [studioWidth, setStudioWidth] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<"chat" | "studio">("chat");
  const containerRef = useRef<HTMLDivElement>(null);
  const { isMobile, isSmallDesktop, width } = useBreakpoint();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-switch to studio when new content arrives
  useEffect(() => {
    if (!isMobile) return;
    const handler = () => setActivePanel("studio");
    window.addEventListener("studio:refresh", handler);
    return () => window.removeEventListener("studio:refresh", handler);
  }, [isMobile]);

  const handleDrag = useCallback((deltaX: number) => {
    setStudioWidth((prev) => {
      const container = containerRef.current;
      if (!container) return prev;
      const total = container.offsetWidth;
      const current = prev ?? total * 0.6;
      const next = current + deltaX;
      const minStudio = Math.max(280, total * 0.25);
      const minChat = Math.max(280, total * 0.2);
      return Math.max(minStudio, Math.min(next, total - minChat));
    });
  }, []);

  if (!mounted) return null;

  // ── Mobile: single panel + bottom tab bar ──
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
        <div style={{ flex: 1, overflow: "hidden", display: activePanel === "chat" ? "flex" : "none" }}>
          <ChatPanel />
        </div>
        <div style={{ flex: 1, overflow: "hidden", display: activePanel === "studio" ? "block" : "none" }}>
          <CodeStudio style={{ width: "100%", height: "100%", overflow: "hidden" }} />
        </div>
        <MobileTabBar activePanel={activePanel} onSwitch={setActivePanel} />
      </div>
    );
  }

  // ── Desktop: side-by-side with splitter ──
  const defaultRatio = isSmallDesktop ? 0.45 : 0.6;
  const effectiveWidth = studioWidth ?? (width > 0 ? width * defaultRatio : undefined) ?? "60%";

  return (
    <div
      ref={containerRef}
      style={{ display: "flex", flexDirection: "row", height: "100dvh", overflow: "hidden" }}
    >
      <CodeStudio
        style={{
          width: effectiveWidth,
          minWidth: Math.max(280, width * 0.25),
          flexShrink: 0,
          overflow: "hidden",
        }}
      />
      <Splitter onDrag={handleDrag} />
      <div style={{ flex: 1, minWidth: Math.max(280, width * 0.2), overflow: "hidden" }}>
        <ChatPanel />
      </div>
    </div>
  );
}
