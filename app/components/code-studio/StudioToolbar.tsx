"use client";

import { useState } from "react";
import { useStudioDispatch, useStudioState } from "./CodeStudioContext";

export function StudioToolbar({
	loading,
	onAction,
}: {
	loading: boolean;
	onAction: (action: "download" | "clear") => void;
}) {
	const { changes, sidebarOpen } = useStudioState();
	const dispatch = useStudioDispatch();
	const [confirmClear, setConfirmClear] = useState(false);

	const handleClear = () => {
		if (!confirmClear) {
			setConfirmClear(true);
			setTimeout(() => setConfirmClear(false), 3000);
			return;
		}
		setConfirmClear(false);
		onAction("clear");
	};

	return (
		<div className="flex items-center gap-2 px-3 h-10 studio-border-b flex-shrink-0">
			<button
				type="button"
				onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
				className="studio-dim hover:studio-text w-7 h-7 rounded flex items-center justify-center hover:bg-[var(--studio-hover)] transition-colors"
				title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
			>
				{sidebarOpen ? "\u25E8" : "\u25E7"}
			</button>

			{changes.length > 0 && (
				<span className="studio-dim text-xs">
					<span className="studio-text font-medium">{changes.length}</span>{" "}
					file{changes.length !== 1 ? "s" : ""}
				</span>
			)}

			<div className="flex-1" />

			{changes.length > 0 && (
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={() => onAction("download")}
						disabled={loading}
						className="px-3 h-7 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
					>
						Download
					</button>
					<button
						type="button"
						onClick={handleClear}
						disabled={loading}
						className={`px-3 h-7 text-xs rounded-md border transition-colors disabled:opacity-50
							${confirmClear ? "border-red-500/50 text-red-400 bg-red-500/10 hover:bg-red-500/20" : "studio-border studio-text-secondary hover:bg-[var(--studio-hover)]"}`}
					>
						{confirmClear ? "Confirm?" : "Clear"}
					</button>
				</div>
			)}
		</div>
	);
}
