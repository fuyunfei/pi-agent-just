"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TerminalComponent from "./components/Terminal";
import CodeStudio from "./components/code-studio";
import { TerminalData } from "./components/TerminalData";

const NOSCRIPT_CONTENT = `
     _           _       _               _
    (_)_   _ ___| |_    | |__   __ _ ___| |__
    | | | | / __| __|   | '_ \\ / _\` / __| '_ \\
    | | |_| \\__ \\ |_ _  | |_) | (_| \\__ \\ | | |
   _/ |\\__,_|___/\\__( ) |_.__/ \\__,_|___/_| |_|
  |__/              |/

  just-bash

  A simulated bash environment with an in-memory virtual filesystem.
  Designed for AI agents needing a secure, sandboxed bash environment.

  FEATURES
  --------

  - Pure TypeScript implementation
  - In-memory virtual filesystem
  - Secure sandboxed execution
  - Network access with URL filtering
  - Vercel Sandbox compatible API

  INSTALLATION
  ------------

  npm install just-bash

  BASIC USAGE
  -----------

  import { Bash } from "just-bash";

  const env = new Bash();
  await env.exec('echo "Hello" > greeting.txt');
  const result = await env.exec("cat greeting.txt");
  console.log(result.stdout); // "Hello\\n"

  SUPPORTED COMMANDS
  ------------------

  File Operations:
    cat, cp, file, ln, ls, mkdir, mv, readlink, rm, rmdir,
    split, stat, touch, tree

  Text Processing:
    awk, base64, column, comm, cut, diff, expand, fold, grep,
    head, join, md5sum, nl, od, paste, printf, rev, rg, sed,
    sha1sum, sha256sum, sort, strings, tac, tail, tr, unexpand,
    uniq, wc, xargs

  Data Processing:
    jq (JSON), python3 (Pyodide), sqlite3, xan (CSV), yq (YAML)

  Navigation & Environment:
    basename, cd, dirname, du, echo, env, export, find,
    hostname, printenv, pwd, tee

  Shell Utilities:
    alias, bash, chmod, clear, date, expr, false, help, history,
    seq, sh, sleep, time, timeout, true, unalias, which, whoami

  SHELL FEATURES
  --------------

  - Pipes: cmd1 | cmd2
  - Redirections: >, >>, 2>, 2>&1, <
  - Chaining: &&, ||, ;
  - Variables: $VAR, \${VAR}, \${VAR:-default}
  - Globs: *, ?, [...]
  - If statements: if/then/elif/else/fi
  - Functions: function name { ... }
  - Loops: for, while, until
  - Arithmetic: $((expr)), (( expr ))
  - Tests: [[ ]], [ ]

  LINKS
  -----

  GitHub: https://github.com/vercel-labs/just-bash
  npm: https://www.npmjs.com/package/just-bash

  License: Apache-2.0
  Author: Malte and Claude

  ---
  Enable JavaScript for an interactive terminal experience.
`;

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
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [onDrag],
  );

  return (
    <div
      onMouseDown={onMouseDown}
      className="splitter-handle group"
    >
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
      // Clamp: min 350px for studio, leave min 250px for terminal
      return Math.max(350, Math.min(next, total - 250));
    });
  }, []);

  return (
    <>
      <noscript>
        <pre>{NOSCRIPT_CONTENT}</pre>
      </noscript>
      <TerminalData />
      <div
        ref={containerRef}
        className="terminal-flex-container"
        style={{ display: "flex", flexDirection: "row", height: "100dvh", overflow: "hidden" }}
      >
        {mounted ? <CodeStudio style={{ width: studioWidth ?? "60%", minWidth: 350, flexShrink: 0, overflow: "hidden" }} /> : null}
        {mounted ? <Splitter onDrag={handleDrag} /> : null}
        <div style={{ flex: 1, minWidth: 250, overflow: "auto" }}>
          {mounted ? <TerminalComponent /> : null}
        </div>
      </div>
      <a href="https://vercel.com" target="_blank" hidden id="credits">
        Created by Vercel Labs
      </a>
    </>
  );
}
