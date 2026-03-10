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
	type Skill,
} from "@mariozechner/pi-coding-agent";
import { Agent, type AgentMessage, type AgentToolResult } from "@mariozechner/pi-agent-core";
import { getModel, type ToolResultMessage } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
// Pure in-memory sandbox — empty tmp dir as OverlayFs root (nothing on disk)
const SANDBOX_ROOT = mkdtempSync(join(tmpdir(), "pi-sandbox-"));


import { buildSystemPrompt } from "./system-prompt";
import { loadBundledSkills } from "./skills-loader";

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
// transformContext — summarize completed tool results + inject project state
// ---------------------------------------------------------------------------

/** Scan OverlayFs for .tsx scenes, extract duration from @remotion config comment. */
function getProjectState(fs: OverlayFs, mountPoint: string): string {
	const changes = fs.getOverlayChanges();
	const prefix = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`;
	const scenes: { name: string; seconds: number }[] = [];

	for (const c of changes) {
		if (!c.path.startsWith(prefix) || !c.path.endsWith(".tsx")) continue;
		const rel = c.path.slice(prefix.length);
		if (rel.startsWith("skills/")) continue;
		// Read first line to parse config
		let seconds = 0;
		try {
			const content = c.content;
			if (typeof content === "string") {
				const match = content.match(/\/\/\s*@remotion\s+fps:(\d+)\s+duration:(\d+)/);
				if (match) {
					seconds = Math.round(parseInt(match[2]) / parseInt(match[1]));
				}
			}
		} catch { /* skip */ }
		scenes.push({ name: rel, seconds });
	}

	if (scenes.length === 0) return "";

	scenes.sort((a, b) => a.name.localeCompare(b.name));
	const total = scenes.reduce((sum, s) => sum + s.seconds, 0);
	const list = scenes.map((s) => `  ${s.name} (${s.seconds}s)`).join("\n");
	return `[Project state: ${scenes.length} scene${scenes.length > 1 ? "s" : ""}, ${total}s total]\n${list}`;
}

/** Summarize completed write/edit tool results to save context space. */
function createTransformContext(fs: OverlayFs, mountPoint: string) {
	return async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
		// Inject project state as a synthetic message at the start
		const projectState = getProjectState(fs, mountPoint);

		const transformed = messages.map((msg) => {
			// Only transform toolResult messages for write/edit tools
			if (!msg || typeof msg !== "object") return msg;
			const m = msg as ToolResultMessage;
			if (m.role !== "toolResult") return msg;
			if (m.toolName !== "write" && m.toolName !== "edit") return msg;
			if (m.isError) return msg;

			// Extract text content
			const textParts = m.content
				?.filter((c) => c.type === "text")
				.map((c) => (c as { type: "text"; text: string }).text)
				.join("") ?? "";

			// Only summarize if content is large (> 500 chars means it likely has full file code in context)
			if (textParts.length < 500) return msg;

			// Create summarized version
			return {
				...m,
				content: [{ type: "text" as const, text: `[${m.toolName} completed — file content omitted from context, use read tool to view]` }],
			};
		});

		// Inject project state into the last user message (avoids breaking user/assistant alternation)
		if (projectState) {
			for (let i = transformed.length - 1; i >= 0; i--) {
				const m = transformed[i] as { role: string; content: unknown };
				if (m?.role === "user" && Array.isArray(m.content)) {
					transformed[i] = {
						...transformed[i]!,
						content: [{ type: "text" as const, text: projectState }, ...m.content],
					} as AgentMessage;
					break;
				}
			}
		}

		return transformed;
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
	skillsEnabled: boolean;
	imageGenEnabled: boolean;
	imageModel: string;
	searchEnabled: boolean;
	allSkills: Skill[];
}

// Persist across Next.js HMR — module-level Map gets wiped on hot reload
const sessions: Map<string, Singleton> =
	(globalThis as Record<string, unknown>).__piSessions as Map<string, Singleton>
	?? ((globalThis as Record<string, unknown>).__piSessions = new Map<string, Singleton>());

// Custom system prompt overrides — per session
const customSystemPrompts: Map<string, string> =
	(globalThis as Record<string, unknown>).__piCustomPrompts as Map<string, string>
	?? ((globalThis as Record<string, unknown>).__piCustomPrompts = new Map<string, string>());

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
// Web search tool
// ---------------------------------------------------------------------------

function createWebSearchTool(apiKey: string, searchState: { enabled: boolean }) {
	return {
		name: "web_search",
		label: "Web Search",
		description: "Search the web for real-time information, current events, latest docs, prices, or any facts you're unsure about. Returns a concise summary with source URLs.",
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
		}),
		async execute(
			_toolCallId: string,
			params: { query: string },
			signal?: AbortSignal,
		): Promise<AgentToolResult<Record<string, unknown>>> {
			if (!searchState.enabled) {
				return { content: [{ type: "text", text: "Web search is currently disabled." }], details: {} };
			}
			const searchModel = "google/gemini-3.1-flash-lite-preview:online";
			const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
				method: "POST",
				signal,
				headers: {
					"Authorization": `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: searchModel,
					messages: [{
						role: "user",
						content: `Search for: ${params.query}\n\nReturn concise bullet points with source URLs. No commentary.`,
					}],
				}),
			});
			if (!res.ok) {
				const err = await res.text();
				return { content: [{ type: "text", text: `Web search failed: ${err}` }], details: {} };
			}
			const data = await res.json();
			const content = data.choices?.[0]?.message?.content as string | undefined;
			if (!content) {
				return { content: [{ type: "text", text: "No search results" }], details: {} };
			}
			// Extract annotations if available
			const annotations = data.choices?.[0]?.message?.annotations as Array<{
				type: string;
				url_citation?: { url: string; title: string };
			}> | undefined;
			const sources = annotations
				?.filter((a) => a.type === "url_citation" && a.url_citation)
				.map((a) => `${a.url_citation!.title}: ${a.url_citation!.url}`)
				.join("\n") || "";
			const result = sources ? `${content}\n\nSources:\n${sources}` : content;
			console.log(`[search] query="${params.query.slice(0, 50)}" result=${result.length} chars`);
			return { content: [{ type: "text", text: result }], details: {} };
		},
	};
}

