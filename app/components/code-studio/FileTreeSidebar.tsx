"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { BookOpen, Play, SearchIcon, Trash2 } from "lucide-react";
import type { SkillInfo } from "../chat/types";
import { useStudioDispatch, useStudioState } from "./CodeStudioContext";
import { FileTreeNode } from "./FileTreeNode";
import { isRemotionCode } from "./remotion-compiler";
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

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
	const q = query.toLowerCase();
	return nodes
		.map((node) => {
			const nameMatch = node.name.toLowerCase().includes(q) ||
				node.fullPath.toLowerCase().includes(q);
			const filteredChildren = filterTree(node.children, query);
			if (nameMatch || filteredChildren.length > 0) {
				return { ...node, children: filteredChildren };
			}
			return null;
		})
		.filter((n): n is TreeNode => n !== null);
}

/** "scene-01-intro.tsx" → "Intro" */
function sceneLabel(filename: string): string {
	const base = filename.replace(/\.(tsx|jsx|ts|js)$/, "");
	const stripped = base.replace(/^scene-\d+-/, "");
	if (stripped) return stripped.charAt(0).toUpperCase() + stripped.slice(1);
	return base;
}

function formatDuration(frames: number, fps: number): string {
	const sec = Math.floor(frames / fps);
	return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
}

interface SceneInfo {
	filename: string;
	durationInFrames: number;
}

/* ------------------------------------------------------------------ */
/*  Context menu                                                       */
/* ------------------------------------------------------------------ */

interface ContextMenuState {
	x: number;
	y: number;
	path: string;
	label: string;
}

