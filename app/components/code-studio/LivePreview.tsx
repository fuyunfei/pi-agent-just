"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import type { SandpackClient } from "@codesandbox/sandpack-client";
import type { BundledLanguage } from "shiki";
import type { OverlayChange } from "./types";
import { getLanguageFromPath } from "./file-icons";
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
	return (
		<div style={{ ...fill, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }} className="studio-surface">
			<div
				style={{ maxWidth: "100%", maxHeight: "100%" }}
				dangerouslySetInnerHTML={{ __html: content }}
			/>
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
	// Match: import ... from "pkg" / import "pkg" / require("pkg")
	const importRe = /(?:import\s+[\s\S]*?from\s+|import\s+|require\s*\(\s*)["']([^"'./][^"']*)["']/g;

	for (const file of Object.values(files)) {
		let match: RegExpExecArray | null;
		while ((match = importRe.exec(file.code)) !== null) {
			const specifier = match[1];
			// Get the package name (handle scoped packages like @foo/bar)
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
		return <SandpackPreview content={content} filename={filename} changes={changes} mountPoint={mountPoint} />;
	}

	switch (ext) {
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
