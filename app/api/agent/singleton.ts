/**
 * Singleton module — OverlayFs + Bash + AgentSession persist across requests.
 * Uses a temporary empty directory as the overlay root (pure in-memory sandbox).
 */

import { Bash, OverlayFs, type FsSnapshot } from "just-bash";
import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join, relative } from "path";
import { tmpdir } from "os";
import { minimatch } from "minimatch";
import {
	AgentSession,
	AuthStorage,
	createBashTool,
	createReadTool,
	createWriteTool,
	createEditTool,
	createLsTool,
	createFindTool,
	createGrepTool,
	createExtensionRuntime,
	ModelRegistry,
	SessionManager,
	SettingsManager,
	type BashOperations,
	type ReadOperations,
	type WriteOperations,
	type EditOperations,
	type LsOperations,
	type FindOperations,
	type GrepOperations,
} from "@mariozechner/pi-coding-agent";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

// Pure in-memory sandbox — empty tmp dir as OverlayFs root (nothing on disk)
const SANDBOX_ROOT = mkdtempSync(join(tmpdir(), "pi-sandbox-"));

// ---------------------------------------------------------------------------
// Persist / restore OverlayFs snapshot to /tmp so files survive cold starts
// ---------------------------------------------------------------------------
const SNAPSHOT_PATH = join(tmpdir(), "pi-sandbox-snapshot.json");

interface SerializedEntry {
	type: "file" | "directory";
	content?: string; // base64 for files
	mode: number;
	mtime: string;
}

function persistSnapshot(snap: FsSnapshot) {
	try {
		const memory: Record<string, SerializedEntry> = {};
		for (const [path, entry] of snap.memory) {
			if (entry.type === "symlink") continue; // symlinks disabled in sandbox
			const se: SerializedEntry = { type: entry.type, mode: entry.mode, mtime: entry.mtime.toISOString() };
			if (entry.type === "file") se.content = Buffer.from(entry.content).toString("base64");
			memory[path] = se;
		}
		writeFileSync(SNAPSHOT_PATH, JSON.stringify({ memory, deleted: [...snap.deleted] }));
	} catch { /* ignore write errors */ }
}

function loadPersistedSnapshot(): FsSnapshot | null {
	try {
		const raw = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8"));
		const memory = new Map<string, import("just-bash").MemoryEntry>();
		for (const [path, se] of Object.entries(raw.memory) as [string, SerializedEntry][]) {
			if (se.type === "file") {
				memory.set(path, { type: "file", content: Buffer.from(se.content!, "base64"), mode: se.mode, mtime: new Date(se.mtime) });
			} else {
				memory.set(path, { type: "directory", mode: se.mode, mtime: new Date(se.mtime) });
			}
		}
		return { memory, deleted: new Set(raw.deleted || []) };
	} catch {
		return null;
	}
}

