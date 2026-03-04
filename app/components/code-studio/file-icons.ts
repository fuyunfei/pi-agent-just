import type { LucideIcon } from "lucide-react";
import {
	File,
	FileCode,
	FileJson,
	FileText,
	Globe,
	Hash,
	ImageIcon,
	Terminal,
	Braces,
} from "lucide-react";

const EXTENSION_TO_LANG: Record<string, string> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	mjs: "javascript",
	cjs: "javascript",
	json: "json",
	html: "html",
	htm: "html",
	css: "css",
	scss: "css",
	md: "markdown",
	mdx: "markdown",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	yml: "yaml",
	yaml: "yaml",
	py: "python",
	rs: "rust",
	go: "go",
	sql: "sql",
	xml: "xml",
	svg: "xml",
	toml: "toml",
	ini: "ini",
	env: "bash",
	txt: "text",
};

const EXTENSION_TO_ICON: Record<string, LucideIcon> = {
	ts: FileCode,
	tsx: FileCode,
	js: FileCode,
	jsx: FileCode,
	mjs: FileCode,
	cjs: FileCode,
	py: FileCode,
	rs: FileCode,
	go: FileCode,
	sql: FileCode,
	json: FileJson,
	html: Globe,
	htm: Globe,
	svg: Globe,
	xml: Globe,
	css: Hash,
	scss: Hash,
	md: FileText,
	mdx: FileText,
	txt: FileText,
	sh: Terminal,
	bash: Terminal,
	zsh: Terminal,
	yml: Braces,
	yaml: Braces,
	toml: Braces,
	ini: Braces,
	env: Terminal,
	png: ImageIcon,
	jpg: ImageIcon,
	jpeg: ImageIcon,
	gif: ImageIcon,
	webp: ImageIcon,
};

function getExtension(path: string): string {
	const dot = path.lastIndexOf(".");
	if (dot === -1) return "";
	return path.slice(dot + 1).toLowerCase();
}

export function getLanguageFromPath(path: string): string {
	return EXTENSION_TO_LANG[getExtension(path)] || "text";
}

export function getFileIcon(path: string): LucideIcon {
	return EXTENSION_TO_ICON[getExtension(path)] || File;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

export function isImageFile(path: string): boolean {
	return IMAGE_EXTENSIONS.has(getExtension(path));
}

export function isPreviewable(path: string): boolean {
	const ext = getExtension(path);
	return (
		IMAGE_EXTENSIONS.has(ext) ||
		ext === "html" ||
		ext === "htm" ||
		ext === "md" ||
		ext === "mdx" ||
		ext === "svg" ||
		ext === "json" ||
		ext === "tsx" ||
		ext === "jsx" ||
		ext === "ts" ||
		ext === "js"
	);
}

/** Files that should default to preview mode when opened */
export function shouldDefaultPreview(path: string): boolean {
	const ext = getExtension(path);
	return (
		IMAGE_EXTENSIONS.has(ext) ||
		ext === "html" ||
		ext === "htm" ||
		ext === "svg" ||
		ext === "md" ||
		ext === "mdx" ||
		ext === "json" ||
		ext === "tsx" ||
		ext === "jsx"
	);
}
