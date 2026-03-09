"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
	Film, Loader2, CheckCircle, XCircle, RotateCcw,
	AlertTriangle, Download, Square,
} from "lucide-react";
import { useRenderQueue, type RenderJob, type ClipRenderState } from "@/app/hooks/use-render-queue";

export interface SceneData {
	code: string;
	filename: string;
	durationInFrames: number;
}

export interface RenderPayload {
	scenes: SceneData[];
	fps: number;
}

/** Extract readable label: "scene-01-intro.tsx" → "Intro" */
export function sceneLabel(filename: string): string {
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

/**
 * Standalone export dialog. Accepts scenes + code directly (no CodeStudioContext needed).
 * Used by both StudioToolbar (DEV_MODE) and ScenePreviewCard (consumer mode).
 */
export function ExportDialog({
	open,
	onOpenChange,
	scenes,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	scenes: { filename: string; code: string }[];
}) {
	const queue = useRenderQueue();
	const [payload, setPayload] = useState<RenderPayload | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [jobs, setJobs] = useState<RenderJob[]>([]);
	const [isAgentStreaming, setIsAgentStreaming] = useState(false);

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

	// Listen for agent streaming status
	useEffect(() => {
		const handler = (e: Event) => setIsAgentStreaming((e as CustomEvent).detail.isStreaming);
		window.addEventListener("studio:agent-status", handler);
		return () => window.removeEventListener("studio:agent-status", handler);
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
		const sceneCodeMap = new Map(scenes.map((s) => [s.filename, s.code]));
		const newJobs: RenderJob[] = selectedScenes.map((s) => ({
			clipId: s.filename,
			clipName: sceneLabel(s.filename),
			code: sceneCodeMap.get(s.filename) || s.code,
			durationInFrames: s.durationInFrames,
			fps: payload.fps,
		}));
		setJobs(newJobs);
		queue.exportAll(newJobs);
	}, [payload, selected, scenes, queue]);

	const handleRetryFailed = useCallback(() => {
		queue.retryFailed(jobs);
	}, [queue, jobs]);

	const handleRetryConcat = useCallback(() => {
		queue.retryConcat(jobs);
	}, [queue, jobs]);

	const handleDismiss = useCallback(() => {
		queue.reset();
		onOpenChange(false);
	}, [queue, onOpenChange]);

	if (!payload) return null;

	const isActive = queue.isRunning || queue.isConcatting;
	const stateEntries = Array.from(queue.states.entries());
	const hasErrors = stateEntries.some(([, s]) => s.status === "error");
	const doneEntries = stateEntries.filter(([, s]) => s.status === "done");
	const allDone = stateEntries.length > 0 && doneEntries.length === stateEntries.length;
	const hasResults = stateEntries.length > 0;

	/** Format frames as m:ss */
	const fmt = (frames: number) => {
		const sec = Math.floor(frames / payload.fps);
		return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
	};

	const selectedDuration = payload.scenes
		.filter((s) => selected.has(s.filename))
		.reduce((sum, s) => sum + s.durationInFrames, 0);

	return (
		<Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); else onOpenChange(true); }}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="text-base">Export Video</DialogTitle>
					<DialogDescription className="sr-only">Select scenes and export</DialogDescription>
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

				{/* Scene selection (idle state) */}
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
							disabled={selected.size === 0 || isAgentStreaming}
							onClick={exportSelected}
						>
							<Film className="h-4 w-4" />
							Export {selected.size} clip{selected.size !== 1 ? "s" : ""} ({fmt(selectedDuration)})
						</Button>
					</>
				)}

				{/* Render progress */}
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

						{queue.isConcatting && (
							<div className="flex items-center gap-2 text-sm text-muted-foreground pt-1 border-t border-border">
								<Loader2 className="h-4 w-4 animate-spin" />
								<span>Merging clips...</span>
							</div>
						)}

						{queue.concatError && (
							<div className="flex items-center gap-2 pt-1 border-t border-border">
								<AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
								<span className="flex-1 text-sm text-amber-400 break-all">{queue.concatError}</span>
							</div>
						)}

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

						{/* Single clip done */}
						{!queue.concatUrl && allDone && stateEntries.length === 1 && (() => {
							const [clipId, s] = stateEntries[0];
							if (s.status !== "done") return null;
							const clipName = jobs.find((j) => j.clipId === clipId)?.clipName ?? clipId;
							return (
								<a
									href={s.url}
									download={`${clipName}.mp4`}
									className="flex items-center justify-center gap-2 w-full py-2 rounded-md text-sm font-medium text-white transition-colors hover:opacity-90"
									style={{ background: "#6366f1" }}
								>
									<Download className="h-4 w-4" />
									Download {clipName}.mp4
								</a>
							);
						})()}

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
	);
}
