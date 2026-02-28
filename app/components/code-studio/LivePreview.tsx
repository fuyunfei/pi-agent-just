"use client";

import { useMemo } from "react";

function getExtension(filename: string): string {
	const dot = filename.lastIndexOf(".");
	return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

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

export function LivePreview({
	content,
	filename,
}: {
	content: string;
	filename: string;
}) {
	const ext = getExtension(filename);

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