// ---------------------------------------------------------------------------
// Image generation tool
// ---------------------------------------------------------------------------

export const IMAGE_MODELS = [
	{ id: "google/gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash", desc: "fast" },
	{ id: "openai/gpt-5-image-mini", label: "GPT-5 Image Mini", desc: "balanced" },
	{ id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5", desc: "creative" },
	{ id: "sourceful/riverflow-v2-fast", label: "Riverflow v2", desc: "fast" },
];

function createImageGenTool(apiKey: string, overlayFs: OverlayFs, mountPoint: string, imageState: { enabled: boolean; model: string }) {
	/** Generate a single image, returning {url, filename} or {error, filename}. */
	async function generateOne(
		prompt: string,
		filename: string,
		signal?: AbortSignal,
	): Promise<{ ok: true; filename: string; url: string; size: number } | { ok: false; filename: string; error: string }> {
		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			signal,
			headers: {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: imageState.model,
				messages: [{ role: "user", content: prompt }],
				modalities: ["image"],
			}),
		});
		if (!res.ok) {
			const err = await res.text();
			return { ok: false, filename, error: err };
		}
		const data = await res.json();
		const imgUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
		if (!imgUrl?.startsWith("data:image/")) {
			return { ok: false, filename, error: "No image in response" };
		}
		const [, b64] = imgUrl.split(",");
		const buf = Buffer.from(b64, "base64");
		const name = filename.replace(/^\/+/, "").split("/").pop()!;
		const imgDir = join(mountPoint, "img");
		await overlayFs.mkdir(imgDir, { recursive: true });
		await overlayFs.writeFile(join(imgDir, name), new Uint8Array(buf));
		const url = `/img/${name}`;
		console.log(`[image] generated ${name} size=${(buf.length / 1024).toFixed(0)}KB`);
		return { ok: true, filename: name, url, size: buf.length };
	}

	return {
		name: "add_visual",
		label: "Add Visual",
		description: "Generate one or more images in parallel. Pass an array of {prompt, filename} items — all images are fetched concurrently for maximum speed. Returns URLs for <Img src={url}>.",
		parameters: Type.Object({
			images: Type.Array(
				Type.Object({
					prompt: Type.String({ description: "Describe the image to generate" }),
					filename: Type.String({ description: "Filename for the image, e.g. 'hero.png'" }),
				}),
				{ description: "List of images to generate in parallel. Use a single item for one image, or multiple items to batch.", minItems: 1 },
			),
		}),
		async execute(
			_toolCallId: string,
			params: { images: { prompt: string; filename: string }[] },
			signal?: AbortSignal,
		): Promise<AgentToolResult<{ imageUrl?: string; imageUrls?: string[] }>> {
			if (!imageState.enabled) {
				return { content: [{ type: "text", text: "Image generation is currently disabled." }], details: {} };
			}
			const results = await Promise.all(
				params.images.map((img) => generateOne(img.prompt, img.filename, signal)),
			);
			const lines: string[] = [];
			const urls: string[] = [];
			for (const r of results) {
				if (r.ok) {
					lines.push(`Image saved: /img/${r.filename} (${(r.size / 1024).toFixed(0)}KB). Use: <Img src="/img/${r.filename}" />`);
					urls.push(r.url);
				} else {
					lines.push(`Failed to generate ${r.filename}: ${r.error}`);
				}
			}
			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: { imageUrl: urls[0], imageUrls: urls },
			};
		},
	};
}

