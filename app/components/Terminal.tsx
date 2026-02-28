"use client";

import { useEffect, useRef } from "react";
import { Bash } from "just-bash/browser";
import { getTerminalData } from "./TerminalData";
import {
  createStaticCommands,
  createAgentCommand,
  createInputHandler,
  showWelcome,
} from "./terminal-parts";

function getTheme(isDark: boolean) {
  return {
    background: isDark ? "#000" : "#fff",
    foreground: isDark ? "#e0e0e0" : "#1a1a1a",
    cursor: isDark ? "#fff" : "#000",
    cyan: isDark ? "#0AC5B3" : "#089485",
    brightCyan: isDark ? "#3DD9C8" : "#067A6D",
    brightBlack: isDark ? "#666" : "#525252",
  };
}

export default function TerminalComponent() {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;

    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    // Dynamic import to avoid SSR issues with LiteTerminal
    let disposed = false;
    import("./lite-terminal").then(({ LiteTerminal }) => {
      if (disposed) return;

      const term = new LiteTerminal({
        cursorBlink: true,
        theme: getTheme(isDark),
      });
      term.open(container);

      // Create commands
      const { aboutCmd, installCmd, githubCmd } = createStaticCommands();
      const agentCmd = createAgentCommand(term);

      // Files from DOM
      const files = {
        "/home/user/README.md": getTerminalData("file-readme"),
        "/home/user/package.json": getTerminalData("file-package-json"),
      };

      const bash = new Bash({
        customCommands: [aboutCmd, installCmd, githubCmd, agentCmd],
        files,
        cwd: "/home/user",
      });

      // Set up input handling
      const inputHandler = createInputHandler(term, bash);

      // Show welcome
      requestAnimationFrame(() => {
        if (disposed) return;
        showWelcome(term);

        if (inputHandler.history.length === 0) {
          inputHandler.setInitialCommand("Build me a landing page");
        }
      });

      // Color scheme change handling
      const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const onColorSchemeChange = (e: MediaQueryListEvent) => {
        term.options.theme = getTheme(e.matches);
      };
      colorSchemeQuery.addEventListener("change", onColorSchemeChange);

      term.focus();

      // Store cleanup
      cleanupRef.current = () => {
        colorSchemeQuery.removeEventListener("change", onColorSchemeChange);
        term.dispose();
      };
    });

    const cleanupRef = { current: () => {} };

    return () => {
      disposed = true;
      cleanupRef.current();
    };
  }, []);

  return (
    <div
      ref={terminalRef}
      style={{
        padding:
          "calc(16px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) 16px calc(16px + env(safe-area-inset-left, 0px))",
        boxSizing: "border-box",
      }}
    />
  );
}
