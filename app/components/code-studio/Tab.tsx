"use client";

import { X, Eye, Code } from "lucide-react";
import { cn } from "@/lib/utils";
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
	const Icon = getFileIcon(tab.name);

	return (
		<div
			onClick={onActivate}
			onAuxClick={(e) => {
				if (e.button === 1) {
					e.preventDefault();
					onClose();
				}
			}}
			className={cn(
				"group flex items-center gap-1.5 px-3 h-full cursor-pointer select-none flex-shrink-0 min-w-[60px] transition-colors border-b",
				isActive
					? "bg-background text-foreground border-primary"
					: "text-muted-foreground border-transparent hover:bg-muted/50",
			)}
			title={tab.path}
		>
			<Icon className="size-3.5 flex-shrink-0 opacity-60" />
			<span
				className={cn(
					"text-[13px] truncate max-w-[120px]",
					isActive ? "text-foreground" : "text-muted-foreground",
				)}
			>
				{tab.name}
			</span>
			{isPreviewable(tab.name) && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onTogglePreview();
					}}
					className={cn(
						"flex-shrink-0 rounded p-0.5 transition-colors",
						tab.mode === "preview"
							? "text-primary bg-primary/10"
							: "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground",
					)}
					title={tab.mode === "preview" ? "Show code" : "Show preview"}
				>
					{tab.mode === "preview" ? (
						<Eye className="size-3" />
					) : (
						<Code className="size-3" />
					)}
				</button>
			)}
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onClose();
				}}
				className={cn(
					"flex-shrink-0 w-4 h-4 rounded flex items-center justify-center transition-all",
					isActive
						? "text-muted-foreground opacity-100 hover:text-foreground hover:bg-muted"
						: "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted",
				)}
			>
				<X className="size-3" />
			</button>
		</div>
	);
}
