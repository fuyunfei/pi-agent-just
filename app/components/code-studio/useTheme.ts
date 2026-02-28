"use client";

import { useEffect, useState } from "react";

export function useTheme(): "light" | "dark" {
	const [theme, setTheme] = useState<"light" | "dark">("dark");

	useEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		setTheme(mq.matches ? "dark" : "light");
		const handler = (e: MediaQueryListEvent) =>
			setTheme(e.matches ? "dark" : "light");
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);

	return theme;
}
