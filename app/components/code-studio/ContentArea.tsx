"use client";

import { useStudioState } from "./CodeStudioContext";
import { CodeViewer } from "./CodeViewer";
import { EmptyState } from "./EmptyState";
import { LivePreview } from "./LivePreview";
import { getLanguageFromPath } from "./file-icons";

export function ContentArea() {
	const { tabs, activeTabId, changes } = useStudioState();

	const activeTab = tabs.find((t) => t.id === activeTabId);
	if (!activeTab) return <EmptyState />;

	const change = changes.find((c) => c.path === activeTab.path);
	const content = change?.content ?? "";

	if (change?.type === "deleted") {
		return (
			<div className="flex items-center justify-center h-full text-red-400 text-sm italic">
				File deleted
			</div>
		);
	}

	if (activeTab.mode === "preview") {
		return <LivePreview content={content} filename={activeTab.name} />;
	}

	return (
		<CodeViewer content={content} language={getLanguageFromPath(activeTab.path)} />
	);
}
