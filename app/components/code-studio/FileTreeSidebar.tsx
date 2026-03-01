"use client";

import { useMemo, useState, useCallback } from "react";
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

export function FileTreeSidebar() {
	const { changes, mountPoint, sidebarOpen, activeTabId } = useStudioState();
	const dispatch = useStudioDispatch();
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

	const tree = useMemo(() => buildTree(changes, mountPoint), [changes, mountPoint]);

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

	if (!sidebarOpen) return null;

	return (
		<div className="w-[200px] min-w-[160px] studio-border-r overflow-y-auto flex-shrink-0">
			{changes.length === 0 ? (
				<div className="p-4 studio-dim text-xs text-center">
					No changes
				</div>
			) : (
				<div className="py-1">
					{tree.map((node) => (
						<FileTreeNode
							key={node.fullPath}
							node={node}
							depth={0}
							selectedPath={activeTabId}
							onSelect={handleSelect}
							collapsed={collapsed}
							onToggle={toggleCollapse}
						/>
					))}
				</div>
			)}
		</div>
	);
}
