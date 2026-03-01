/**
 * Singleton module — OverlayFs + Bash + AgentSession persist across requests.
 * Uses a temporary empty directory as the overlay root (pure in-memory sandbox).
 */

import { Bash, OverlayFs } from "just-bash";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
	AgentSession,
	AuthStorage,
	createBashTool,
	createReadTool,
	createWriteTool,
	createEditTool,
	createLsTool,
	createExtensionRuntime,
	ModelRegistry,
	SessionManager,
	SettingsManager,
	type BashOperations,
	type ReadOperations,
	type WriteOperations,
	type EditOperations,
	type LsOperations,
} from "@mariozechner/pi-coding-agent";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

// Pure in-memory sandbox — empty tmp dir as OverlayFs root (nothing on disk)
const SANDBOX_ROOT = mkdtempSync(join(tmpdir(), "pi-sandbox-"));

const SYSTEM_PROMPT = `You are an expert frontend engineer in a browser-based sandbox playground.

You have a fully sandboxed in-memory filesystem. All files you create exist only in memory — the user can view and preview them in real-time in the Code Studio panel, and download when ready.

Available tools: bash, read, write, edit, ls.

## What you can do
- Create complete web projects (HTML, CSS, JS, TypeScript, React components)
- Write and edit files using the write/edit tools
- Run bash commands to explore, test, or process files
- Generate multi-file projects from scratch

## Design principles
- Use modern, clean design — avoid default browser styles
- Apply proper spacing, typography, and color contrast
- Make layouts responsive (use flexbox/grid, relative units)
- Ensure accessibility (semantic HTML, proper labels, sufficient contrast)
- Use a consistent color palette — prefer neutral backgrounds with accent colors

## Code guidelines
- When asked to build something, create the files directly — don't just describe them
- For web projects, prefer a single self-contained HTML file with inline CSS and JS
- If the user asks for React, create .tsx files — the preview supports React via Sandpack
- For React projects, include a default export component so the preview can render it
- Use Tailwind CSS via CDN (\`<script src="https://cdn.tailwindcss.com"></script>\`) for rapid styling in HTML files
- Keep responses concise — let the code speak for itself

## Constraints
- You do NOT have access to: npm, node, pnpm, pip, or any package manager
- Create self-contained projects — for HTML, inline everything; for React, import from npm packages (Sandpack resolves them automatically)
- The user sees files appear in real-time in the Code Studio panel`;

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

// ---------------------------------------------------------------------------
// Module-level singleton — persists across requests
// ---------------------------------------------------------------------------

let singleton: {
	session: AgentSession;
	overlayFs: OverlayFs;
} | null = null;

export function getOrCreateSingleton() {
	if (singleton) return singleton;

	// --- Sandbox setup (writes allowed, stay in memory) ---
	const overlayFs = new OverlayFs({ root: SANDBOX_ROOT });
	const mountPoint = overlayFs.getMountPoint();
	const bash = new Bash({ fs: overlayFs, cwd: mountPoint });

	// --- Pi-coding-agent setup ---
	const provider = process.env.OPENROUTER_API_KEY
		? "openrouter"
		: "anthropic";
	const apiKey =
		process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || "";
	const modelId = process.env.OPENROUTER_API_KEY
		? (process.env.PI_MODEL || "anthropic/claude-haiku-4.5")
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

	const sessionManager = SessionManager.inMemory();
	const settingsManager = SettingsManager.inMemory({
		compaction: { enabled: false },
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

	singleton = { session, overlayFs };
	console.log(`[agent] Session singleton created (pure in-memory sandbox)`);
	return singleton;
}

/** Destroy the current session — next getOrCreateSingleton() creates a fresh one. */
export function resetSingleton() {
	singleton = null;
	console.log("[agent] Session singleton reset");
}
