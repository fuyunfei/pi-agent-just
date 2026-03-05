"use client";

import { useCallback, useEffect, useState } from "react";
import { useStudioDispatch, useStudioState } from "./CodeStudioContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
	PanelLeft, Film, Loader2, CheckCircle, XCircle, RotateCcw,
	AlertTriangle, Download, Square,
} from "lucide-react";
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

/** Per-clip row inside the export dialog */
function ClipRow({ clipId, clipName, state, onCancel }: {
	clipId: string;
	clipName: string;
	state: ClipRenderState;
	onCancel: (id: string) => void;
}) {
	if (state.status === "queued") {
		return (
			<div className="flex items-center gap-3 py-1.5">
				<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
				<span className="flex-1 truncate text-sm">{clipName}</span>
				<span className="text-xs text-muted-foreground">queued</span>
				<button onClick={() => onCancel(clipId)} className="text-muted-foreground hover:text-foreground transition-colors">
					<XCircle className="h-3.5 w-3.5" />
				</button>
			</div>
		);
	}

	if (state.status === "rendering") {
		const pct = Math.round(state.progress * 100);
		return (
			<div className="flex items-center gap-3 py-1.5">
				<Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400 flex-shrink-0" />
				<span className="flex-1 truncate text-sm">{clipName}</span>
				<div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
					<div
						className="h-full rounded-full transition-[width] duration-300"
						style={{ width: `${pct}%`, background: "#6366f1" }}
					/>
				</div>
				<span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
				<button onClick={() => onCancel(clipId)} className="text-muted-foreground hover:text-foreground transition-colors">
					<XCircle className="h-3.5 w-3.5" />
				</button>
			</div>
		);
	}

	if (state.status === "done") {
		const sizeMB = (state.size / 1024 / 1024).toFixed(1);
		return (
			<div className="flex items-center gap-3 py-1.5">
				<CheckCircle className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
				<span className="flex-1 truncate text-sm text-green-400">{clipName}</span>
				<span className="text-xs text-muted-foreground">{sizeMB} MB</span>
				<a
					href={state.url}
					download={`${clipName}.mp4`}
					className="text-muted-foreground hover:text-foreground transition-colors"
					onClick={(e) => e.stopPropagation()}
				>
					<Download className="h-3.5 w-3.5" />
				</a>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="py-1.5">
				<div className="flex items-center gap-3">
					<XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
					<span className="flex-1 truncate text-sm text-red-400">{clipName}</span>
					<span className="text-xs text-red-400">failed</span>
				</div>
				<p className="text-xs text-red-400/80 mt-1 ml-6.5 break-all">{state.message}</p>
			</div>
		);
	}

	return null;
}

