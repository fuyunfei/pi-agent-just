"use client";

import { useState } from "react";
import { useStudioDispatch, useStudioState } from "./CodeStudioContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, Trash2, PanelLeft } from "lucide-react";

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
		<div className="flex items-center gap-2 px-2 h-10 studio-border-b flex-shrink-0">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
					>
						<PanelLeft className="h-4 w-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{sidebarOpen ? "Hide sidebar" : "Show sidebar"}
				</TooltipContent>
			</Tooltip>

			{changes.length > 0 && (
				<span className="text-muted-foreground text-xs">
					<span className="text-foreground font-medium">{changes.length}</span>{" "}
					file{changes.length !== 1 ? "s" : ""}
				</span>
			)}

			<div className="flex-1" />

			{changes.length > 0 && (
				<div className="flex items-center gap-1.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="default"
								size="sm"
								className="h-7 gap-1.5"
								onClick={() => onAction("download")}
								disabled={loading}
							>
								<Download className="h-3.5 w-3.5" />
								Download
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Download files as ZIP</TooltipContent>
					</Tooltip>
					<Button
						variant={confirmClear ? "destructive" : "outline"}
						size="sm"
						className="h-7 gap-1.5"
						onClick={handleClear}
						disabled={loading}
					>
						<Trash2 className="h-3.5 w-3.5" />
						{confirmClear ? "Confirm?" : "Clear"}
					</Button>
				</div>
			)}
		</div>
	);
}
