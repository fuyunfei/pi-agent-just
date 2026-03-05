"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStudioDispatch, useStudioState } from "./CodeStudioContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PanelLeft, Film, Loader2, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { useRenderQueue, type RenderJob, type ClipRenderState } from "@/app/hooks/use-render-queue";

interface SceneData {
	code: string;
	filename: string;
	durationInFrames: number;
}

interface RenderPayload {
	scenes: SceneData[];
	fps: number;
}

/** Extract readable label: "scene-01-intro.tsx" → "Intro" */
function sceneLabel(filename: string): string {
	const base = filename.replace(/\.(tsx|jsx|ts|js)$/, "");
	const stripped = base.replace(/^scene-\d+-/, "");
	if (stripped) return stripped.charAt(0).toUpperCase() + stripped.slice(1);
	return base;
}

/** Compact per-clip progress row */
function ClipRow({ clipId, clipName, state, onCancel }: {
	clipId: string;
	clipName: string;
	state: ClipRenderState;
	onCancel: (id: string) => void;
}) {
	if (state.status === "queued") {
		return (
			<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
				<span className="flex-1 truncate">{clipName}</span>
				<span className="opacity-60">queued</span>
				<button onClick={() => onCancel(clipId)} className="hover:text-foreground transition-colors">
					<XCircle className="h-3 w-3" />
				</button>
			</div>
		);
	}

	if (state.status === "rendering") {
		const pct = Math.round(state.progress * 100);
		return (
			<div className="flex items-center gap-2 text-[11px]">
				<span className="flex-1 truncate text-muted-foreground">{clipName}</span>
				<div className="w-14 h-1 bg-muted rounded-full overflow-hidden">
					<div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: "#6366f1" }} />
				</div>
				<span className="text-muted-foreground w-7 text-right">{pct}%</span>
				<button onClick={() => onCancel(clipId)} className="text-muted-foreground hover:text-foreground transition-colors">
					<XCircle className="h-3 w-3" />
				</button>
			</div>
		);
	}

	if (state.status === "done") {
		const sizeMB = (state.size / 1024 / 1024).toFixed(1);
		return (
			<div className="flex items-center gap-2 text-[11px] text-green-400">
				<CheckCircle className="h-3 w-3 flex-shrink-0" />
				<span className="flex-1 truncate">{clipName}</span>
				<span className="opacity-60">{sizeMB}MB</span>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="flex items-center gap-2 text-[11px] text-red-400">
						<XCircle className="h-3 w-3 flex-shrink-0" />
						<span className="flex-1 truncate">{clipName}</span>
						<span>failed</span>
					</div>
				</TooltipTrigger>
				<TooltipContent side="left" className="max-w-[200px]">{state.message}</TooltipContent>
			</Tooltip>
		);
	}

	return null;
}