const SYSTEM_PROMPT = `You are an expert motion graphics engineer. 
You can chat and create animated videos using Remotion.

## Available tools
- read: Read file contents. Use this instead of cat or head.
- write: Create new files or complete rewrites.
- edit: Make surgical edits to files (old text must match exactly). Use for small changes instead of write.
- bash: Execute bash commands (prefer dedicated tools for file work)
- ls: List directory contents
- find: Find files by glob pattern
- grep: Search file contents for patterns
- No access to npm, node, pnpm, pip, or any package manager

## Tool guidelines
- Use read before editing — never edit blind
- Use edit for precise changes, write for new files or full rewrites
- Do NOT use bash (cat, sed, echo) for file operations — use the dedicated tools
- Be concise — let the code speak for itself

## Remotion overview
- You create .tsx files for scenes. The preview panel auto-detects code importing from "remotion" and renders it with the built-in Remotion Player, Any main.tsx index.tsx for "composition" would render error. 
- For long videos (like >3min):  you can write a \`.md\` sketch & plan, no need to plan code, just plan the content like a movie director. 


### Duration & multi-file scene design (CRITICAL)
- Each .tsx file should be a **self-contained scene of 15–30 seconds** max. This is the sweet spot for visual quality.
- For short requests (≤30s): create a single .tsx file.
- For longer requests (>30s): split into **multiple scene files** — one per scene. Name them descriptively:
  - \`scene-01-intro.tsx\` (15s)
  - \`scene-02-main.tsx\` (20s)
  - \`scene-03-outro.tsx\` (15s)
- Within each file, use \`<Sequence>\` to sub-divide into 3–5 second segments with distinct animations.
- NEVER stretch a single thin animation to fill time. Every frame must have something visually happening.
- Use staggered delays between elements for richness. No static holds longer than 1 second.
- Maintain a consistent visual style (colors, fonts, layout) across all scene files.

### Config comment
The FIRST line of the file MUST be:
\`\`\`
// @remotion fps:30 duration:FRAMES
\`\`\`
Calculate: FRAMES = seconds × fps. Example: 30s at 30fps = 900.

### Available imports (ONLY these are available — nothing else)

From "remotion":
  AbsoluteFill, Sequence, Img, Audio, Video,
  interpolate, interpolateColors, spring, Easing,
  useCurrentFrame, useVideoConfig

From "@remotion/shapes":
  Rect, Circle, Triangle, Star, Polygon, Ellipse, Heart, Pie,
  makeRect, makeCircle, makeTriangle, makeStar, makePolygon, makeEllipse, makeHeart, makePie

From "@remotion/transitions":
  TransitionSeries, linearTiming, springTiming

From "@remotion/transitions/*":
  fade, slide, wipe, flip, clockWipe

From "@remotion/lottie":
  Lottie

From "@remotion/three" + "three":
  ThreeCanvas, THREE (full Three.js namespace)

React hooks: useState, useEffect, useMemo, useRef, useCallback

### Reference example — study this for quality and structure

\`\`\`tsx
// @remotion fps:30 duration:450
import { useCurrentFrame, useVideoConfig, AbsoluteFill, interpolate, spring, Sequence } from "remotion";

const Title = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = "MOTION".split("");
  const lineW = interpolate(frame, [25, 55], [0, 280], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subOpacity = interpolate(frame, [45, 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill className="flex flex-col items-center justify-center" style={{ background: "radial-gradient(ellipse at 50% 55%, #1e1b4b 0%, #0a0a0f 70%)" }}>
      <div className="flex">
        {letters.map((c, i) => {
          const s = spring({ frame: Math.max(0, frame - i * 4), fps, config: { damping: 14, stiffness: 120 } });
          return <span key={i} className="text-[130px] font-black text-white inline-block" style={{ fontFamily: "Playfair Display, serif", opacity: s, transform: \`translateY(\${(1 - s) * 50}px)\` }}>{c}</span>;
        })}
      </div>
      <div className="mt-3" style={{ width: lineW, height: 2, background: "linear-gradient(90deg, transparent, #6366f1, transparent)" }} />
      <Sequence from={45}>
        <p className="text-lg tracking-[0.35em] uppercase mt-5 text-white/40" style={{ fontFamily: "Space Grotesk, sans-serif", opacity: subOpacity }}>
          The art of movement
        </p>
      </Sequence>
    </AbsoluteFill>
  );
};

const QuoteScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = ["Everything", "moves.", "Nothing", "is", "still."];
  return (
    <AbsoluteFill className="flex items-center justify-center bg-black px-24">
      <div className="flex flex-wrap gap-x-5 gap-y-2 justify-center">
        {words.map((w, i) => {
          const d = i * 7;
          const o = interpolate(frame, [d, d + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const y = spring({ frame: Math.max(0, frame - d), fps, config: { damping: 16 } });
          return <span key={i} className="text-5xl font-light text-white/90" style={{ fontFamily: "DM Sans, sans-serif", opacity: o, transform: \`translateY(\${(1 - y) * 25}px)\` }}>{w}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};

const EndScene = () => {
  const frame = useCurrentFrame();
  const glow = interpolate(Math.sin(frame / 10), [-1, 1], [10, 35]);
  const breathe = interpolate(Math.sin(frame / 10), [-1, 1], [0.96, 1.04]);
  const fadeOut = interpolate(frame, [110, 150], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill className="flex items-center justify-center bg-black" style={{ opacity: fadeOut }}>
      <div className="text-center" style={{ transform: \`scale(\${breathe})\` }}>
        <div className="text-8xl font-black" style={{ fontFamily: "Outfit, sans-serif", background: "linear-gradient(135deg, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: \`drop-shadow(0 0 \${glow}px rgba(129,140,248,0.4))\` }}>
          ∞
        </div>
        <p className="text-zinc-600 text-sm mt-6 tracking-[0.3em] uppercase" style={{ fontFamily: "Space Mono, monospace" }}>
          In perpetual motion
        </p>
      </div>
    </AbsoluteFill>
  );
};

export const MyAnimation = () => (
  <AbsoluteFill className="bg-black">
    <Sequence from={0} durationInFrames={150}><Title /></Sequence>
    <Sequence from={150} durationInFrames={150}><QuoteScene /></Sequence>
    <Sequence from={300} durationInFrames={150}><EndScene /></Sequence>
  </AbsoluteFill>
);
\`\`\`

Key patterns:
- **Tailwind for layout/colors** (\`className\`), **inline style only for animated values** (\`opacity\`, \`transform\`, dynamic \`width\`)
- Letter-by-letter stagger: \`spring({ frame: Math.max(0, frame - i * N) })\`
- Word-by-word reveal: same pattern with \`interpolate\` for opacity + \`spring\` for Y
- Gradient text: \`background: linear-gradient\` + \`WebkitBackgroundClip: "text"\`
- Breathing glow: \`Math.sin(frame / speed)\` → \`interpolate\`
- Fade to black: \`interpolate(frame, [N-40, N], [1, 0])\` on root opacity
- Fonts with purpose: Playfair Display (serif title), DM Sans (body), Outfit (display), Space Mono (label), Space Grotesk (subtitle)

### Remotion rules
- The FIRST line MUST be \`// @remotion fps:30 duration:FRAMES\`
- Export as: \`export const MyAnimation = () => { ... };\`
- Resolution: 1920x1080, 30fps. Use \`useVideoConfig()\` for timing — never hardcode fps.
- Use \`spring()\` for organic motion, \`interpolate()\` for linear progress
- Always use \`{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }\` with interpolate
- Tailwind CSS is available — you can use \`className\` with any Tailwind utility classes
- Available fonts: Inter, Playfair Display, Space Grotesk, DM Sans, Outfit, Space Mono (use via \`fontFamily\` or Tailwind \`font-\`)
- Set backgroundColor on AbsoluteFill from frame 0
- All constants (colors, text, timing) defined INSIDE the component body
- Do NOT use any packages beyond the imports listed above
- Helper components (scenes) defined as \`const SceneName = () => { ... }\` outside the main export

## Constraints
- Each .tsx file must be fully self-contained — no cross-file imports between your generated files
- Do NOT create any "composition" file that imports/sequences other scenes. The system automatically composes scenes in order. Just create the individual scene files.
- Do NOT use any packages beyond the Remotion imports listed above`;

