"use client";

import { useState } from "react";
import { useStudioDispatch, useStudioState } from "./CodeStudioContext";

export function StudioToolbar({
	loading,
	onAction,
}: {
	loading: boolean;
	onAction: (action: "apply" | "reset") => void;
}) {
	const { changes, sidebarOpen } = useStudioState();
	const dispatch = useStudioDispatch();
	const [confirmReset, setConfirmReset] = useState(false);
	const [showApplied, setShowApplied] = useState(false);

	const handleReset = () => {
		if (!confirmReset) {
			setConfirmReset(true);
			setTimeout(() => setConfirmReset(false), 3000);
			return;
		}
		setConfirmReset(false);
		onAction("reset");
	};

	const handleApply = async () => {
		onAction("apply");
		setShowApplied(true);
		setTimeout(() => setShowApplied(false), 2000);
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

			{showApplied && (
				<span className="text-green-400 text-xs font-medium">
					{"\u2713"} Applied
				</span>
			)}

			{changes.length > 0 && (
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={handleApply}
						disabled={loading}
						className="px-3 h-7 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
					>
						Apply
					</button>
					<button
						type="button"
						onClick={handleReset}
						disabled={loading}
						className={`px-3 h-7 text-xs rounded-md border transition-colors disabled:opacity-50
							${confirmReset ? "border-red-500/50 text-red-400 bg-red-500/10 hover:bg-red-500/20" : "studio-border studio-text-secondary hover:bg-[var(--studio-hover)]"}`}
					>
						{confirmReset ? "Confirm?" : "Reset"}
					</button>
				</div>
			)}
		</div>
	);
}
