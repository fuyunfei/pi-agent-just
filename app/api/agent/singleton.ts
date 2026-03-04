/**
 * Singleton module — OverlayFs + AgentSession persist across requests.
 * Uses a temporary empty directory as the overlay root (pure in-memory sandbox).
 */

import { OverlayFs } from "just-bash";
import { mkdtempSync } from "fs";
import { join, relative } from "path";
import { tmpdir } from "os";
import { minimatch } from "minimatch";
import {
	AgentSession,
	AuthStorage,
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


const SYSTEM_PROMPT = `You are an expert motion graphics engineer using remotion.
You help users create and edit motion graphics clips as .tsx files.

## Tools

Built-in:
- read: Read file contents
- edit: Make surgical edits to files (find exact text and replace)
- write: Create or overwrite files
- grep: Search file contents for patterns
- ls: List directory contents
- find: Find files by glob pattern


## Code structure

Never output code in chat. Always use \`write\` or \`edit\` tools to create/modify files.

Each clip = one SELF-CONTAINED .tsx file. One file = one scene, ≈20 seconds.
DO NOT create index.tsx, main.tsx, timeline.tsx, App.tsx, or any "composition" / "orchestration" files.
DO NOT import between clip files. Each clip is independent — no shared state, no barrel exports.

Name clips descriptively: intro.tsx, explosion.tsx, aftermath.tsx, etc.
For longer content, split into multiple clips, for example:
  intro.tsx (10s)
  main-event.tsx (20s)
  aftermath.tsx (15s)
  conclusion.tsx (10s)

- For long videos (like >3min):  you can write a \`.md\` sketch & plan, no need to plan code, just plan the content like a movie director. 

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
  Rect(width, height), Circle(radius), Triangle(length, direction), Star(innerRadius, outerRadius, points), Polygon(radius, points), Ellipse(rx, ry), Heart(width), Pie(radius, progress)
  Note: shapes use specific size props (not generic width/height) — check the prop names above

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
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 20, stiffness: 80 } });
  const textOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [110, 150], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill className="flex items-center justify-center bg-black" style={{ opacity: fadeOut }}>
      <div className="text-center" style={{ transform: \`scale(\${scale})\` }}>
        <div className="text-8xl font-black" style={{ fontFamily: "Outfit, sans-serif", background: "linear-gradient(135deg, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          ∞
        </div>
        <p className="text-zinc-600 text-sm mt-6 tracking-[0.3em] uppercase" style={{ fontFamily: "Space Mono, monospace", opacity: textOpacity }}>
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
- Entrance then hold: spring in, then let it sit — stillness after motion has impact
- Fonts with purpose: Playfair Display (serif title), DM Sans (body), Outfit (display), Space Mono (label), Space Grotesk (subtitle)

### Remotion rules
- The FIRST line MUST be \`// @remotion fps:30 duration:FRAMES\`
- Export as: \`export const MyAnimation = () => { ... };\`
- Resolution: 1920x1080, 30fps. Use \`useVideoConfig()\` for timing — never hardcode fps.
- Use \`spring()\` for organic motion, \`interpolate()\` for linear progress
- Always use \`{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }\` with interpolate
- Tailwind CSS is available — you can use \`className\` with any Tailwind utility classes
- Available fonts: Inter, Playfair Display, Space Grotesk, DM Sans, Outfit, Space Mono (use via \`style={{ fontFamily: "Font Name, serif" }}\`)
- Set backgroundColor on AbsoluteFill from frame 0
- All constants (colors, text, timing) defined INSIDE the component body
- Do NOT use any packages beyond the imports listed above
- Helper components (scenes) defined as \`const SceneName = () => { ... }\` outside the main export

## Constraints
- Each .tsx file must be fully self-contained — no cross-file imports between your generated files
- Do NOT create any main.tsx , index.tsx, for "composition" file that imports/sequences other scenes. The system automatically composes scenes in order. Just create the individual scene files.
- Do NOT use any packages beyond the Remotion imports listed above`;

// ---------------------------------------------------------------------------
// OverlayFs → pi-coding-agent adapters
// ---------------------------------------------------------------------------

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
// Session ID helper
// ---------------------------------------------------------------------------

/** Extract session ID from request cookie. */
export function getSessionId(request: Request): string {
	const cookie = request.headers.get("cookie") || "";
	const match = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
	return match?.[1] || "default";
}

// ---------------------------------------------------------------------------
// Per-session singletons — keyed by session ID from cookie
// ---------------------------------------------------------------------------

interface Singleton {
	session: AgentSession;
	sessionManager: SessionManager;
	overlayFs: OverlayFs;
	lastAccess: number;
}

// Persist across Next.js HMR — module-level Map gets wiped on hot reload
const sessions: Map<string, Singleton> =
	(globalThis as Record<string, unknown>).__piSessions as Map<string, Singleton>
	?? ((globalThis as Record<string, unknown>).__piSessions = new Map<string, Singleton>());
const MAX_SESSIONS = 10;
const SESSION_TTL = 60 * 60 * 1000; // 1 hour

/** Evict expired sessions, and oldest if over limit. */
function evictSessions() {
	const now = Date.now();
	for (const [id, s] of sessions) {
		if (now - s.lastAccess > SESSION_TTL) {
			console.log(`[agent] evict session ${id.slice(0, 8)} (expired)`);
			sessions.delete(id);
		}
	}
	while (sessions.size >= MAX_SESSIONS) {
		let oldestId: string | null = null;
		let oldestTime = Infinity;
		for (const [id, s] of sessions) {
			if (s.lastAccess < oldestTime) { oldestTime = s.lastAccess; oldestId = id; }
		}
		if (oldestId) {
			console.log(`[agent] evict session ${oldestId.slice(0, 8)} (over limit)`);
			sessions.delete(oldestId);
		}
	}
}

export function getOrCreateSingleton(sessionId = "default") {
	const existing = sessions.get(sessionId);
	if (existing) {
		existing.lastAccess = Date.now();
		console.log(`[agent] reuse session=${sessionId.slice(0, 8)}`);
		return existing;
	}
	console.log(`[agent] session=${sessionId.slice(0, 8)} NOT FOUND in memory (${sessions.size} active), creating new`);

	evictSessions();

	// OverlayFs serves as an in-memory filesystem — the "overlay" layer is unused
	// since we mount on an empty tmpdir. We keep it because it implements the full
	// FS API (readFile, writeFile, readdir, stat, etc.) needed by tool adapters.
	const overlayFs = new OverlayFs({ root: SANDBOX_ROOT, mountPoint: "/project" });
	const mountPoint = overlayFs.getMountPoint();

	// --- Pi-coding-agent setup ---
	const provider = process.env.OPENROUTER_API_KEY
		? "openrouter"
		: "anthropic";
	const apiKey =
		(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || "").trim();
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
			thinkingLevel: "medium",
			tools: [],
		},
		sessionId: `web-${Date.now()}`,
		getApiKey: async () => apiKey,
	});

	const sessionDir = join(tmpdir(), `pi-session-${sessionId.slice(0, 8)}`);
	const sessionManager = SessionManager.create(mountPoint, sessionDir);
	const settingsManager = SettingsManager.inMemory({
		compaction: { enabled: true },
	});

	sessionManager.appendModelChange(model.provider, model.id);
	sessionManager.appendThinkingLevelChange("medium");

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

	const entry: Singleton = { session, sessionManager, overlayFs, lastAccess: Date.now() };
	sessions.set(sessionId, entry);
	console.log(`[agent] init session=${sessionId.slice(0, 8)} model=${modelId} (${sessions.size} active)`);
	return entry;
}

