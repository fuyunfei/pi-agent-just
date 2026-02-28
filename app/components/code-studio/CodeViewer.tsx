"use client";

import { useEffect, useRef, useState } from "react";
import { useShiki } from "./useShiki";
import { useTheme } from "./useTheme";

export function CodeViewer({
	content,
	language,
}: {
	content: string;
	language: string;
}) {
	const highlighter = useShiki();
	const theme = useTheme();
	const [html, setHtml] = useState<string>("");
	const contentRef = useRef(content);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => {
		contentRef.current = content;
		if (!highlighter) return;

		clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			try {
				const result = highlighter.codeToHtml(contentRef.current, {
					lang: language,
					theme: theme === "dark" ? "github-dark" : "github-light",
				});
				setHtml(result);
			} catch {
				setHtml("");
			}
		}, 100);

		return () => clearTimeout(timerRef.current);
	}, [content, language, highlighter, theme]);

	// Build line numbers — trim phantom trailing line from trailing newline
	const lines = content.split("\n");
	const lineCount = content.endsWith("\n") && lines.length > 1 ? lines.length - 1 : lines.length;
	const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

	if (!html) {
		return (
			<div className="overflow-auto h-full studio-code">
				<div className="flex">
					<div className="studio-line-numbers" aria-hidden>
						{lineNumbers.map((n) => (
							<div key={n}>{n}</div>
						))}
					</div>
					<pre className="flex-1 p-4 text-[13px] leading-[1.6] font-mono studio-text whitespace-pre-wrap">
						<code>{content}</code>
					</pre>
				</div>
			</div>
		);
	}

	return (
		<div className="overflow-auto h-full studio-code">
			<div className="flex">
				<div className="studio-line-numbers" aria-hidden>
					{lineNumbers.map((n) => (
						<div key={n}>{n}</div>
					))}
				</div>
				<div
					className="flex-1 min-w-0"
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			</div>
		</div>
	);
}
