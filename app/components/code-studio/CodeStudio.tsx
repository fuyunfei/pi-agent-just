"use client";

import { useCallback, useEffect } from "react";
import {
	StudioProvider,
	useStudioDispatch,
	useStudioState,
} from "./CodeStudioContext";
import { StudioToolbar } from "./StudioToolbar";
import { TabBar } from "./TabBar";
import { FileTreeSidebar } from "./FileTreeSidebar";
import { ContentArea } from "./ContentArea";
import { useStudioChanges } from "./useStudioChanges";

function StudioInner() {
	const dispatch = useStudioDispatch();
	const { tabs, activeTabId } = useStudioState();
	const { changes, mountPoint, loading, handleAction } = useStudioChanges();

	// Sync changes into context
	useEffect(() => {
		dispatch({ type: "SET_CHANGES", changes, mountPoint });
	}, [changes, mountPoint, dispatch]);

	// Listen for file-written events from agent-command.ts
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.path) {
				const name = detail.path.split("/").pop() || detail.path;
				dispatch({ type: "FILE_WRITTEN", path: detail.path, name });
			}
		};
		window.addEventListener("studio:file-written", handler);
		return () => window.removeEventListener("studio:file-written", handler);
	}, [dispatch]);

	// Close all tabs when changes become empty (after reset)
	useEffect(() => {
		if (changes.length === 0 && tabs.length > 0) {
			dispatch({ type: "CLOSE_ALL_TABS" });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [changes, dispatch]);

	// Keyboard shortcuts
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const mod = e.metaKey || e.ctrlKey;
			// Cmd+W / Ctrl+W — close active tab
			if (mod && e.key === "w" && activeTabId) {
				e.preventDefault();
				dispatch({ type: "CLOSE_TAB", tabId: activeTabId });
			}
			// Cmd+B / Ctrl+B — toggle sidebar
			if (mod && e.key === "b") {
				e.preventDefault();
				dispatch({ type: "TOGGLE_SIDEBAR" });
			}
			// Cmd+] / Ctrl+] — next tab
			if (mod && e.key === "]" && tabs.length > 1) {
				e.preventDefault();
				const idx = tabs.findIndex((t) => t.id === activeTabId);
				const next = tabs[(idx + 1) % tabs.length];
				dispatch({ type: "SET_ACTIVE_TAB", tabId: next.id });
			}
			// Cmd+[ / Ctrl+[ — prev tab
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

	const wrappedAction = useCallback(
		async (action: "apply" | "reset") => {
			await handleAction(action);
			if (action === "reset") {
				dispatch({ type: "CLOSE_ALL_TABS" });
			}
		},
		[handleAction, dispatch],
	);

	return (
		<div
			className="flex flex-col h-dvh studio-surface overflow-hidden text-[13px] min-w-[300px]"
			style={{ flex: 1 }}
		>
			<StudioToolbar loading={loading} onAction={wrappedAction} />
			<TabBar />
			<div className="flex flex-1 min-h-0 overflow-hidden">
				<FileTreeSidebar />
				<div className="flex-1 min-w-0 overflow-hidden">
					<ContentArea />
				</div>
			</div>
		</div>
	);
}

export default function CodeStudio() {
	return (
		<StudioProvider>
			<StudioInner />
		</StudioProvider>
	);
}