// ---------------------------------------------------------------------------
// just-bash → pi-coding-agent adapters
// ---------------------------------------------------------------------------

function createJustBashOps(bashInstance: Bash): BashOperations {
	return {
		async exec(command, cwd, { onData, signal, timeout }) {
			const execPromise = bashInstance.exec(command, { cwd });
			let result: Awaited<ReturnType<typeof bashInstance.exec>>;
			if (timeout && timeout > 0) {
				const timeoutMs = timeout * 1000;
				result = (await Promise.race([
					execPromise,
					new Promise((_, reject) =>
						setTimeout(
							() => reject(new Error(`timeout:${timeout}`)),
							timeoutMs,
						),
					),
				])) as typeof result;
			} else {
				result = await execPromise;
			}
			if (signal?.aborted) throw new Error("aborted");
			if (result.stdout) onData(Buffer.from(result.stdout, "utf-8"));
			if (result.stderr) onData(Buffer.from(result.stderr, "utf-8"));
			return { exitCode: result.exitCode };
		},
	};
}

function createOverlayReadOps(fs: OverlayFs): ReadOperations {
	return {
		readFile: async (p: string) => Buffer.from(await fs.readFile(p), "utf-8"),
		access: async (p: string) => {
			if (!(await fs.exists(p))) {
				const err: NodeJS.ErrnoException = new Error(
					`ENOENT: no such file or directory, access '${p}'`,
				);
				err.code = "ENOENT";
				throw err;
			}
		},
	};
}

