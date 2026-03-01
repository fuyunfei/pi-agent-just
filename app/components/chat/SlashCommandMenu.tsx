"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
	EraserIcon,
	PackageIcon,
	BarChart3Icon,
	CpuIcon,
	CheckIcon,
} from "lucide-react";
import type { ModelInfo } from "./types";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface MenuItem {
	id: string;
	label: string;
	description: string;
	icon: React.ReactNode;
	/** For model items */
	model?: ModelInfo;
}

/* -------------------------------------------------------------------------- */
/*  Static command definitions                                                 */
/* -------------------------------------------------------------------------- */

const COMMAND_ITEMS: MenuItem[] = [
	{
		id: "/new",
		label: "/new",
		description: "Start a fresh session",
		icon: <EraserIcon className="size-3.5" />,
	},
	{
		id: "/compact",
		label: "/compact",
		description: "Compress context to save tokens",
		icon: <PackageIcon className="size-3.5" />,
	},
	{
		id: "/session",
		label: "/session",
		description: "Show session statistics",
		icon: <BarChart3Icon className="size-3.5" />,
	},
	{
		id: "/model",
		label: "/model",
		description: "Switch AI model",
		icon: <CpuIcon className="size-3.5" />,
	},
];

function buildModelItems(models: ModelInfo[], currentModel: ModelInfo | null): MenuItem[] {
	return models.map((m) => ({
		id: `/model:${m.provider}/${m.id}`,
		label: m.label,
		description: m.desc,
		icon: m.provider === currentModel?.provider && m.id === currentModel?.id
			? <CheckIcon className="size-3.5 text-emerald-500" />
			: <CpuIcon className="size-3.5 opacity-40" />,
		model: m,
	}));
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useSlashCommandMenu(
	onSubmitCommand: (cmd: string) => void,
	options: {
		models: ModelInfo[];
		currentModel: ModelInfo | null;
		onSwitchModel: (provider: string, modelId: string) => void;
	},
) {
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [mode, setMode] = useState<"commands" | "models">("commands");

	const { models, currentModel, onSwitchModel } = options;

	const isSlash = query.startsWith("/") && !query.includes(" ");

	// Build the displayed items based on mode
	const items = useMemo(() => {
		if (mode === "models") {
			return buildModelItems(models, currentModel);
		}
		if (!isSlash) return [];
		const q = query.toLowerCase();
		return COMMAND_ITEMS.filter((cmd) => cmd.id.startsWith(q));
	}, [mode, isSlash, query, models, currentModel]);

	const visible = mode === "models" || (isSlash && items.length > 0);
	const heading = mode === "models" ? "Select Model" : "Commands";

	// Reset selection when items change
	useEffect(() => {
		setSelectedIndex(0);
	}, [query, mode]);

	const clearTextarea = useCallback(() => {
		const textarea = document.querySelector<HTMLTextAreaElement>(
			'textarea[name="message"]',
		);
		if (textarea) textarea.value = "";
	}, []);

	const selectItem = useCallback(
		(item: MenuItem) => {
			if (item.id === "/model") {
				// Enter model sub-menu
				setMode("models");
				setQuery("");
				clearTextarea();
				return;
			}
			if (item.model) {
				// Switch model
				onSwitchModel(item.model.provider, item.model.id);
				setMode("commands");
				setQuery("");
				clearTextarea();
				return;
			}
			// Regular command
			onSubmitCommand(item.id);
			setMode("commands");
			setQuery("");
			clearTextarea();
		},
		[onSubmitCommand, onSwitchModel, clearTextarea],
	);

	const dismiss = useCallback(() => {
		setMode("commands");
		setQuery("");
		clearTextarea();
	}, [clearTextarea]);

	const onTextareaChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const val = e.target.value;
			if (mode === "models" && val.length > 0) {
				// If user starts typing in model mode, go back to commands mode
				setMode("commands");
			}
			setQuery(val);
		},
		[mode],
	);

	const onTextareaKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (!visible) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => (i < items.length - 1 ? i + 1 : 0));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => (i > 0 ? i - 1 : items.length - 1));
			} else if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				const item = items[selectedIndex];
				if (item) selectItem(item);
			} else if (e.key === "Escape") {
				e.preventDefault();
				dismiss();
			} else if (e.key === "Tab") {
				e.preventDefault();
				const item = items[selectedIndex];
				if (item) selectItem(item);
			} else if (e.key === "Backspace" && mode === "models" && e.currentTarget.value === "") {
				// Backspace from empty model menu → go back to commands
				e.preventDefault();
				setMode("commands");
				setQuery("/");
				e.currentTarget.value = "/";
			}
		},
		[visible, items, selectedIndex, selectItem, dismiss, mode],
	);

	return {
		query,
		setQuery,
		visible,
		items,
		heading,
		selectedIndex,
		selectItem,
		onTextareaChange,
		onTextareaKeyDown,
	};
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export const SlashCommandMenu = memo(function SlashCommandMenu({
	items,
	heading,
	selectedIndex,
	onSelect,
	visible,
}: {
	items: MenuItem[];
	heading: string;
	selectedIndex: number;
	onSelect: (item: MenuItem) => void;
	visible: boolean;
}) {
	if (!visible || items.length === 0) return null;

	return (
		<div className="absolute bottom-full left-0 right-0 z-50 mb-1.5 px-1">
			<div className="overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg">
				<div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
					{heading}
				</div>
				{items.map((item, idx) => (
					<button
						key={item.id}
						type="button"
						onMouseDown={(e) => {
							e.preventDefault();
							onSelect(item);
						}}
						className={cn(
							"flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
							idx === selectedIndex
								? "bg-accent text-accent-foreground"
								: "hover:bg-accent/50",
						)}
					>
						<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
							{item.icon}
						</span>
						<div className="min-w-0 flex-1">
							<span className="font-mono text-xs text-foreground">
								{item.label}
							</span>
							<span className="ml-2 text-[11px] text-muted-foreground">
								{item.description}
							</span>
						</div>
					</button>
				))}
			</div>
		</div>
	);
});
