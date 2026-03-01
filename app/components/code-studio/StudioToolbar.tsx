"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStudioDispatch, useStudioState } from "./CodeStudioContext";
import { Tab } from "./Tab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, Trash2, PanelLeft } from "lucide-react";

export function StudioToolbar({
	loading,
	onAction,
}: {
	loading: boolean;
	onAction: (action: "download" | "clear") => void;
}) {
	const { changes, tabs, activeTabId, sidebarOpen } = useStudioState();
	const dispatch = useStudioDispatch();
	const [confirmClear, setConfirmClear] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		return () => clearTimeout(timerRef.current);
	}, []);

	const handleClear = useCallback(() => {
		setConfirmClear((prev) => {
			if (!prev) {
				clearTimeout(timerRef.current);
				timerRef.current = setTimeout(() => setConfirmClear(false), 3000);
				return true;
			}
			onAction("clear");
			return false;
		});
	}, [onAction]);

	return (
		<div className="flex items-center h-[35px] border-b border-border flex-shrink-0">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-[35px] w-9 rounded-none flex-shrink-0"
						onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
					>
						<PanelLeft className="h-4 w-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{sidebarOpen ? "Hide sidebar" : "Show sidebar"}
				</TooltipContent>
			</Tooltip>

			{/* Tabs area */}
			{tabs.length > 0 && (
				<div
					ref={scrollRef}
					className="flex flex-1 overflow-x-auto studio-tabbar min-w-0 h-full"
					onWheel={(e) => {
						if (scrollRef.current && e.deltaY !== 0) {
							scrollRef.current.scrollLeft += e.deltaY;
						}
					}}
				>
					{tabs.map((tab) => (
						<Tab
							key={tab.id}
							tab={tab}
							isActive={tab.id === activeTabId}
							onActivate={() =>
								dispatch({ type: "SET_ACTIVE_TAB", tabId: tab.id })
							}
							onClose={() => dispatch({ type: "CLOSE_TAB", tabId: tab.id })}
							onTogglePreview={() =>
								dispatch({ type: "TOGGLE_PREVIEW", tabId: tab.id })
							}
						/>
					))}
				</div>
			)}

			{tabs.length === 0 && <div className="flex-1" />}

			{/* Right side: file count + actions */}
			{changes.length > 0 && (
				<div className="flex items-center gap-1 px-2 flex-shrink-0">
					<Badge variant="secondary" className="text-[11px] px-1.5 py-0 h-5">
						{changes.length} file{changes.length !== 1 ? "s" : ""}
					</Badge>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7"
								onClick={() => onAction("download")}
								disabled={loading}
							>
								<Download className="h-3.5 w-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Download as ZIP</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={confirmClear ? "destructive" : "ghost"}
								size="icon"
								className="h-7 w-7"
								onClick={handleClear}
								disabled={loading}
							>
								<Trash2 className="h-3.5 w-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{confirmClear ? "Click again to confirm" : "Clear all changes"}
						</TooltipContent>
					</Tooltip>
				</div>
			)}
		</div>
	);
}