function createOverlayWriteOps(fs: OverlayFs): WriteOperations {
	return {
		writeFile: (p: string, c: string) => fs.writeFile(p, c),
		mkdir: (d: string) => fs.mkdir(d, { recursive: true }),
	};
}

function createOverlayEditOps(fs: OverlayFs): EditOperations {
	const r = createOverlayReadOps(fs);
	return { readFile: r.readFile, access: r.access, writeFile: (p, c) => fs.writeFile(p, c) };
}

function createOverlayLsOps(fs: OverlayFs): LsOperations {
	return {
		exists: (p: string) => fs.exists(p),
		stat: async (p: string) => {
			const s = await fs.stat(p);
			return { isDirectory: () => s.isDirectory };
		},
		readdir: (p: string) => fs.readdir(p),
	};
}

function createOverlayFindOps(fs: OverlayFs): FindOperations {
	return {
		exists: (p: string) => fs.exists(p),
		glob: async (pattern: string, cwd: string, opts: { ignore: string[]; limit: number }) => {
			const results: string[] = [];

			async function walk(dir: string) {
				if (results.length >= opts.limit) return;
				let entries: string[];
				try { entries = await fs.readdir(dir); } catch { return; }
				for (const entry of entries) {
					if (results.length >= opts.limit) return;
					const full = join(dir, entry);
					const rel = relative(cwd, full);
					if (opts.ignore.some((ig) => minimatch(rel, ig))) continue;
					let stat;
					try { stat = await fs.stat(full); } catch { continue; }
					if (stat.isDirectory) {
						await walk(full);
					} else if (minimatch(rel, pattern) || minimatch(entry, pattern)) {
						results.push(rel);
					}
				}
			}
			await walk(cwd);
			return results;
		},
	};
}

function createOverlayGrepOps(fs: OverlayFs): GrepOperations {
	return {
		isDirectory: async (p: string) => {
			const s = await fs.stat(p);
			return s.isDirectory;
		},
		readFile: async (p: string) => await fs.readFile(p),
	};
}

// ---------------------------------------------------------------------------
// Module-level singleton — persists across requests
// ---------------------------------------------------------------------------

let singleton: {
	session: AgentSession;
	sessionManager: SessionManager;
	overlayFs: OverlayFs;
	fsCheckpoints: Map<string, FsSnapshot>;
} | null = null;

export function getOrCreateSingleton() {
	if (singleton) return singleton;

	// --- Sandbox setup (writes allowed, stay in memory) ---
	const overlayFs = new OverlayFs({ root: SANDBOX_ROOT });

	// Restore files from /tmp if this is a cold start
	const persisted = loadPersistedSnapshot();
	if (persisted) {
		overlayFs.restore(persisted);
		console.log(`[agent] restored ${persisted.memory.size} files from /tmp`);
	}

	const mountPoint = overlayFs.getMountPoint();
	const bash = new Bash({ fs: overlayFs, cwd: mountPoint });

	// --- Pi-coding-agent setup ---
	const provider = process.env.OPENROUTER_API_KEY
		? "openrouter"
		: "anthropic";
	const apiKey =
		process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || "";
	const modelId = process.env.OPENROUTER_API_KEY
		? (process.env.PI_MODEL || "google/gemini-3-flash-preview")
		: (process.env.PI_MODEL || "claude-haiku-4-5-20251001");

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const model = getModel(provider as any, modelId as any);
	if (!model) {
		throw new Error(`Model "${provider}/${modelId}" not found`);
	}

	const authStorage = AuthStorage.create("/tmp/pi-website-auth.json");
	authStorage.setRuntimeApiKey(provider, apiKey);
	const modelRegistry = new ModelRegistry(authStorage);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const sandboxedTools: Record<string, any> = {
		bash: createBashTool(mountPoint, { operations: createJustBashOps(bash) }),
		read: createReadTool(mountPoint, {
			operations: createOverlayReadOps(overlayFs),
		}),
		write: createWriteTool(mountPoint, {
			operations: createOverlayWriteOps(overlayFs),
		}),
		edit: createEditTool(mountPoint, {
			operations: createOverlayEditOps(overlayFs),
		}),
		ls: createLsTool(mountPoint, {
			operations: createOverlayLsOps(overlayFs),
		}),
		find: createFindTool(mountPoint, {
			operations: createOverlayFindOps(overlayFs),
		}),
		grep: createGrepTool(mountPoint, {
			operations: createOverlayGrepOps(overlayFs),
		}),
	};

	const agent = new Agent({
		initialState: {
			systemPrompt: "",
			model,
			thinkingLevel: "off",
			tools: [],
		},
		sessionId: `web-${Date.now()}`,
		getApiKey: async () => apiKey,
	});

	const sessionDir = join(tmpdir(), "pi-session");
	const sessionManager = SessionManager.create(mountPoint, sessionDir);
	const settingsManager = SettingsManager.inMemory({
		compaction: { enabled: true },
	});

	sessionManager.appendModelChange(model.provider, model.id);
	sessionManager.appendThinkingLevelChange("off");

	const resourceLoader = {
		getExtensions: () => ({
			extensions: [],
			errors: [],
			runtime: createExtensionRuntime(),
		}),
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => SYSTEM_PROMPT,
		getAppendSystemPrompt: () => [],
		getPathMetadata: () => new Map(),
		extendResources: () => {},
		reload: async () => {},
	};

	const session = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd: mountPoint,
		resourceLoader,
		modelRegistry,
		baseToolsOverride: sandboxedTools,
		initialActiveToolNames: Object.keys(sandboxedTools),
		extensionRunnerRef: {},
	});

	const fsCheckpoints = new Map<string, FsSnapshot>();
	// Store initial checkpoint before any turns
	fsCheckpoints.set("initial", overlayFs.snapshot());

	singleton = { session, sessionManager, overlayFs, fsCheckpoints };
	console.log(`[agent] init model=${modelId}`);
	return singleton;
}