export async function getOrCreateSingleton(sessionId = "default") {
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

	const imageState = { enabled: false, model: IMAGE_MODELS[0].id };
	const searchState = { enabled: false };

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
		add_visual: createImageGenTool(apiKey, overlayFs, mountPoint, imageState),
		web_search: createWebSearchTool(apiKey, searchState),
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
		transformContext: createTransformContext(overlayFs, mountPoint),
	});

	const sessionDir = join(tmpdir(), `pi-session-${sessionId.slice(0, 8)}`);
	const sessionManager = SessionManager.create(mountPoint, sessionDir);
	const settingsManager = SettingsManager.inMemory({
		compaction: { enabled: true },
	});

	sessionManager.appendModelChange(model.provider, model.id);
	sessionManager.appendThinkingLevelChange("medium");

	// Load bundled skills into OverlayFs (e.g. remotion best practices)
	const skills = await loadBundledSkills(overlayFs, mountPoint);
	const skillState = { enabled: false };

	const resourceLoader = {
		getExtensions: () => ({
			extensions: [],
			errors: [],
			runtime: createExtensionRuntime(),
		}),
		getSkills: () => ({ skills: skillState.enabled ? skills : [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => customSystemPrompts.get(sessionId) ?? buildSystemPrompt({ imageGenEnabled: imageState.enabled, searchEnabled: searchState.enabled }),
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

	const entry: Singleton = { session, sessionManager, overlayFs, lastAccess: Date.now(), skillsEnabled: false, imageGenEnabled: false, imageModel: imageState.model, searchEnabled: false, allSkills: skills };
	// Wire skillState to entry so toggleSkills can flip it
	Object.defineProperty(entry, "skillsEnabled", {
		get: () => skillState.enabled,
		set: (v: boolean) => { skillState.enabled = v; },
		enumerable: true,
	});
	// Wire imageState to entry
	Object.defineProperty(entry, "imageGenEnabled", {
		get: () => imageState.enabled,
		set: (v: boolean) => { imageState.enabled = v; },
		enumerable: true,
	});
	Object.defineProperty(entry, "imageModel", {
		get: () => imageState.model,
		set: (v: string) => { imageState.model = v; },
		enumerable: true,
	});
	Object.defineProperty(entry, "searchEnabled", {
		get: () => searchState.enabled,
		set: (v: boolean) => { searchState.enabled = v; },
		enumerable: true,
	});
	sessions.set(sessionId, entry);
	console.log(`[agent] init session=${sessionId.slice(0, 8)} model=${modelId} (${sessions.size} active)`);
	return entry;
}

/** Return available skills for this session (always returns all, regardless of enabled state). */
export function getAvailableSkills(sessionId = "default") {
	const s = sessions.get(sessionId);
	if (!s) return [];
	return s.allSkills.map((sk) => ({
		name: sk.name,
		description: sk.description,
		filePath: sk.filePath,
	}));
}

/** Toggle skills on/off globally for a session. Returns new state. */
export function toggleSkills(sessionId = "default"): boolean {
	const s = sessions.get(sessionId);
	if (!s) return false;
	s.skillsEnabled = !s.skillsEnabled;
	// Trigger system prompt rebuild so AgentSession picks up the new getSkills() result
	s.session.setActiveToolsByName(s.session.getActiveToolNames());
	console.log(`[agent] skills ${s.skillsEnabled ? "enabled" : "disabled"} session=${sessionId.slice(0, 8)}`);
	return s.skillsEnabled;
}

/** Check if skills are enabled for a session. */
export function isSkillsEnabled(sessionId = "default"): boolean {
	const s = sessions.get(sessionId);
	return s?.skillsEnabled ?? false;
}

/** Toggle image gen on/off for a session. Returns new state. */
export function toggleImageGen(sessionId = "default"): boolean {
	const s = sessions.get(sessionId);
	if (!s) return false;
	s.imageGenEnabled = !s.imageGenEnabled;
	// Trigger system prompt rebuild so AgentSession picks up the new imageGenEnabled state
	s.session.setActiveToolsByName(s.session.getActiveToolNames());
	console.log(`[agent] image gen ${s.imageGenEnabled ? "enabled" : "disabled"} session=${sessionId.slice(0, 8)}`);
	return s.imageGenEnabled;
}

/** Check if image gen is enabled for a session. */
export function isImageGenEnabled(sessionId = "default"): boolean {
	const s = sessions.get(sessionId);
	return s?.imageGenEnabled ?? false;
}

/** Set the image model for a session. */
export function setImageModel(sessionId = "default", model: string): string {
	const s = sessions.get(sessionId);
	if (!s) return IMAGE_MODELS[0].id;
	s.imageModel = model;
	console.log(`[agent] image model set to ${model} session=${sessionId.slice(0, 8)}`);
	return s.imageModel;
}

/** Get the current image model for a session. */
export function getImageModel(sessionId = "default"): string {
	const s = sessions.get(sessionId);
	return s?.imageModel ?? IMAGE_MODELS[0].id;
}

/** Toggle web search on/off for a session. Returns new state. */
export function toggleSearch(sessionId = "default"): boolean {
	const s = sessions.get(sessionId);
	if (!s) return false;
	s.searchEnabled = !s.searchEnabled;
	// Trigger system prompt rebuild so AgentSession picks up the new searchEnabled state
	s.session.setActiveToolsByName(s.session.getActiveToolNames());
	console.log(`[agent] web search ${s.searchEnabled ? "enabled" : "disabled"} session=${sessionId.slice(0, 8)}`);
	return s.searchEnabled;
}

/** Check if web search is enabled for a session. */
export function isSearchEnabled(sessionId = "default"): boolean {
	const s = sessions.get(sessionId);
	return s?.searchEnabled ?? false;
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

/** Get the current system prompt (custom override or default). */
export function getSystemPrompt(sessionId = "default"): { prompt: string; isCustom: boolean } {
	const custom = customSystemPrompts.get(sessionId);
	if (custom) return { prompt: custom, isCustom: true };
	// Look up imageGenEnabled from the session if it exists
	const s = sessions.get(sessionId);
	return { prompt: buildSystemPrompt({ imageGenEnabled: s?.imageGenEnabled ?? false, searchEnabled: s?.searchEnabled ?? false }), isCustom: false };
}

/** Set a custom system prompt override. */
export function setSystemPrompt(sessionId = "default", prompt: string): void {
	customSystemPrompts.set(sessionId, prompt);
	console.log(`[agent] custom system prompt set session=${sessionId.slice(0, 8)} (${prompt.length} chars)`);
}

/** Clear custom system prompt, revert to default. */
export function resetSystemPrompt(sessionId = "default"): string {
	customSystemPrompts.delete(sessionId);
	const s = sessions.get(sessionId);
	const defaultPrompt = buildSystemPrompt({ imageGenEnabled: s?.imageGenEnabled ?? true, searchEnabled: s?.searchEnabled ?? false });
	console.log(`[agent] system prompt reset to default session=${sessionId.slice(0, 8)}`);
	return defaultPrompt;
}

/** Return user project files (only files under mountPoint, not system dirs). */
export function getUserFiles(sessionId = "default") {
	const s = sessions.get(sessionId);
	if (!s) return { changes: [], mountPoint: "" };
	const mountPoint = s.overlayFs.getMountPoint();
	const prefix = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`;
	const skillsPrefix = `${prefix}skills/`;
	const changes = s.overlayFs.getOverlayChanges()
		.filter((c) => c.path.startsWith(prefix) && !c.path.startsWith(skillsPrefix));
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
	// Re-load skills into OverlayFs (restore wiped them)
	const mountPoint = overlayFs.getMountPoint();
	await loadBundledSkills(overlayFs, mountPoint);
	await session.newSession();
	console.log(`[agent] cleared session=${sessionId.slice(0, 8)}`);
}
