"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import type { SandpackClient } from "@codesandbox/sandpack-client";
import type { PlayerRef } from "@remotion/player";
import type { BundledLanguage } from "shiki";
import type { OverlayChange } from "./types";
import { getLanguageFromPath } from "./file-icons";
import { compileRemotionCode, isRemotionCode, parseRemotionConfig } from "./remotion-compiler";
import {
	CodeBlock,
	CodeBlockHeader,
	CodeBlockTitle,
	CodeBlockFilename,
	CodeBlockActions,
	CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";

function getExtension(filename: string): string {
	const dot = filename.lastIndexOf(".");
	return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

const SANDPACK_EXTENSIONS = new Set(["tsx", "jsx", "ts", "js"]);

const fill = { flex: 1, minHeight: 0, minWidth: 0 } as const;

function JsonPreview({ content }: { content: string }) {
	const formatted = useMemo(() => {
		try {
			return JSON.stringify(JSON.parse(content), null, 2);
		} catch {
			return content;
		}
	}, [content]);

	return (
		<pre style={{ ...fill, overflow: "auto", margin: 0, padding: 16 }} className="text-[13px] leading-[1.6] font-mono studio-text whitespace-pre-wrap">
			{formatted}
		</pre>
	);
}

function MarkdownPreview({ content }: { content: string }) {
	const html = useMemo(() => {
		let out = content
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
		out = out.replace(/^### (.+)$/gm, "<h3>$1</h3>");
		out = out.replace(/^## (.+)$/gm, "<h2>$1</h2>");
		out = out.replace(/^# (.+)$/gm, "<h1>$1</h1>");
		out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
		out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
		out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
		out = out.replace(
			/```[\s\S]*?\n([\s\S]*?)```/g,
			"<pre><code>$1</code></pre>",
		);
		out = out.replace(
			/\[([^\]]+)\]\(([^)]+)\)/g,
			'<a href="$2" target="_blank" rel="noopener">$1</a>',
		);
		out = out.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
		out = out.replace(/\n\n/g, "</p><p>");
		out = `<p>${out}</p>`;
		out = out.replace(/([^>])\n([^<])/g, "$1<br>$2");
		return out;
	}, [content]);

	return (
		<div
			style={{ ...fill, overflow: "auto", padding: 24 }}
			className="studio-markdown"
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

function SvgPreview({ content }: { content: string }) {
	const src = useMemo(
		() => `data:image/svg+xml,${encodeURIComponent(content)}`,
		[content],
	);
	return (
		<div style={{ ...fill, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }} className="studio-surface">
			<img src={src} alt="SVG preview" style={{ maxWidth: "100%", maxHeight: "100%" }} />
		</div>
	);
}

function HtmlPreview({ content }: { content: string }) {
	const srcdoc = content.includes("<html")
		? content
		: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;margin:20px;color-scheme:light dark;color:CanvasText;background:Canvas}</style></head><body>${content}</body></html>`;

	return (
		<iframe
			srcDoc={srcdoc}
			sandbox="allow-scripts"
			title="Preview"
			style={{ ...fill, border: "none", display: "block" }}
		/>
	);
}

/** Strip the mountPoint prefix from a path to get a Sandpack-relative path */
function toSandpackPath(fullPath: string, mountPoint: string): string {
	let p = fullPath;
	if (mountPoint && p.startsWith(mountPoint)) {
		p = p.slice(mountPoint.length);
	}
	if (!p.startsWith("/")) p = `/${p}`;
	return p;
}

/** Build Sandpack files object from OverlayChange list + current active file */
function buildSandpackFiles(
	changes: OverlayChange[],
	activeFilePath: string,
	activeContent: string,
	mountPoint: string,
) {
	const files: Record<string, { code: string }> = {};

	// Add all project files from changes
	for (const change of changes) {
		if (change.type === "deleted" || !change.content) continue;
		const path = toSandpackPath(change.path, mountPoint);
		files[path] = { code: change.content };
	}

	// Ensure the active file has latest content
	const activePath = toSandpackPath(activeFilePath, mountPoint);
	files[activePath] = { code: activeContent };

	return files;
}

/** Extract third-party package names from import/require statements across all files */
function extractDependencies(files: Record<string, { code: string }>): Record<string, string> {
	const deps: Record<string, string> = {};
	const importRe = /(?:import\s+[\s\S]*?from\s+|import\s+|require\s*\(\s*)["']([^"'./][^"']*)["']/g;

	for (const file of Object.values(files)) {
		for (const match of file.code.matchAll(importRe)) {
			const specifier = match[1];
			const pkgName = specifier.startsWith("@")
				? specifier.split("/").slice(0, 2).join("/")
				: specifier.split("/")[0];
			if (!deps[pkgName]) {
				deps[pkgName] = "latest";
			}
		}
	}
	return deps;
}

/** Detect if the project has an entry point, or create one */
function ensureEntry(files: Record<string, { code: string }>, activeFilePath: string) {
	// If there's already an index.tsx/index.jsx/index.js/App.tsx, use it
	const entryPaths = ["/index.tsx", "/index.jsx", "/index.js", "/src/index.tsx", "/src/index.jsx", "/src/index.js"];
	for (const p of entryPaths) {
		if (files[p]) return files;
	}

	// If the active file has a default export, create an entry that imports it
	const activePath = activeFilePath.startsWith("/") ? activeFilePath : `/${activeFilePath}`;
	const activeCode = files[activePath]?.code ?? "";
	const hasDefaultExport = /export\s+default\s/.test(activeCode);

	if (hasDefaultExport) {
		// Create an entry point that renders the active file's default export
		const importPath = activePath.replace(/\.(tsx|jsx|ts|js)$/, "");
		files["/index.tsx"] = {
			code: `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "${importPath}";\ncreateRoot(document.getElementById("root")!).render(<App />);\n`,
		};
	} else {
		// Wrap the active file content as the entry
		files["/index.tsx"] = {
			code: `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport "${activePath}";\nif (!document.getElementById("root")?.childNodes.length) {\n  document.getElementById("root")!.textContent = "Running...";\n}\n`,
		};
	}

	return files;
}

interface RemotionScene {
	filename: string;
	code: string;
}

/** Format frame count as mm:ss */
function formatTime(frames: number, fps: number): string {
	const totalSec = Math.floor(frames / fps);
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

interface CompiledScene {
	Component: React.ComponentType;
	config: { fps: number; durationInFrames: number };
	filename: string;
	code: string;
}

function RemotionPreview({ scenes }: { scenes: RemotionScene[] }) {
	const [PlayerComp, setPlayerComp] = useState<typeof import("@remotion/player").Player | null>(null);
	const playerRef = useRef<PlayerRef>(null);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [playing, setPlaying] = useState(true);
	const [currentFrame, setCurrentFrame] = useState(0);

	// Compiled scenes
	const [compiled, setCompiled] = useState<CompiledScene[]>([]);
	const [error, setError] = useState<string | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const keyRef = useRef(0);
	const [playerKey, setPlayerKey] = useState(0);

	const sceneIndex = Math.min(currentIndex, Math.max(0, compiled.length - 1));

	// Stable keys for dependency arrays — avoids recomputing .map().join() on every frame
	const scenesKey = useMemo(() => scenes.map((s) => s.code).join("\0"), [scenes]);
	const compiledKey = useMemo(() => compiled.map((s) => s.code).join("\0"), [compiled]);
	const current = compiled[sceneIndex];

	// Compute scene offsets for progress bar
	const sceneOffsets = useMemo(() => {
		const offsets: number[] = [];
		let total = 0;
		for (const s of compiled) {
			offsets.push(total);
			total += s.config.durationInFrames;
		}
		return { offsets, totalFrames: total };
	}, [compiled]);

	// Lazy-load @remotion/player
	useEffect(() => {
		import("@remotion/player").then((mod) => setPlayerComp(() => mod.Player));
	}, []);

	// Debounced compile ALL scenes
	useEffect(() => {
		clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			const results: CompiledScene[] = [];
			let firstError: string | null = null;
			for (const scene of scenes) {
				const result = compileRemotionCode(scene.code);
				if (result.Component) {
					results.push({
						Component: result.Component,
						config: parseRemotionConfig(scene.code),
						filename: scene.filename,
						code: scene.code,
					});
				} else if (!firstError) {
					firstError = `${scene.filename}: ${result.error}`;
				}
			}
			if (results.length > 0) {
				setCompiled(results);
				keyRef.current += 1;
				setPlayerKey(keyRef.current);
				setError(firstError);
			} else {
				setError(firstError || "No valid scenes");
			}
		}, 600);
		return () => clearTimeout(debounceRef.current);
	}, [scenesKey]);

	// Emit render data for header ExportButton
	useEffect(() => {
		if (compiled.length > 0) {
			window.dispatchEvent(new CustomEvent("studio:render-data", {
				detail: {
					scenes: compiled.map((s) => ({
						code: s.code,
						filename: s.filename,
						durationInFrames: s.config.durationInFrames,
					})),
					fps: compiled[0].config.fps,
				},
			}));
		}
	}, [compiledKey]);

	// Emit current scene index for sidebar sync
	useEffect(() => {
		window.dispatchEvent(new CustomEvent("studio:scene-update", {
			detail: { index: sceneIndex },
		}));
	}, [sceneIndex]);

	const switchScene = useCallback((nextIndex: number) => {
		setCurrentIndex(nextIndex);
		setCurrentFrame(0);
	}, []);

	// Listen for scene selection from sidebar or chat
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			let idx: number | undefined;
			if (typeof detail?.index === "number") {
				idx = detail.index;
			} else if (typeof detail?.filename === "string") {
				idx = compiled.findIndex((s) => s.filename === detail.filename);
			}
			if (idx != null && idx >= 0 && idx < compiled.length) {
				switchScene(idx);
			}
		};
		window.addEventListener("studio:scene-select", handler);
		return () => window.removeEventListener("studio:scene-select", handler);
	}, [compiled, switchScene]);

	// Track frame updates — re-attach when Player remounts (playerKey changes)
	useEffect(() => {
		const player = playerRef.current;
		if (!player) return;
		const onFrame = (e: { detail: { frame: number } }) => setCurrentFrame(e.detail.frame);
		const onPlay = () => setPlaying(true);
		const onPause = () => setPlaying(false);
		player.addEventListener("frameupdate", onFrame);
		player.addEventListener("play", onPlay);
		player.addEventListener("pause", onPause);
		return () => {
			player.removeEventListener("frameupdate", onFrame);
			player.removeEventListener("play", onPlay);
			player.removeEventListener("pause", onPause);
		};
	}, [playerKey]);

	// Remount Player when scene index changes (ensures autoPlay fires for new scene)
	useEffect(() => {
		keyRef.current += 1;
		setPlayerKey(keyRef.current);
	}, [sceneIndex]);

	// Auto-advance on scene end — with crossfade
	useEffect(() => {
		const player = playerRef.current;
		if (!player) return;
		const onEnded = () => {
			const next = sceneIndex < compiled.length - 1 ? sceneIndex + 1 : 0;
			switchScene(next);
		};
		player.addEventListener("ended", onEnded);
		return () => player.removeEventListener("ended", onEnded);
	}, [sceneIndex, compiled.length, playerKey, switchScene]);

	// Click video to toggle play/pause with visual feedback
	const [showPlayIcon, setShowPlayIcon] = useState<"play" | "pause" | null>(null);
	const iconTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const togglePlay = useCallback(() => {
		const player = playerRef.current;
		if (!player) return;
		if (playing) {
			player.pause();
			setShowPlayIcon("pause");
		} else {
			player.play();
			setShowPlayIcon("play");
		}
		clearTimeout(iconTimerRef.current);
		iconTimerRef.current = setTimeout(() => setShowPlayIcon(null), 600);
	}, [playing]);

	const [runtimeError, setRuntimeError] = useState<string | null>(null);

	const errorFallback: import("@remotion/player").ErrorFallback = useCallback(
		({ error: err }: { error: Error }) => {
			// Propagate error to state so we can render clickable overlay outside pointerEvents:none
			setTimeout(() => setRuntimeError(err.message), 0);
			return (
				<div style={{ ...fill, background: "#1a1a2e" }} />
			);
		},
		[],
	);

	// Clear runtime error on scene change or recompile
	useEffect(() => {
		setRuntimeError(null);
	}, [sceneIndex, playerKey]);

	// Click on progress bar to seek — calculate which segment and position
	const barRef = useRef<HTMLDivElement>(null);
	const handleBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		e.stopPropagation();
		const bar = barRef.current;
		if (!bar || compiled.length === 0) return;

		const barRect = bar.getBoundingClientRect();
		const clickX = e.clientX - barRect.left;
		const globalRatio = Math.max(0, Math.min(1, clickX / barRect.width));
		const globalTargetFrame = Math.floor(globalRatio * sceneOffsets.totalFrames);

		// Find which scene this frame falls in
		let accumFrames = 0;
		for (let i = 0; i < compiled.length; i++) {
			const sceneDur = compiled[i].config.durationInFrames;
			if (globalTargetFrame < accumFrames + sceneDur || i === compiled.length - 1) {
				const targetFrame = Math.min(globalTargetFrame - accumFrames, sceneDur - 1);
				if (i !== sceneIndex) {
					setCurrentIndex(i);
					setTimeout(() => playerRef.current?.seekTo(targetFrame), 50);
				} else {
					playerRef.current?.seekTo(targetFrame);
				}
				break;
			}
			accumFrames += sceneDur;
		}
	}, [compiled, sceneIndex, sceneOffsets.totalFrames]);

	if (!PlayerComp) {
		return (
			<div style={{ ...fill, display: "flex", alignItems: "center", justifyContent: "center" }} className="studio-surface studio-dim text-sm">
				Loading Remotion Player...
			</div>
		);
	}

	if (compiled.length === 0 && error) {
		const sendFix = () => {
			window.dispatchEvent(new CustomEvent("studio:retry-scene", {
				detail: { filename: scenes[0]?.filename || "scene", error, type: "compile" },
			}));
		};
		return (
			<div style={{ ...fill, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }} className="studio-surface">
				<div style={{ color: "#ff6b6b", fontSize: 14, fontFamily: "Inter, system-ui" }}>Compilation Error</div>
				<div style={{ color: "#aaa", fontSize: 12, fontFamily: "monospace", textAlign: "center", maxWidth: "80%", wordBreak: "break-word", whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>{error}</div>
				<button
					type="button"
					onClick={sendFix}
					className="error-fix-button"
				>
					Ask AI to fix
				</button>
			</div>
		);
	}

	if (!current) return null;

	// Progress bar calculations
	const { offsets, totalFrames } = sceneOffsets;
	const globalFrame = offsets[sceneIndex] + currentFrame;
	const fps = current.config.fps;

	const sendFixPartial = () => {
		if (error) {
			window.dispatchEvent(new CustomEvent("studio:retry-scene", {
				detail: { filename: scenes[0]?.filename || "scene", error, type: "compile" },
			}));
		}
	};

	return (
		<div style={{ ...fill, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }} className="studio-surface">
			{/* Video area — click to play/pause */}
			<div
				style={{
					position: "relative", cursor: "pointer", aspectRatio: "16/9", width: "100%", maxWidth: 960,
					borderRadius: 8, overflow: "hidden", background: "#000",
					boxShadow: "0 2px 20px rgba(0,0,0,0.25), 0 0 0 1px rgba(128,128,128,0.1)",
				}}
				onClick={togglePlay}
			>
				{/* Partial error overlay — inside the video */}
				{error && (
					<div
						onClick={(e) => e.stopPropagation()}
						style={{
							position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
							padding: "8px 12px", display: "flex", alignItems: "center", gap: 8,
							fontSize: 11, fontFamily: "monospace", color: "#ff6b6b",
							background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
						}}
					>
						<span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{error}</span>
						<button
							type="button"
							onClick={sendFixPartial}
							className="error-fix-button-sm"
						>
							Fix
						</button>
					</div>
				)}
				{/* Runtime error overlay — outside pointerEvents:none player wrapper */}
				{runtimeError && (
					<div
						onClick={(e) => e.stopPropagation()}
						style={{
							position: "absolute", inset: 0, zIndex: 20,
							display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
							background: "rgba(10,10,30,0.92)", backdropFilter: "blur(4px)",
						}}
					>
						<div style={{ color: "#ff6b6b", fontSize: 14, fontFamily: "Inter, system-ui" }}>Runtime Error</div>
						<div style={{ color: "#aaa", fontSize: 12, fontFamily: "monospace", textAlign: "center", maxWidth: "80%", wordBreak: "break-word", whiteSpace: "pre-wrap", maxHeight: 100, overflow: "auto" }}>{runtimeError}</div>
						<button
							type="button"
							onClick={() => {
								window.dispatchEvent(new CustomEvent("studio:retry-scene", {
									detail: { filename: current?.filename || "scene", error: runtimeError, type: "runtime" },
								}));
							}}
							className="error-fix-button"
						>
							Ask AI to fix
						</button>
					</div>
				)}
				{/* Play/Pause indicator */}
				{showPlayIcon && (
					<div style={{
						position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
						zIndex: 10, pointerEvents: "none",
					}}>
						<div style={{
							width: 56, height: 56, borderRadius: "50%",
							background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
							display: "flex", alignItems: "center", justifyContent: "center",
							animation: "player-icon-fade 0.6s ease forwards",
						}}>
							{showPlayIcon === "play" ? (
								<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="6,4 20,12 6,20" /></svg>
							) : (
								<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="4" height="16" rx="1" /><rect x="15" y="4" width="4" height="16" rx="1" /></svg>
							)}
						</div>
					</div>
				)}
				{/* Watermark */}
				<img src="/logo.svg" alt="" style={{ position: "absolute", bottom: 12, right: 12, width: 24, opacity: 0.15, pointerEvents: "none", zIndex: 5 }} />
				<div style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
					<PlayerComp
						ref={playerRef}
						key={playerKey}
						component={current.Component}
						durationInFrames={current.config.durationInFrames}
						fps={fps}
						compositionHeight={1080}
						compositionWidth={1920}
						style={{ width: "100%", height: "100%" }}
						autoPlay
						loop={compiled.length <= 1}
						errorFallback={errorFallback}
					/>
				</div>
			</div>

			{/* Progress bar + time */}
			<div style={{ width: "100%", maxWidth: 960, display: "flex", alignItems: "center", gap: 12, padding: "20px 0 8px" }}>
				<div
					ref={barRef}
					onClick={handleBarClick}
					className="player-bar"
					style={{ display: "flex", gap: 3, flex: 1, cursor: "pointer", padding: "6px 0" }}
				>
					{compiled.map((scene, i) => {
						const weight = scene.config.durationInFrames / totalFrames;
						let segProgress = 0;
						if (i < sceneIndex) segProgress = 1;
						else if (i === sceneIndex) segProgress = currentFrame / scene.config.durationInFrames;
						return (
							<div
								key={scene.filename}
								className="player-bar-segment"
								style={{ flex: weight, height: 4, background: "var(--border)", borderRadius: 3, overflow: "hidden", transition: "height 0.15s" }}
							>
								<div style={{ width: `${segProgress * 100}%`, height: "100%", background: "#6366f1", borderRadius: 3 }} />
							</div>
						);
					})}
				</div>
				<div style={{ fontSize: 11, fontFamily: "Inter, system-ui", color: "var(--muted-foreground)", flexShrink: 0, whiteSpace: "nowrap" }}>
					{formatTime(globalFrame, fps)} / {formatTime(totalFrames, fps)}
				</div>
			</div>
		</div>
	);
}

function SandpackPreview({
	content,
	filename,
	changes,
	mountPoint,
}: {
	content: string;
	filename: string;
	changes: OverlayChange[];
	mountPoint: string;
}) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const clientRef = useRef<SandpackClient | null>(null);
	const [ready, setReady] = useState(false);

	// Build the Sandpack-relative path from filename
	const filePath = useMemo(() => {
		const match = changes.find((c) => c.path.endsWith(filename) || c.path.endsWith(`/${filename}`));
		return match ? toSandpackPath(match.path, mountPoint) : `/${filename}`;
	}, [changes, filename, mountPoint]);

	// Build files object
	const sandpackFiles = useMemo(() => {
		const files = buildSandpackFiles(changes, filePath, content, mountPoint);
		ensureEntry(files, filePath);

		// Auto-detect dependencies from imports and merge into package.json
		const detectedDeps = extractDependencies(files);
		// Always ensure react/react-dom
		detectedDeps["react"] = "^19.0.0";
		detectedDeps["react-dom"] = "^19.0.0";

		if (files["/package.json"]) {
			// Merge detected deps into existing package.json
			try {
				const pkg = JSON.parse(files["/package.json"].code);
				pkg.dependencies = { ...detectedDeps, ...pkg.dependencies };
				files["/package.json"] = { code: JSON.stringify(pkg) };
			} catch {
				// If parse fails, overwrite
				files["/package.json"] = {
					code: JSON.stringify({ main: "/index.tsx", dependencies: detectedDeps }),
				};
			}
		} else {
			files["/package.json"] = {
				code: JSON.stringify({ main: "/index.tsx", dependencies: detectedDeps }),
			};
		}

		// Ensure index.html exists
		if (!files["/public/index.html"] && !files["/index.html"]) {
			files["/public/index.html"] = {
				code: `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>\n<body><div id="root"></div></body>\n</html>`,
			};
		}

		return files;
	}, [changes, filePath, content]);

	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) return;

		let disposed = false;

		async function init() {
			try {
				const { loadSandpackClient } = await import("@codesandbox/sandpack-client");
				if (disposed) return;

				const client = await loadSandpackClient(
					iframe!,
					{
						files: sandpackFiles,
						template: "create-react-app-typescript",
					},
					{
						showOpenInCodeSandbox: false,
						showErrorScreen: true,
						showLoadingScreen: true,
					},
				);

				if (disposed) {
					client.destroy();
					return;
				}

				clientRef.current = client;

				client.listen((msg) => {
					if (msg.type === "action" && "action" in msg && msg.action === "show-error") {
						setReady(false);
					}
					if (msg.type === "done") {
						setReady(true);
					}
				});
			} catch {
				// Sandpack failed to load — stay on code view
			}
		}

		init();

		return () => {
			disposed = true;
			if (clientRef.current) {
				clientRef.current.destroy();
				clientRef.current = null;
			}
		};
	// Only re-init when the client doesn't exist yet
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Update files when they change (without re-creating the client)
	useEffect(() => {
		const client = clientRef.current;
		if (!client) return;
		client.updateSandbox({ files: sandpackFiles });
	}, [sandpackFiles]);

	const lang = getLanguageFromPath(filename);

	return (
		<div style={{ ...fill, position: "relative" }}>
			{/* Code view — shown by default, hidden when preview is ready */}
			{!ready && (
				<div style={{ ...fill, overflow: "auto", position: "absolute", inset: 0, zIndex: 1 }}>
					<CodeBlock code={content} language={lang as BundledLanguage} showLineNumbers className="h-full rounded-none border-0">
						<CodeBlockHeader>
							<CodeBlockTitle><CodeBlockFilename>{filename}</CodeBlockFilename></CodeBlockTitle>
							<CodeBlockActions><CodeBlockCopyButton /></CodeBlockActions>
						</CodeBlockHeader>
					</CodeBlock>
				</div>
			)}
			{/* Sandpack iframe — always mounted (loads in background), visible when ready */}
			<iframe
				ref={iframeRef}
				title="Sandpack Preview"
				style={{ ...fill, border: "none", display: "block", visibility: ready ? "visible" : "hidden" }}
			/>
		</div>
	);
}

/** Collect all remotion scene files from changes, sorted by filename */
function collectRemotionScenes(
	changes: OverlayChange[],
	activeFilename: string,
	activeContent: string,
): RemotionScene[] {
	const scenes: RemotionScene[] = [];
	const seen = new Set<string>();

	for (const c of changes) {
		if (c.type === "deleted" || !c.content) continue;
		const ext = getExtension(c.path);
		if (!SANDPACK_EXTENSIONS.has(ext)) continue;
		if (!isRemotionCode(c.content)) continue;
		const name = c.path.split("/").pop() || c.path;
		// Use activeContent for the currently selected file (may be more recent)
		const code = name === activeFilename ? activeContent : c.content;
		scenes.push({ filename: name, code });
		seen.add(name);
	}

	// Ensure active file is included even if not yet in changes
	if (!seen.has(activeFilename) && isRemotionCode(activeContent)) {
		scenes.push({ filename: activeFilename, code: activeContent });
	}

	// Keep insertion order from changes (= generation order)
	return scenes;
}

export function LivePreview({
	content,
	filename,
	changes = [],
	mountPoint = "",
}: {
	content: string;
	filename: string;
	changes?: OverlayChange[];
	mountPoint?: string;
}) {
	const ext = getExtension(filename);

	if (SANDPACK_EXTENSIONS.has(ext)) {
		// Collect all remotion scenes for playlist preview
		if (isRemotionCode(content)) {
			const scenes = collectRemotionScenes(changes, filename, content);
			return <RemotionPreview scenes={scenes} />;
		}
		return <SandpackPreview content={content} filename={filename} changes={changes} mountPoint={mountPoint} />;
	}

	switch (ext) {
		case "png":
		case "jpg":
		case "jpeg":
		case "gif":
		case "webp":
			return (
				<div style={{ ...fill, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, overflow: "auto" }} className="studio-surface">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={`/img/${filename}`} alt={filename} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
				</div>
			);
		case "html":
		case "htm":
			return <HtmlPreview content={content} />;
		case "md":
		case "mdx":
			return <MarkdownPreview content={content} />;
		case "svg":
			return <SvgPreview content={content} />;
		case "json":
			return <JsonPreview content={content} />;
		default:
			return (
				<div style={{ ...fill, display: "flex", alignItems: "center", justifyContent: "center" }} className="studio-dim text-sm">
					No preview available for this file type
				</div>
			);
	}
}
