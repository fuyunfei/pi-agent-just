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
import { useStudioChanges } from "./useStudioChanges";

function StudioInner({ style }: { style?: React.CSSProperties }) {
	const dispatch = useStudioDispatch();
	const { tabs, activeTabId } = useStudioState();
	const { changes, mountPoint, refetch } = useStudioChanges();

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

	// Listen for rollback events — immediately refresh file list
	useEffect(() => {
		const handler = () => {
			refetch();
		};
		window.addEventListener("studio:rollback", handler);
		return () => window.removeEventListener("studio:rollback", handler);
	}, [refetch]);

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

	// Listen for clear-all from chat panel (server reset already done by useChatAgent.clear)
	useEffect(() => {
		const handler = () => {
			dispatch({ type: "CLOSE_ALL_TABS" });
		};
		window.addEventListener("studio:clear-all", handler);
		return () => window.removeEventListener("studio:clear-all", handler);
	}, [dispatch]);

	return (
		<div
			className="flex bg-background text-foreground text-[13px]"
			style={{ ...style, height: "100dvh", overflow: "hidden" }}
		>
			<FileTreeSidebar />
			<div className="flex flex-1 flex-col overflow-hidden" style={{ minWidth: 0 }}>
				<StudioToolbar />
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
