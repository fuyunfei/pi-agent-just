"use client";

import { useMemo } from "react";

function getExtension(filename: string): string {
	const dot = filename.lastIndexOf(".");
	return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

function JsonPreview({ content }: { content: string }) {
	const formatted = useMemo(() => {
		try {
			return JSON.stringify(JSON.parse(content), null, 2);
		} catch {
			return content;
		}
	}, [content]);

	return (
		<pre className="p-4 text-[13px] leading-[1.6] font-mono studio-text overflow-auto h-full whitespace-pre-wrap">
			{formatted}
		</pre>
	);
}

function MarkdownPreview({ content }: { content: string }) {
	// Simple markdown → HTML (headings, bold, italic, code, links, lists)
	const html = useMemo(() => {
		let out = content
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
		// headings
		out = out.replace(/^### (.+)$/gm, "<h3>$1</h3>");
		out = out.replace(/^## (.+)$/gm, "<h2>$1</h2>");
		out = out.replace(/^# (.+)$/gm, "<h1>$1</h1>");
		// bold/italic
		out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
		out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
		// inline code
		out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
		// code blocks
		out = out.replace(
			/```[\s\S]*?\n([\s\S]*?)```/g,
			"<pre><code>$1</code></pre>",
		);
		// links
		out = out.replace(
			/\[([^\]]+)\]\(([^)]+)\)/g,
			'<a href="$2" target="_blank" rel="noopener">$1</a>',
		);
		// unordered lists
		out = out.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
		// paragraphs (double newline)
		out = out.replace(/\n\n/g, "</p><p>");
		out = `<p>${out}</p>`;
		// single newlines → <br> (within paragraphs)
		out = out.replace(/([^>])\n([^<])/g, "$1<br>$2");
		return out;
	}, [content]);

	return (
		<div
			className="p-6 overflow-auto h-full studio-markdown"
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

function SvgPreview({ content }: { content: string }) {
	return (
		<div className="flex items-center justify-center h-full p-8 overflow-auto studio-surface">
			<div
				className="max-w-full max-h-full"
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
			className="w-full h-full border-0"
			title="Preview"
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
				<div className="flex items-center justify-center h-full studio-dim text-sm">
					No preview available for this file type
				</div>
			);
	}
}
