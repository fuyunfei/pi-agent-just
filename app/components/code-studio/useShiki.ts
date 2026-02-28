"use client";

import { useEffect, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Highlighter = any;

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = import("shiki/bundle/web").then(
			({ createHighlighter }) =>
				createHighlighter({
					themes: ["github-dark", "github-light"],
					langs: [
						"typescript",
						"javascript",
						"tsx",
						"jsx",
						"json",
						"html",
						"css",
						"markdown",
						"bash",
						"yaml",
						"python",
						"sql",
						"xml",
						"toml",
						"ini",
					],
				}),
		);
	}
	return highlighterPromise as Promise<Highlighter>;
}

export function useShiki(): Highlighter | null {
	const [highlighter, setHighlighter] = useState<Highlighter | null>(null);

	useEffect(() => {
		getHighlighter().then(setHighlighter);
	}, []);

	return highlighter;
}
