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
import { Circle, Rect } from "@remotion/shapes";

const Title = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <h1 style={{ fontSize: 100, fontFamily: "Inter, sans-serif", color: "#fff", opacity, transform: \`scale(\${scale})\` }}>
        Motion Graphics
      </h1>
    </AbsoluteFill>
  );
};

const ShapesScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const COLOR_PRIMARY = "#4f46e5";
  const COLOR_ACCENT = "#f59e0b";
  const circleScale = spring({ frame, fps, delay: 10, config: { damping: 8 } });
  const rectRotation = interpolate(frame, [0, 90], [0, 360], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 80, flexDirection: "row" }}>
      <div style={{ transform: \`scale(\${circleScale})\` }}>
        <Circle radius={120} fill={COLOR_PRIMARY} />
      </div>
      <div style={{ transform: \`rotate(\${rectRotation}deg)\` }}>
        <Rect width={200} height={200} fill={COLOR_ACCENT} cornerRadius={20} />
      </div>
    </AbsoluteFill>
  );
};

export const MyAnimation = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      <Sequence from={0} durationInFrames={150}><Title /></Sequence>
      <Sequence from={150} durationInFrames={150}><ShapesScene /></Sequence>
      <Sequence from={300} durationInFrames={150}><Title /></Sequence>
    </AbsoluteFill>
  );
};
\`\`\`

Key patterns from this example:
- Scene components defined outside the export, each with their own animations
- \`spring()\` with config for organic motion, \`interpolate()\` with clamp for linear
- Constants (colors) as UPPER_SNAKE_CASE inside components
- Staggered delays via \`delay\` param in spring
- \`<Sequence>\` for scene timing — each scene is 5 seconds (150 frames)
- Background set on root AbsoluteFill from frame 0

### Remotion rules
- The FIRST line MUST be \`// @remotion fps:30 duration:FRAMES\`
- Export as: \`export const MyAnimation = () => { ... };\`
- Resolution: 1920x1080, 30fps. Use \`useVideoConfig()\` for timing — never hardcode fps.
- Use \`spring()\` for organic motion, \`interpolate()\` for linear progress
- Always use \`{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }\` with interpolate
- Use inline styles only (no CSS files), use \`fontFamily: "Inter, sans-serif"\`
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