/** Return aggregated session stats + context usage (minimal, for footer). */
export function getSessionStats(sessionId = "default") {
	const s = sessions.get(sessionId);
	if (!s) return null;
	const stats = s.session.getSessionStats();
	const context = s.session.getContextUsage();
	return {
		totalTokens: stats.tokens.total,
		cost: stats.cost,
		contextPercent: context?.percent ?? null,
	};
}

/** Return detailed session stats for /session command. */
export function getFullSessionStats(sessionId = "default") {
	const s = sessions.get(sessionId);
	if (!s) return null;
	const stats = s.session.getSessionStats();
	const context = s.session.getContextUsage();
	const model = s.session.agent.state.model;
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
export async function compactSession(sessionId = "default") {
	const s = sessions.get(sessionId);
	if (!s) throw new Error("No active session");
	const result = await s.session.compact();
	return {
		summary: result.summary,
		tokensBefore: result.tokensBefore,
	};
}

/** Return user project files (only files under mountPoint, not system dirs). */
export function getUserFiles(sessionId = "default") {
	const s = sessions.get(sessionId);
	if (!s) return { changes: [], mountPoint: "" };
	const mountPoint = s.overlayFs.getMountPoint();
	const prefix = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`;
	const changes = s.overlayFs.getOverlayChanges()
		.filter((c) => c.path.startsWith(prefix));
	return { changes, mountPoint };
}

/** Clear all state in-place — same instance, no orphan references. */
export async function clearSingleton(sessionId = "default") {
	const s = sessions.get(sessionId);
	if (!s) return;
	const { session, overlayFs } = s;
	if (session.isStreaming) {
		await session.abort();
	}
	overlayFs.restore({ memory: new Map(), deleted: new Set() });
	await session.newSession();
	console.log(`[agent] cleared session=${sessionId.slice(0, 8)}`);
}