function ExportButton() {
	const { changes } = useStudioState();
	const queue = useRenderQueue();
	const [payload, setPayload] = useState<RenderPayload | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [jobs, setJobs] = useState<RenderJob[]>([]);

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

	// Reset on payload change (only when idle)
	useEffect(() => {
		if (!queue.isRunning && !queue.isConcatting) {
			queue.reset();
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [payload]);

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
		// Fix #6: auto-open dialog for multi-clip exports
		if (selectedScenes.length > 1) setDialogOpen(true);
		queue.exportAll(newJobs);
	}, [payload, selected, queue]);

	const handleRetryFailed = useCallback(() => {
		queue.retryFailed(jobs);
	}, [queue, jobs]);

	const handleRetryConcat = useCallback(() => {
		queue.retryConcat(jobs);
	}, [queue, jobs]);

	// Fix #5: Dismiss resets state AND closes; closing alone preserves state
	const handleDismiss = useCallback(() => {
		queue.reset();
		setDialogOpen(false);
	}, [queue]);

	const handleCloseDialog = useCallback(() => {
		setDialogOpen(false);
	}, []);

	// No remotion files — hide export
	const hasRemotionFiles = changes.some((c) => c.content && /from\s+["']remotion["']/.test(c.content));
	if (!hasRemotionFiles || !payload) return null;

	const multiScene = payload.scenes.length > 1;
	const isActive = queue.isRunning || queue.isConcatting;
	const stateEntries = Array.from(queue.states.entries());
	const hasErrors = stateEntries.some(([, s]) => s.status === "error");
	const doneEntries = stateEntries.filter(([, s]) => s.status === "done");
	// Fix #3: allDone requires ALL clips to be done, not just non-idle ones
	const allDone = stateEntries.length > 0
		&& doneEntries.length === stateEntries.length;
	const hasResults = stateEntries.length > 0;

	/** Format frames as m:ss */
	const fmt = (frames: number) => {
		const sec = Math.floor(frames / payload!.fps);
		return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
	};

	const selectedDuration = payload.scenes
		.filter((s) => selected.has(s.filename))
		.reduce((sum, s) => sum + s.durationInFrames, 0);

	// ── Toolbar indicator (compact) ──
	const renderToolbarIndicator = () => {
		// Single clip inline progress (no dialog needed)
		if (hasResults && stateEntries.length === 1) {
			const [clipId, s] = stateEntries[0];
			const clipName = jobs.find((j) => j.clipId === clipId)?.clipName ?? clipId;

			if (s.status === "rendering") {
				const pct = Math.round(s.progress * 100);
				return (
					<div className="flex items-center gap-2 px-2">
						<div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
							<div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: "#6366f1" }} />
						</div>
						<span className="text-[11px] text-muted-foreground">{pct}%</span>
						<button onClick={() => queue.cancel()} className="text-muted-foreground hover:text-foreground transition-colors">
							<XCircle className="h-3 w-3" />
						</button>
					</div>
				);
			}
			if (s.status === "queued") {
				return (
					<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2">
						<Loader2 className="h-3 w-3 animate-spin" />
						<span>Rendering {clipName}...</span>
						<button onClick={() => queue.cancel()} className="hover:text-foreground transition-colors">
							<XCircle className="h-3 w-3" />
						</button>
					</div>
				);
			}
			if (s.status === "done") {
				const sizeMB = (s.size / 1024 / 1024).toFixed(1);
				return (
					<a href={s.url} download={`${clipName}.mp4`} className="flex items-center gap-1.5 text-[11px] text-green-400 px-2 hover:text-green-300 transition-colors">
						<CheckCircle className="h-3 w-3" />
						<span>{sizeMB} MB</span>
					</a>
				);
			}
			// Fix #2: single clip error opens dialog for full error details
			if (s.status === "error") {
				return (
					<button onClick={() => setDialogOpen(true)} className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 px-2">
						<XCircle className="h-3 w-3" />
						<span>Failed</span>
					</button>
				);
			}
		}

		// Multi-clip: show compact status that opens dialog on click
		if (hasResults && stateEntries.length > 1) {
			if (queue.isConcatting) {
				return (
					<button onClick={() => setDialogOpen(true)} className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 hover:text-foreground transition-colors">
						<Loader2 className="h-3 w-3 animate-spin" />
						<span>Merging...</span>
					</button>
				);
			}
			if (isActive) {
				return (
					<button onClick={() => setDialogOpen(true)} className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 hover:text-foreground transition-colors">
						<Loader2 className="h-3 w-3 animate-spin" />
						<span>{doneEntries.length}/{stateEntries.length} clips</span>
					</button>
				);
			}
			if (queue.concatError) {
				return (
					<button onClick={() => setDialogOpen(true)} className="flex items-center gap-1.5 text-[11px] text-amber-400 px-2 hover:text-amber-300 transition-colors">
						<AlertTriangle className="h-3 w-3" />
						<span>Merge failed</span>
					</button>
				);
			}
			if (allDone) {
				return (
					<button onClick={() => setDialogOpen(true)} className="flex items-center gap-1.5 text-[11px] text-green-400 px-2 hover:text-green-300 transition-colors">
						<CheckCircle className="h-3 w-3" />
						<span>{doneEntries.length} clips done</span>
					</button>
				);
			}
			// Fix #4: partial failure shows done count with warning, not just "Export failed"
			if (hasErrors) {
				return (
					<button onClick={() => setDialogOpen(true)} className="flex items-center gap-1.5 text-[11px] text-amber-400 px-2 hover:text-amber-300 transition-colors">
						<AlertTriangle className="h-3 w-3" />
						<span>{doneEntries.length}/{stateEntries.length} clips done</span>
					</button>
				);
			}
		}

		return null;
	};

	const indicator = renderToolbarIndicator();

	return (
		<>
			{/* Toolbar: Export button or status indicator */}
			{indicator ?? (
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 px-2 text-xs"
					onClick={() => {
						if (multiScene) {
							setDialogOpen(true);
						} else {
							exportSelected();
						}
					}}
				>
					<Film className="h-3.5 w-3.5" />
					Export
				</Button>
			)}

			{/* Export Dialog */}
			<Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else setDialogOpen(true); }}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="text-base">Export Video</DialogTitle>
						<DialogDescription className="sr-only">Select scenes and export</DialogDescription>
						{/* Fix #7: overall progress bar for multi-clip rendering */}
						{hasResults && stateEntries.length > 1 && isActive && (
							<div className="flex items-center gap-2 pt-1">
								<div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
									<div
										className="h-full rounded-full transition-[width] duration-300"
										style={{
											width: `${Math.round((doneEntries.length / stateEntries.length) * 100)}%`,
											background: "#6366f1",
										}}
									/>
								</div>
								<span className="text-xs text-muted-foreground whitespace-nowrap">
									Rendering {doneEntries.length}/{stateEntries.length} clips...
								</span>
							</div>
						)}
					</DialogHeader>

					{/* ── Scene selection (idle state) ── */}
					{!hasResults && (
						<>
							<div className="space-y-0.5">
								{payload.scenes.map((scene) => (
									<label
										key={scene.filename}
										className="flex items-center gap-3 px-2 py-2 rounded-md text-sm cursor-pointer hover:bg-accent transition-colors"
									>
										<input
											type="checkbox"
											checked={selected.has(scene.filename)}
											onChange={() => toggleScene(scene.filename)}
											className="rounded accent-[#6366f1]"
										/>
										<span className="flex-1">{sceneLabel(scene.filename)}</span>
										<span className="text-muted-foreground text-xs">{fmt(scene.durationInFrames)}</span>
									</label>
								))}
							</div>
							<Button
								className="w-full gap-2"
								style={{ background: "#6366f1" }}
								disabled={selected.size === 0}
								onClick={exportSelected}
							>
								<Film className="h-4 w-4" />
								Export {selected.size} clip{selected.size !== 1 ? "s" : ""} ({fmt(selectedDuration)})
							</Button>
						</>
					)}

					{/* ── Render progress ── */}
					{hasResults && (
						<>
							<div className="space-y-0.5">
								{jobs.map((job) => (
									<ClipRow
										key={job.clipId}
										clipId={job.clipId}
										clipName={job.clipName}
										state={queue.getClipState(job.clipId)}
										onCancel={queue.cancelOne}
									/>
								))}
							</div>

							{/* Concat status */}
							{queue.isConcatting && (
								<div className="flex items-center gap-2 text-sm text-muted-foreground pt-1 border-t border-border">
									<Loader2 className="h-4 w-4 animate-spin" />
									<span>Merging clips...</span>
								</div>
							)}

							{/* Concat error */}
							{queue.concatError && (
								<div className="flex items-center gap-2 pt-1 border-t border-border">
									<AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
									<span className="flex-1 text-sm text-amber-400 break-all">{queue.concatError}</span>
								</div>
							)}

							{/* Merged video download */}
							{queue.concatUrl && !isActive && (
								<a
									href={queue.concatUrl}
									download="video.mp4"
									className="flex items-center justify-center gap-2 w-full py-2 rounded-md text-sm font-medium text-white transition-colors hover:opacity-90"
									style={{ background: "#6366f1" }}
								>
									<Download className="h-4 w-4" />
									Download video.mp4
								</a>
							)}

							{/* Actions */}
							<div className="flex items-center gap-2 pt-1">
								{isActive && (
									<Button variant="outline" size="sm" className="gap-1.5" onClick={() => queue.cancel()}>
										<Square className="h-3 w-3" />
										Stop
									</Button>
								)}
								{hasErrors && !isActive && (
									<Button variant="outline" size="sm" className="gap-1.5" onClick={handleRetryFailed}>
										<RotateCcw className="h-3.5 w-3.5" />
										Retry failed
									</Button>
								)}
								{queue.concatError && !isActive && (
									<Button variant="outline" size="sm" className="gap-1.5" onClick={handleRetryConcat}>
										<RotateCcw className="h-3.5 w-3.5" />
										Retry merge
									</Button>
								)}
								{!isActive && (
									<Button variant="ghost" size="sm" onClick={handleDismiss}>
										Dismiss
									</Button>
								)}
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>
		</>
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