function ContextMenu({
	menu,
	onDelete,
	onClose,
}: {
	menu: ContextMenuState;
	onDelete: (path: string) => void;
	onClose: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) onClose();
		};
		const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
		document.addEventListener("mousedown", handler);
		document.addEventListener("keydown", esc);
		return () => {
			document.removeEventListener("mousedown", handler);
			document.removeEventListener("keydown", esc);
		};
	}, [onClose]);

	return (
		<div
			ref={ref}
			className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1"
			style={{ left: menu.x, top: menu.y, minWidth: 140 }}
		>
			<button
				type="button"
				onClick={() => { onDelete(menu.path); onClose(); }}
				className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
			>
				<Trash2 className="size-3" />
				Delete
			</button>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Scene list                                                         */
/* ------------------------------------------------------------------ */

function SceneList({
	remotionFiles,
	onContextMenu,
}: {
	remotionFiles: { filename: string; path: string }[];
	onContextMenu: (e: React.MouseEvent, path: string, label: string) => void;
}) {
	const dispatch = useStudioDispatch();
	const [activeIndex, setActiveIndex] = useState(0);
	const [sceneData, setSceneData] = useState<{ scenes: SceneInfo[]; fps: number } | null>(null);

	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.scenes) setSceneData(detail);
		};
		window.addEventListener("studio:render-data", handler);
		return () => window.removeEventListener("studio:render-data", handler);
	}, []);

	useEffect(() => {
		const handler = (e: Event) => {
			const idx = (e as CustomEvent).detail?.index;
			if (typeof idx === "number") setActiveIndex(idx);
		};
		window.addEventListener("studio:scene-update", handler);
		return () => window.removeEventListener("studio:scene-update", handler);
	}, []);

	// Clamp activeIndex when scene count changes (e.g. after deletion)
	useEffect(() => {
		setActiveIndex((prev) => Math.min(prev, Math.max(0, remotionFiles.length - 1)));
	}, [remotionFiles.length]);

	const selectScene = useCallback((index: number) => {
		if (remotionFiles[0]) {
			dispatch({ type: "OPEN_FILE", path: remotionFiles[0].path, name: remotionFiles[0].filename });
		}
		window.dispatchEvent(new CustomEvent("studio:scene-select", { detail: { index } }));
	}, [remotionFiles, dispatch]);

	const displayScenes = useMemo(() => {
		return remotionFiles.map((f, i) => {
			const compiled = sceneData?.scenes[i];
			return {
				filename: f.filename,
				path: f.path,
				label: sceneLabel(f.filename),
				duration: compiled ? formatDuration(compiled.durationInFrames, sceneData!.fps) : null,
			};
		});
	}, [remotionFiles, sceneData]);

	const totalDuration = sceneData
		? formatDuration(
			sceneData.scenes.reduce((sum, s) => sum + s.durationInFrames, 0),
			sceneData.fps,
		)
		: null;

	return (
		<div className="flex-shrink-0">
			<div className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
				Scenes
			</div>
			{displayScenes.map((scene, i) => (
				<div
					key={scene.filename}
					onClick={() => selectScene(i)}
					onContextMenu={(e) => onContextMenu(e, scene.path, scene.label)}
					className={cn(
						"flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors duration-75",
						i === activeIndex ? "bg-accent" : "hover:bg-muted/50",
					)}
				>
					<div className={cn(
						"flex-shrink-0 size-4 flex items-center justify-center",
						i === activeIndex ? "text-foreground" : "text-muted-foreground/40",
					)}>
						{i === activeIndex ? (
							<Play className="size-3 fill-current" />
						) : (
							<span className="text-[11px]">{i + 1}</span>
						)}
					</div>
					<span className={cn(
						"flex-1 text-[13px] truncate",
						i === activeIndex ? "text-foreground" : "text-muted-foreground",
					)}>
						{scene.label}
					</span>
					{scene.duration && (
						<span className="text-[11px] text-muted-foreground/50 flex-shrink-0 tabular-nums">
							{scene.duration}
						</span>
					)}
				</div>
			))}
			{totalDuration && (
				<div className="px-3 py-1.5 text-[11px] text-muted-foreground/50 flex justify-between">
					<span>{displayScenes.length} scenes</span>
					<span>{totalDuration}</span>
				</div>
			)}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Skill list                                                         */
/* ------------------------------------------------------------------ */

function SkillList({ skills }: { skills: SkillInfo[] }) {
	const handleClick = useCallback((skill: SkillInfo) => {
		// Dispatch a custom event that ChatPanel can pick up
		window.dispatchEvent(new CustomEvent("skill:load", { detail: { name: skill.name } }));
	}, []);

	return (
		<div className="flex-shrink-0">
			<div className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
				Skills
			</div>
			{skills.map((skill) => (
				<div
					key={skill.name}
					onClick={() => handleClick(skill)}
					className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors duration-75 hover:bg-muted/50"
					title={skill.description}
				>
					<BookOpen className="flex-shrink-0 size-3.5 text-muted-foreground/40" />
					<span className="flex-1 text-[13px] text-muted-foreground truncate">
						{skill.name}
					</span>
				</div>
			))}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Main sidebar                                                       */
/* ------------------------------------------------------------------ */

export function FileTreeSidebar() {
	const { changes, mountPoint, sidebarOpen, activeTabId } = useStudioState();
	const dispatch = useStudioDispatch();
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const [filter, setFilter] = useState("");
	const [menu, setMenu] = useState<ContextMenuState | null>(null);
	const closeMenu = useCallback(() => setMenu(null), []);
	const [skills, setSkills] = useState<SkillInfo[]>([]);

	// Fetch available skills
	useEffect(() => {
		fetch("/api/agent/command", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ command: "skills" }),
		})
			.then((r) => r.json())
			.then((data) => {
				if (data.ok && data.skills) setSkills(data.skills);
			})
			.catch(() => {});
	}, []);

	// Split changes into Remotion scenes vs other files
	const remotionPaths = useMemo(() => {
		const paths = new Set<string>();
		for (const c of changes) {
			if (c.type !== "deleted" && c.content && isRemotionCode(c.content)) {
				paths.add(c.path);
			}
		}
		return paths;
	}, [changes]);

	const remotionFiles = useMemo(() => {
		return changes
			.filter((c) => remotionPaths.has(c.path))
			.map((c) => ({
				filename: c.path.split("/").pop() || c.path,
				path: c.path,
			}))
			; // keep generation order from changes
	}, [changes, remotionPaths]);

	const otherChanges = useMemo(() => {
		return changes.filter((c) => !remotionPaths.has(c.path) && c.type !== "deleted");
	}, [changes, remotionPaths]);

	const tree = useMemo(() => buildTree(otherChanges, mountPoint), [otherChanges, mountPoint]);
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

	const handleContextMenu = useCallback((e: React.MouseEvent, path: string, label: string) => {
		e.preventDefault();
		const menuW = 140, menuH = 40;
		const x = Math.min(e.clientX, window.innerWidth - menuW - 4);
		const y = Math.min(e.clientY, window.innerHeight - menuH - 4);
		setMenu({ x, y, path, label });
	}, []);

	const handleDelete = useCallback(async (path: string) => {
		try {
			const res = await fetch("/api/sandbox", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "delete", path }),
			});
			if (!res.ok) return;
			const data = await res.json();
			if (activeTabId === path) {
				dispatch({ type: "CLOSE_TAB", tabId: path });
			}
			window.dispatchEvent(new CustomEvent("studio:refresh", {
				detail: { changes: data.changes, mountPoint: data.mountPoint },
			}));
		} catch {
			// ignore
		}
	}, [activeTabId, dispatch]);

	const hasScenes = remotionFiles.length > 0;
	const hasOtherFiles = otherChanges.length > 0;

	return (
		<div
			className={cn(
				"overflow-hidden flex-shrink-0 transition-[width,border-color] duration-150 ease-out border-r",
				sidebarOpen ? "border-border" : "border-transparent",
			)}
			style={{ width: sidebarOpen ? 200 : 0, minWidth: 0 }}
		>
			<div className="w-[200px] h-full flex flex-col overflow-y-auto">
				{/* Scene list (top) */}
				{hasScenes && (
					<SceneList
						remotionFiles={remotionFiles}
						onContextMenu={handleContextMenu}
					/>
				)}

				{/* Divider between scenes and files */}
				{hasScenes && hasOtherFiles && (
					<div className="border-t border-border mx-3 my-1" />
				)}

				{/* Other files section */}
				{hasOtherFiles && (
					<>
						{hasScenes && (
							<div className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex-shrink-0">
								Files
							</div>
						)}

						{/* Search — only when no scenes (pure file mode) */}
						{!hasScenes && otherChanges.length > 0 && (
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

						<div className="flex-1">
							{filteredTree.length === 0 ? (
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
											onContextMenu={handleContextMenu}
										/>
									))}
								</div>
							)}
						</div>
					</>
				)}

				{/* Skills section */}
				{skills.length > 0 && (
					<>
						{(hasScenes || hasOtherFiles) && (
							<div className="border-t border-border mx-3 my-1" />
						)}
						<SkillList skills={skills} />
					</>
				)}

				{/* Empty state */}
				{!hasScenes && !hasOtherFiles && skills.length === 0 && (
					<div className="p-4 text-muted-foreground text-xs text-center">
						No changes
					</div>
				)}
			</div>

			{/* Right-click context menu */}
			{menu && (
				<ContextMenu
					menu={menu}
					onDelete={handleDelete}
					onClose={closeMenu}
				/>
			)}
		</div>
	);
}
