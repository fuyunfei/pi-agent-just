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

const EXTENSION_TO_ICON: Record<string, string> = {
	ts: "TS",
	tsx: "TX",
	js: "JS",
	jsx: "JX",
	json: "{}",
	html: "<>",
	htm: "<>",
	css: "#",
	md: "Md",
	sh: "$",
	bash: "$",
	py: "Py",
	rs: "Rs",
	go: "Go",
	sql: "Sq",
	yml: "Y",
	yaml: "Y",
	toml: "T",
	svg: "Sv",
	xml: "Xm",
};

function getExtension(path: string): string {
	const dot = path.lastIndexOf(".");
	if (dot === -1) return "";
	return path.slice(dot + 1).toLowerCase();
}

export function getLanguageFromPath(path: string): string {
	return EXTENSION_TO_LANG[getExtension(path)] || "text";
}

export function getFileIcon(path: string): string {
	return EXTENSION_TO_ICON[getExtension(path)] || "f";
}

export function isPreviewable(path: string): boolean {
	const ext = getExtension(path);
	return (
		ext === "html" ||
		ext === "htm" ||
		ext === "md" ||
		ext === "mdx" ||
		ext === "svg" ||
		ext === "json"
	);
}

/** Files that should default to preview mode when opened */
export function shouldDefaultPreview(path: string): boolean {
	const ext = getExtension(path);
	return (
		ext === "html" ||
		ext === "htm" ||
		ext === "svg" ||
		ext === "md" ||
		ext === "mdx" ||
		ext === "json"
	);
}
