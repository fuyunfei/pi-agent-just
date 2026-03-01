"use client";

import { useStudioState } from "./CodeStudioContext";

export function EmptyState() {
	const { changes } = useStudioState();

	return (
		<div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
			<div className="text-3xl opacity-20">
				{changes.length > 0 ? "\u2190" : "\u2726"}
			</div>
			<div className="text-center">
				<div className="text-[13px]">
					{changes.length > 0
						? "Select a file to view it"
						: "No files changed yet"}
				</div>
				{changes.length === 0 && (
					<div className="text-xs opacity-50 mt-1">
						Use the terminal to create or edit files
					</div>
				)}
			</div>
		</div>
	);
}
