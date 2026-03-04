"use client";

import { useEffect } from "react";
import {
	StudioProvider,
	useStudioDispatch,
	useStudioState,
} from "./CodeStudioContext";
import { StudioToolbar } from "./StudioToolbar";
import { FileTreeSidebar } from "./FileTreeSidebar";
import { ContentArea } from "./ContentArea";

function StudioInner({ style }: { style?: React.CSSProperties }) {
	const dispatch = useStudioDispatch();
	const { tabs, activeTabId, changes } = useStudioState();

	// Keyboard shortcuts
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const mod = e.metaKey || e.ctrlKey;
			if (mod && e.key === "w" && activeTabId) {
				e.preventDefault();
				dispatch({ type: "CLOSE_TAB", tabId: activeTabId });
			}
			if (mod && e.key === "b") {
				e.preventDefault();
				dispatch({ type: "TOGGLE_SIDEBAR" });
			}
			if (mod && e.key === "]" && tabs.length > 1) {
				e.preventDefault();
				const idx = tabs.findIndex((t) => t.id === activeTabId);
				const next = tabs[(idx + 1) % tabs.length];
				dispatch({ type: "SET_ACTIVE_TAB", tabId: next.id });
			}
			if (mod && e.key === "[" && tabs.length > 1) {
				e.preventDefault();
				const idx = tabs.findIndex((t) => t.id === activeTabId);
				const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
				dispatch({ type: "SET_ACTIVE_TAB", tabId: prev.id });
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [dispatch, activeTabId, tabs]);

	// Listen for open-scene from chat scene cards
	useEffect(() => {
		const handler = (e: Event) => {
			const { filename } = (e as CustomEvent).detail || {};
			if (!filename) return;
			const match = changes.find((c) => c.path.endsWith(`/${filename}`) || c.path === filename);
			if (!match) return;
			dispatch({ type: "OPEN_FILE", path: match.path, name: filename });
			setTimeout(() => {
				window.dispatchEvent(new CustomEvent("studio:scene-select", { detail: { filename } }));
			}, 300);
		};
		window.addEventListener("studio:open-scene", handler);
		return () => window.removeEventListener("studio:open-scene", handler);
	}, [dispatch, changes]);

	return (
		<div
			className="flex bg-background text-foreground text-[13px]"
			style={{ ...style, height: "100dvh", overflow: "hidden" }}
		>
			<FileTreeSidebar />
			<div className="flex flex-1 flex-col overflow-hidden" style={{ minWidth: 0 }}>
				<div className="relative z-10">
					<StudioToolbar />
				</div>
				<ContentArea />
			</div>
		</div>
	);
}

export default function CodeStudio({ style }: { style?: React.CSSProperties }) {
	return (
		<StudioProvider>
			<StudioInner style={style} />
		</StudioProvider>
	);
}
