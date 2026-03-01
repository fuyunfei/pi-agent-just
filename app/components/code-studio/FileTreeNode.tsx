"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TreeNode } from "./types";
import { getFileIcon } from "./file-icons";

const TYPE_STYLES = {
	created: { symbol: "+", className: "text-green-500" },
	modified: { symbol: "~", className: "text-yellow-500" },
	deleted: { symbol: "-", className: "text-red-500" },
} as const;

export function FileTreeNode({
	node,
	depth,
	selectedPath,
	onSelect,
	collapsed,
	onToggle,
}: {
	node: TreeNode;
	depth: number;
	selectedPath: string | null;
	onSelect: (path: string, name: string) => void;
	collapsed: Set<string>;
	onToggle: (path: string) => void;
}) {
	const isDir = node.children.length > 0;
	const isCollapsed = collapsed.has(node.fullPath);
	const isSelected = selectedPath === node.change?.path;
	const style = node.change ? TYPE_STYLES[node.change.type] : null;
	const FileIcon = getFileIcon(node.name);

	return (
		<>
			<div
				onClick={() => {
					if (isDir) {
						onToggle(node.fullPath);
					} else if (node.change) {
						onSelect(node.change.path, node.name);
					}
				}}
				className={cn(
					"flex items-center gap-1.5 cursor-pointer select-none transition-colors duration-75",
					isSelected ? "bg-accent" : "hover:bg-muted/50",
				)}
				style={{ padding: `4px 12px 4px ${12 + depth * 16}px` }}
			>
				{isDir ? (
					<ChevronRight
						className={cn(
							"size-3.5 flex-shrink-0 text-muted-foreground transition-transform duration-100",
							!isCollapsed && "rotate-90",
						)}
					/>
				) : (
					<FileIcon
						className={cn("size-3.5 flex-shrink-0 opacity-60", style?.className)}
					/>
				)}
				<span
					className={cn(
						"overflow-hidden text-ellipsis whitespace-nowrap text-[13px]",
						isDir ? "text-muted-foreground" : "text-foreground",
					)}
				>
					{node.name}
					{isDir ? "/" : ""}
				</span>
				{!isDir && style && (
					<span className={cn("ml-auto text-[10px] flex-shrink-0", style.className)}>
						{style.symbol}
					</span>
				)}
			</div>
			{isDir &&
				!isCollapsed &&
				node.children.map((child) => (
					<FileTreeNode
						key={child.fullPath}
						node={child}
						depth={depth + 1}
						selectedPath={selectedPath}
						onSelect={onSelect}
						collapsed={collapsed}
						onToggle={onToggle}
					/>
				))}
		</>
	);
}
