/**
 * Singleton module — OverlayFs + Bash + AgentSession persist across requests.
 *
 * SANDBOX_ROOT env var controls which directory is mounted into the overlay.
 * Defaults to the bundled _agent-data/ directory.
 */

import { Bash, OverlayFs } from "just-bash";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const SANDBOX_ROOT = process.env.SANDBOX_ROOT || join(__dirname, "./_agent-data");

const SYSTEM_PROMPT = `You are an expert on just-bash, a TypeScript bash interpreter with an in-memory virtual filesystem.

You have access to a sandboxed environment with the full source code of:
- just-bash/ - The main bash interpreter
- bash-tool/ - AI SDK tool for bash

Refer to the README.md of the projects to answer questions about just-bash and bash-tool
themselves which is your main focus. Never talk about this demo implementation unless asked explicitly.

Use the sandbox to explore the source code, demonstrate commands, and help users understand:
- How to use just-bash and bash-tool
- Bash scripting in general
- The implementation details of just-bash

Available tools: bash, read, write, edit, ls.
Use bash to run commands. Use read to view files.
You can create and modify files — writes stay in an in-memory overlay (safe sandbox).

Keep responses concise. You do not have access to pnpm, npm, or node.`;

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
	console.log(`[agent] Session singleton created (root: ${SANDBOX_ROOT})`);
	return singleton;
}
