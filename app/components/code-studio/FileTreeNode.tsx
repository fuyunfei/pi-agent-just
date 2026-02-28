"use client";

import type { TreeNode } from "./types";
import { getFileIcon } from "./file-icons";

const TYPE_STYLES = {
	created: { symbol: "+", color: "#22c55e" },
	modified: { symbol: "~", color: "#eab308" },
	deleted: { symbol: "-", color: "#ef4444" },
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
				className={`flex items-center gap-1.5 cursor-pointer select-none transition-colors duration-75
					${isSelected ? "studio-item-selected" : "studio-item-hover"}`}
				style={{ padding: `4px 12px 4px ${12 + depth * 16}px` }}
			>
				{isDir ? (
					<span className={`w-4 text-center text-[9px] flex-shrink-0 studio-dim transition-transform duration-100 ${isCollapsed ? "" : "rotate-90"}`}>
						{"\u25B6"}
					</span>
				) : (
					<span
						className="w-4 text-center text-[10px] font-mono flex-shrink-0 opacity-60"
						style={{ color: style?.color }}
					>
						{getFileIcon(node.name)}
					</span>
				)}
				<span
					className={`overflow-hidden text-ellipsis whitespace-nowrap text-[13px]
						${isDir ? "studio-text-secondary" : "studio-text"}`}
				>
					{node.name}
					{isDir ? "/" : ""}
				</span>
				{!isDir && style && (
					<span
						className="ml-auto text-[10px] flex-shrink-0"
						style={{ color: style.color }}
					>
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