function ExportButton() {
	const { changes } = useStudioState();
	const queue = useRenderQueue();
	const [payload, setPayload] = useState<RenderPayload | null>(null);
	const [hoverOpen, setHoverOpen] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [jobs, setJobs] = useState<RenderJob[]>([]);
	const hoverRef = useRef<HTMLDivElement>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	// Listen for render data from RemotionPreview
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.scenes) setPayload(detail);
		};
		window.addEventListener("studio:render-data", handler);
		return () => window.removeEventListener("studio:render-data", handler);
	}, []);

	// Default: select all scenes when payload changes
	useEffect(() => {
		if (payload) {
			setSelected(new Set(payload.scenes.map((s) => s.filename)));
		}
	}, [payload]);

	// Reset on payload change
	useEffect(() => {
		if (!queue.isRunning && !queue.isConcatting) {
			queue.reset();
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [payload]);

	useEffect(() => {
		return () => clearTimeout(closeTimerRef.current);
	}, []);

	const openHover = useCallback(() => {
		clearTimeout(closeTimerRef.current);
		setHoverOpen(true);
	}, []);

	const closeHover = useCallback(() => {
		closeTimerRef.current = setTimeout(() => setHoverOpen(false), 200);
	}, []);

	const toggleScene = useCallback((filename: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(filename)) next.delete(filename);
			else next.add(filename);
			return next;
		});
	}, []);

	const exportSelected = useCallback(() => {
		if (!payload || selected.size === 0) return;
		const selectedScenes = payload.scenes.filter((s) => selected.has(s.filename));
		const newJobs: RenderJob[] = selectedScenes.map((s) => ({
			clipId: s.filename,
			clipName: sceneLabel(s.filename),
			code: s.code,
			durationInFrames: s.durationInFrames,
			fps: payload.fps,
		}));
		setJobs(newJobs);
		setHoverOpen(false);
		queue.exportAll(newJobs);
	}, [payload, selected, queue]);

	const handleRetryFailed = useCallback(() => {
		queue.retryFailed(jobs);
	}, [queue, jobs]);

	// No remotion files — hide export
	const hasRemotionFiles = changes.some((c) => c.content && /from\s+["']remotion["']/.test(c.content));
	if (!hasRemotionFiles || !payload) return null;

	const multiScene = payload.scenes.length > 1;
	const isActive = queue.isRunning || queue.isConcatting;
	const stateEntries = Array.from(queue.states.entries());
	const hasErrors = stateEntries.some(([, s]) => s.status === "error");
	const doneEntries = stateEntries.filter(([, s]) => s.status === "done");
	const allDone = stateEntries.length > 0
		&& stateEntries.every(([, s]) => s.status === "done" || s.status === "idle")
		&& doneEntries.length > 0;

	/** Format frames as m:ss */
	const fmt = (frames: number) => {
		const sec = Math.floor(frames / payload!.fps);
		return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
	};

	const selectedDuration = payload.scenes
		.filter((s) => selected.has(s.filename))
		.reduce((sum, s) => sum + s.durationInFrames, 0);

	// ── Active rendering: show per-clip progress ──
	if (isActive || (stateEntries.length > 0 && !allDone)) {
		return (
			<div className="flex items-center gap-2 px-2">
				{/* Compact: single clip shows inline progress */}
				{stateEntries.length === 1 ? (
					(() => {
						const [clipId, s] = stateEntries[0];
						const clipName = jobs.find((j) => j.clipId === clipId)?.clipName ?? clipId;
						if (s.status === "rendering") {
							const pct = Math.round(s.progress * 100);
							return (
								<>
									<div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
										<div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: "#6366f1" }} />
									</div>
									<span className="text-[11px] text-muted-foreground">{pct}%</span>
									<button onClick={() => queue.cancel()} className="text-muted-foreground hover:text-foreground transition-colors ml-0.5">
										<XCircle className="h-3 w-3" />
									</button>
								</>
							);
						}
						if (s.status === "queued") {
							return (
								<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
									<Loader2 className="h-3 w-3 animate-spin" />
									<span>Rendering {clipName}...</span>
									<button onClick={() => queue.cancel()} className="hover:text-foreground transition-colors">
										<XCircle className="h-3 w-3" />
									</button>
								</div>
							);
						}
						if (s.status === "error") {
							return (
								<Tooltip>
									<TooltipTrigger asChild>
										<button onClick={() => queue.reset()} className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300">
											<XCircle className="h-3 w-3" />
											<span>Failed</span>
										</button>
									</TooltipTrigger>
									<TooltipContent side="bottom">{s.message}</TooltipContent>
								</Tooltip>
							);
						}
						return null;
					})()
				) : (
					/* Multi-clip: hoverable dropdown with per-clip rows */
					<div
						ref={hoverRef}
						style={{ position: "relative" }}
						onMouseEnter={openHover}
						onMouseLeave={closeHover}
					>
						{queue.isConcatting ? (
							<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
								<Loader2 className="h-3 w-3 animate-spin" />
								<span>Merging...</span>
							</div>
						) : (
							<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
								<Loader2 className="h-3 w-3 animate-spin" />
								<span>
									{stateEntries.filter(([, s]) => s.status === "done").length}/{stateEntries.length} clips
								</span>
								<button onClick={() => queue.cancel()} className="hover:text-foreground transition-colors">
									<XCircle className="h-3 w-3" />
								</button>
							</div>
						)}
						{hoverOpen && (
							<div
								className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 p-2 space-y-1"
								style={{ minWidth: 220 }}
								onMouseEnter={openHover}
								onMouseLeave={closeHover}
							>
								{jobs.map((job) => (
									<ClipRow
										key={job.clipId}
										clipId={job.clipId}
										clipName={job.clipName}
										state={queue.getClipState(job.clipId)}
										onCancel={queue.cancelOne}
									/>
								))}
								{hasErrors && !queue.isRunning && (
									<div className="pt-1 border-t border-border">
										<button
											onClick={handleRetryFailed}
											className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
										>
											<RotateCcw className="h-3 w-3" />
											Retry failed
										</button>
									</div>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		);
	}

	// ── All done: show result ──
	if (allDone && stateEntries.length > 0) {
		// Single clip done
		if (stateEntries.length === 1) {
			const [, s] = stateEntries[0];
			if (s.status === "done") {
				const sizeMB = (s.size / 1024 / 1024).toFixed(1);
				return (
					<a href={s.url} download="animation.mp4" className="flex items-center gap-1.5 text-[11px] text-green-400 px-2 hover:underline">
						<CheckCircle className="h-3 w-3" />
						<span>{sizeMB} MB</span>
					</a>
				);
			}
		}
		// Multi-clip done
		const totalSize = doneEntries.reduce((sum, [, s]) => sum + (s.status === "done" ? s.size : 0), 0);
		const sizeMB = (totalSize / 1024 / 1024).toFixed(1);
		return (
			<button onClick={() => queue.reset()} className="flex items-center gap-1.5 text-[11px] text-green-400 px-2 hover:underline">
				<CheckCircle className="h-3 w-3" />
				<span>{doneEntries.length} clips • {sizeMB} MB</span>
			</button>
		);
	}

	// ── With errors after completion ──
	if (hasErrors && !isActive) {
		return (
			<div className="flex items-center gap-2 px-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<button onClick={() => queue.reset()} className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300">
							<XCircle className="h-3 w-3" />
							<span>Failed</span>
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Click to dismiss</TooltipContent>
				</Tooltip>
				<button
					onClick={handleRetryFailed}
					className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
				>
					<RotateCcw className="h-3 w-3" />
					Retry
				</button>
			</div>
		);
	}

	// ── Idle: scene selection + export button ──
	if (!multiScene) {
		return (
			<Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={exportSelected}>
				<Film className="h-3.5 w-3.5" />
				Export
			</Button>
		);
	}

	return (
		<div
			ref={hoverRef}
			style={{ position: "relative" }}
			onMouseEnter={openHover}
			onMouseLeave={closeHover}
		>
			<Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
				<Film className="h-3.5 w-3.5" />
				Export
			</Button>
			{hoverOpen && (
				<div
					className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50"
					style={{ minWidth: 200 }}
					onMouseEnter={openHover}
					onMouseLeave={closeHover}
				>
					<div className="py-1.5">
						{payload.scenes.map((scene) => (
							<label
								key={scene.filename}
								className="flex items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-accent transition-colors"
							>
								<input
									type="checkbox"
									checked={selected.has(scene.filename)}
									onChange={() => toggleScene(scene.filename)}
									className="rounded accent-[#6366f1]"
								/>
								<span className="flex-1">{sceneLabel(scene.filename)}</span>
								<span className="text-muted-foreground opacity-60">{fmt(scene.durationInFrames)}</span>
							</label>
						))}
					</div>
					<div className="border-t border-border px-3 py-2">
						<Button
							size="sm"
							className="w-full h-7 text-xs gap-1.5"
							style={{ background: "#6366f1" }}
							disabled={selected.size === 0}
							onClick={exportSelected}
						>
							<Film className="h-3 w-3" />
							Export {fmt(selectedDuration)}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

export function StudioToolbar() {
	const { sidebarOpen } = useStudioState();
	const dispatch = useStudioDispatch();

	return (
		<div className="flex items-center h-[35px] flex-shrink-0 bg-transparent absolute top-0 left-0 right-0 z-10">
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

			<div className="flex-1" />

			<div className="flex items-center gap-1 px-2 flex-shrink-0">
				<ExportButton />
			</div>
		</div>
	);
}
