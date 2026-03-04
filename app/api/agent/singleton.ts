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
import { Agent, type AgentToolResult } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { randomUUID } from "crypto";

// Pure in-memory sandbox — empty tmp dir as OverlayFs root (nothing on disk)
const SANDBOX_ROOT = mkdtempSync(join(tmpdir(), "pi-sandbox-"));


import { SYSTEM_PROMPT } from "./system-prompt";

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

// In-memory image store — keyed by unique ID, persists across HMR
interface StoredImage { data: Buffer; mime: string }
const imageStore: Map<string, StoredImage> =
	(globalThis as Record<string, unknown>).__piImages as Map<string, StoredImage>
	?? ((globalThis as Record<string, unknown>).__piImages = new Map<string, StoredImage>());

export function getStoredImage(id: string): StoredImage | undefined {
	return imageStore.get(id);
}
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

// ---------------------------------------------------------------------------
// Image generation tool
// ---------------------------------------------------------------------------

const IMAGE_MODEL = "google/gemini-2.5-flash-image";

function createImageGenTool(apiKey: string) {
	return {
		name: "generate_image",
		label: "Generate Image",
		description: "Generate an image from a text prompt. Returns a URL you can use with <Img src={url}>.",
		parameters: Type.Object({
			prompt: Type.String({ description: "Describe the image to generate" }),
		}),
		async execute(
			_toolCallId: string,
			params: { prompt: string },
			signal?: AbortSignal,
		): Promise<AgentToolResult<{ imageUrl?: string }>> {
			const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
				method: "POST",
				signal,
				headers: {
					"Authorization": `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: IMAGE_MODEL,
					messages: [{ role: "user", content: params.prompt }],
					modalities: ["image"],
				}),
			});
			if (!res.ok) {
				const err = await res.text();
				return { content: [{ type: "text", text: `Image generation failed: ${err}` }], details: {} };
			}
			const data = await res.json();
			const imgUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
			if (!imgUrl?.startsWith("data:image/")) {
				return { content: [{ type: "text", text: "No image in response" }], details: {} };
			}
			// Parse data URI and store
			const [header, b64] = imgUrl.split(",");
			const mime = header.match(/data:([^;]+)/)?.[1] || "image/png";
			const buf = Buffer.from(b64, "base64");
			const id = randomUUID().slice(0, 12);
			imageStore.set(id, { data: buf, mime });
			const url = `/api/img/${id}`;
			console.log(`[image] generated id=${id} size=${(buf.length / 1024).toFixed(0)}KB`);
			return {
				content: [{ type: "text", text: `Image generated: ${url}` }],
				details: { imageUrl: url },
			};
		},
	};
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
		generate_image: createImageGenTool(apiKey),
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
