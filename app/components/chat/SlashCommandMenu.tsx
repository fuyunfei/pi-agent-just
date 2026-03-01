"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { EraserIcon, PackageIcon, BarChart3Icon } from "lucide-react";

export interface SlashCommandDef {
	name: string;
	description: string;
	icon: React.ReactNode;
}

const SLASH_COMMANDS: SlashCommandDef[] = [
	{
		name: "/new",
		description: "Start a fresh session",
		icon: <EraserIcon className="size-3.5" />,
	},
	{
		name: "/compact",
		description: "Compress context to save tokens",
		icon: <PackageIcon className="size-3.5" />,
	},
	{
		name: "/session",
		description: "Show session statistics",
		icon: <BarChart3Icon className="size-3.5" />,
	},
];

function filterCommands(input: string) {
	const q = input.toLowerCase();
	return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(q));
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useSlashCommandMenu(onSubmitCommand: (cmd: string) => void) {
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);

	const isSlash = query.startsWith("/") && !query.includes(" ");
	const filtered = isSlash ? filterCommands(query) : [];
	const visible = isSlash && filtered.length > 0;

	// Reset selection when filter changes
	useEffect(() => {
		setSelectedIndex(0);
	}, [query]);

	const select = useCallback(
		(command: string) => {
			onSubmitCommand(command);
			setQuery("");
			// Clear the uncontrolled textarea (PromptInput uses form.reset() on submit,
			// but we bypass the form, so reset it manually)
			const textarea = document.querySelector<HTMLTextAreaElement>(
				'textarea[name="message"]',
			);
			if (textarea) {
				textarea.value = "";
			}
		},
		[onSubmitCommand],
	);

	const onTextareaChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setQuery(e.target.value);
		},
		[],
	);

	const onTextareaKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (!visible) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
			} else if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				const cmd = filtered[selectedIndex];
				if (cmd) select(cmd.name);
			} else if (e.key === "Escape") {
				e.preventDefault();
				setQuery("");
				e.currentTarget.value = "";
			} else if (e.key === "Tab") {
				// Tab-complete the selected command
				e.preventDefault();
				const cmd = filtered[selectedIndex];
				if (cmd) select(cmd.name);
			}
		},
		[visible, filtered, selectedIndex, select],
	);

	return {
		query,
		setQuery,
		visible,
		filtered,
		selectedIndex,
		select,
		onTextareaChange,
		onTextareaKeyDown,
	};
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export const SlashCommandMenu = memo(function SlashCommandMenu({
	filtered,
	selectedIndex,
	onSelect,
	visible,
}: {
	filtered: SlashCommandDef[];
	selectedIndex: number;
	onSelect: (cmd: string) => void;
	visible: boolean;
}) {
	if (!visible) return null;

	return (
		<div className="absolute bottom-full left-0 right-0 z-50 mb-1.5 px-1">
			<div className="overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg">
				<div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
					Commands
				</div>
				{filtered.map((cmd, idx) => (
					<button
						key={cmd.name}
						type="button"
						onMouseDown={(e) => {
							e.preventDefault();
							onSelect(cmd.name);
						}}
						className={cn(
							"flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
							idx === selectedIndex
								? "bg-accent text-accent-foreground"
								: "hover:bg-accent/50",
						)}
					>
						<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
							{cmd.icon}
						</span>
						<div className="min-w-0 flex-1">
							<span className="font-mono text-xs text-foreground">
								{cmd.name}
							</span>
							<span className="ml-2 text-[11px] text-muted-foreground">
								{cmd.description}
							</span>
						</div>
					</button>
				))}
			</div>
		</div>
	);
});
