"use client";

import { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { SearchIcon } from "lucide-react";
import { useStudioDispatch, useStudioState } from "./CodeStudioContext";
import { FileTreeNode } from "./FileTreeNode";
import type { OverlayChange, TreeNode } from "./types";

function buildTree(changes: OverlayChange[], mountPoint: string): TreeNode[] {
	const root: TreeNode[] = [];

	for (const change of changes) {
		let rel = change.path;
		if (mountPoint && rel.startsWith(mountPoint)) {
			rel = rel.slice(mountPoint.length);
		}
		if (rel.startsWith("/")) rel = rel.slice(1);

		const parts = rel.split("/");
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const name = parts[i];
			const isFile = i === parts.length - 1;
			let node = current.find((n) => n.name === name);

			if (!node) {
				node = {
					name,
					fullPath: parts.slice(0, i + 1).join("/"),
					change: isFile ? change : undefined,
					children: [],
				};
				current.push(node);
			}

			if (isFile) {
				node.change = change;
			}
			current = node.children;
		}
	}

	const sortNodes = (nodes: TreeNode[]) => {
		nodes.sort((a, b) => {
			const aIsDir = a.children.length > 0;
			const bIsDir = b.children.length > 0;
			if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const n of nodes) sortNodes(n.children);
	};
	sortNodes(root);

	// Collapse single-child directories: src/ -> components/ -> X  becomes  src/components/ -> X
	const collapseNodes = (nodes: TreeNode[]): TreeNode[] => {
		return nodes.map((node) => {
			if (
				node.children.length === 1 &&
				!node.change &&
				node.children[0].children.length > 0
			) {
				const child = node.children[0];
				const collapsed: TreeNode = {
					name: `${node.name}/${child.name}`,
					fullPath: child.fullPath,
					change: child.change,
					children: collapseNodes(child.children),
				};
				return collapsed;
			}
			return { ...node, children: collapseNodes(node.children) };
		});
	};

	return collapseNodes(root);
}

/** Filter tree nodes: keep nodes whose name/fullPath matches, plus ancestor dirs */
function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
	const q = query.toLowerCase();
	return nodes
		.map((node) => {
			const nameMatch = node.name.toLowerCase().includes(q) ||
				node.fullPath.toLowerCase().includes(q);
			const filteredChildren = filterTree(node.children, query);
			// Keep if name matches or has matching descendants
			if (nameMatch || filteredChildren.length > 0) {
				return { ...node, children: filteredChildren };
			}
			return null;
		})
		.filter((n): n is TreeNode => n !== null);
}

export function FileTreeSidebar() {
	const { changes, mountPoint, sidebarOpen, activeTabId } = useStudioState();
	const dispatch = useStudioDispatch();
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const [filter, setFilter] = useState("");

	const tree = useMemo(() => buildTree(changes, mountPoint), [changes, mountPoint]);
	const filteredTree = useMemo(
		() => (filter ? filterTree(tree, filter) : tree),
		[tree, filter],
	);

	const toggleCollapse = useCallback((path: string) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	const handleSelect = useCallback(
		(path: string, name: string) => {
			dispatch({ type: "OPEN_FILE", path, name });
		},
		[dispatch],
	);

	return (
		<div
			className={cn(
				"overflow-hidden flex-shrink-0 transition-[width,border-color] duration-150 ease-out border-r",
				sidebarOpen ? "border-border" : "border-transparent",
			)}
			style={{ width: sidebarOpen ? 200 : 0, minWidth: 0 }}
		>
			<div className="w-[200px] h-full flex flex-col">
				{/* Filter input — only visible when there are files */}
				{changes.length > 0 && (
					<div className="px-2 py-1.5 flex-shrink-0">
						<div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
							<SearchIcon className="size-3 text-muted-foreground/60 flex-shrink-0" />
							<input
								type="text"
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
								placeholder="Filter files..."
								className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
							/>
						</div>
					</div>
				)}

				{/* File tree */}
				<div className="flex-1 overflow-y-auto">
					{changes.length === 0 ? (
						<div className="p-4 text-muted-foreground text-xs text-center">
							No changes
						</div>
					) : filteredTree.length === 0 ? (
						<div className="p-4 text-muted-foreground text-xs text-center">
							No matches
						</div>
					) : (
						<div className="py-1">
							{filteredTree.map((node) => (
								<FileTreeNode
									key={node.fullPath}
									node={node}
									depth={0}
									selectedPath={activeTabId}
									onSelect={handleSelect}
									collapsed={filter ? new Set() : collapsed}
									onToggle={toggleCollapse}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