/** Return aggregated session stats + context usage (minimal, for footer). */
export function getSessionStats() {
	if (!singleton) return null;
	const stats = singleton.session.getSessionStats();
	const context = singleton.session.getContextUsage();
	return {
		totalTokens: stats.tokens.total,
		cost: stats.cost,
		contextPercent: context?.percent ?? null,
	};
}

/** Return detailed session stats for /session command. */
export function getFullSessionStats() {
	if (!singleton) return null;
	const stats = singleton.session.getSessionStats();
	const context = singleton.session.getContextUsage();
	const model = singleton.session.agent.state.model;
	return {
		model: model ? `${model.provider}/${model.id}` : "unknown",
		messages: stats.totalMessages,
		userMessages: stats.userMessages,
		assistantMessages: stats.assistantMessages,
		toolCalls: stats.toolCalls,
		tokens: {
			input: stats.tokens.input,
			output: stats.tokens.output,
			cacheRead: stats.tokens.cacheRead,
			cacheWrite: stats.tokens.cacheWrite,
			total: stats.tokens.total,
		},
		cost: stats.cost,
		context: context
			? {
					tokens: context.tokens,
					contextWindow: context.contextWindow,
					percent: context.percent,
				}
			: null,
	};
}

/** Manually compact the session context. */
export async function compactSession() {
	if (!singleton) throw new Error("No active session");
	const result = await singleton.session.compact();
	return {
		summary: result.summary,
		tokensBefore: result.tokensBefore,
	};
}

/** Persist current OverlayFs state to /tmp for cold-start recovery. */
export function persistCurrentSnapshot() {
	if (!singleton) return;
	persistSnapshot(singleton.overlayFs.snapshot());
}

/** Clear all state in-place — same instance, no orphan references. */
export async function clearSingleton() {
	if (!singleton) return;
	const { session, overlayFs, fsCheckpoints } = singleton;
	// Abort if agent is running
	if (session.isStreaming) {
		await session.abort();
	}
	// Clear files (restore to empty snapshot)
	overlayFs.restore({ memory: new Map(), deleted: new Set() });
	// Clear conversation
	await session.newSession();
	// Clear checkpoints and restore initial empty snapshot
	fsCheckpoints.clear();
	fsCheckpoints.set("initial", overlayFs.snapshot());
	// Clear persisted snapshot
	try { unlinkSync(SNAPSHOT_PATH); } catch { /* ignore if missing */ }
	console.log("[agent] cleared");
}
