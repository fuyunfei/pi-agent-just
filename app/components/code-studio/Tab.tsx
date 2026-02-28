"use client";

import type { StudioTab } from "./types";
import { getFileIcon, isPreviewable } from "./file-icons";

export function Tab({
	tab,
	isActive,
	onActivate,
	onClose,
	onTogglePreview,
}: {
	tab: StudioTab;
	isActive: boolean;
	onActivate: () => void;
	onClose: () => void;
	onTogglePreview: () => void;
}) {
	return (
		<div
			onClick={onActivate}
			onAuxClick={(e) => {
				if (e.button === 1) {
					e.preventDefault();
					onClose();
				}
			}}
			className={`group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none border-b-2 flex-shrink-0 min-w-[60px] transition-colors
				${isActive ? "border-cyan-500 studio-tab-active" : "border-transparent studio-tab-inactive"}`}
			title={tab.path}
		>
			<span className="text-[10px] font-mono studio-dim flex-shrink-0">
				{getFileIcon(tab.name)}
			</span>
			<span className={`text-[13px] truncate max-w-[120px] ${isActive ? "studio-text" : "studio-text-secondary"}`}>
				{tab.name}
			</span>
			{isPreviewable(tab.name) && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onTogglePreview();
					}}
					className={`text-[10px] px-1 rounded flex-shrink-0 transition-colors
						${tab.mode === "preview" ? "text-cyan-400 bg-cyan-400/10" : "studio-dim opacity-0 group-hover:opacity-100 hover:studio-text"}`}
					title={tab.mode === "preview" ? "Show code" : "Show preview"}
				>
					{tab.mode === "preview" ? "\u25C9" : "\u25CB"}
				</button>
			)}
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onClose();
				}}
				className={`text-[11px] flex-shrink-0 w-4 h-4 rounded flex items-center justify-center transition-all
					${isActive ? "studio-dim opacity-100 hover:studio-text hover:bg-[var(--studio-hover)]" : "studio-dim opacity-0 group-hover:opacity-100 hover:studio-text hover:bg-[var(--studio-hover)]"}`}
			>
				{"\u2715"}
			</button>
		</div>
	);
}
