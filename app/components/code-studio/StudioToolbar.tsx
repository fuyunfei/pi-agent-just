"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStudioDispatch, useStudioState } from "./CodeStudioContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PanelLeft, Film, Loader2, CheckCircle, XCircle } from "lucide-react";

type RenderState =
	| { status: "idle" }
	| { status: "invoking" }
	| { status: "rendering"; progress: number; renderId: string; bucketName: string }
	| { status: "done"; url: string; size: number }
	| { status: "error"; message: string };

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

function ExportButton() {
	const { changes } = useStudioState();
	const [state, setState] = useState<RenderState>({ status: "idle" });
	const abortRef = useRef(false);
	const [payload, setPayload] = useState<RenderPayload | null>(null);
	const [hoverOpen, setHoverOpen] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
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

	// Reset on scene change
	useEffect(() => {
		if (state.status === "done" || state.status === "error") {
			setState({ status: "idle" });
		}
	}, [payload]);

	useEffect(() => {
		return () => {
			abortRef.current = true;
			clearTimeout(closeTimerRef.current);
		};
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

	const invokeRender = useCallback(async (body: Record<string, unknown>) => {
		abortRef.current = false;
		setHoverOpen(false);
		setState({ status: "invoking" });

		try {
			const res = await fetch("/api/render", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = await res.json();

			if (!res.ok || data.error) {
				setState({ status: "error", message: data.error || "Render failed" });
				return;
			}

			const { renderId, bucketName } = data;
			setState({ status: "rendering", progress: 0, renderId, bucketName });

			while (!abortRef.current) {
				await new Promise((r) => setTimeout(r, 800));
				if (abortRef.current) break;

				const progRes = await fetch("/api/render/progress", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ renderId, bucketName }),
				});
				const progData = await progRes.json();

				if (progData.type === "done") {
					setState({ status: "done", url: progData.url, size: progData.size });
					return;
				}
				if (progData.type === "error") {
					setState({ status: "error", message: progData.message });
					return;
				}
				if (progData.type === "progress") {
					setState({ status: "rendering", progress: progData.progress, renderId, bucketName });
				}
			}
		} catch (err) {
			setState({ status: "error", message: err instanceof Error ? err.message : "Network error" });
		}
	}, []);

	const exportSelected = useCallback(() => {
		if (!payload || selected.size === 0) return;
		const selectedScenes = payload.scenes.filter((s) => selected.has(s.filename));
		const fps = payload.fps;
		if (selectedScenes.length === 1) {
			invokeRender({ code: selectedScenes[0].code, durationInFrames: selectedScenes[0].durationInFrames, fps });
		} else {
			const scenes = selectedScenes.map((s) => ({ code: s.code, durationInFrames: s.durationInFrames }));
			const totalDur = scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
			invokeRender({ scenes, durationInFrames: totalDur, fps });
		}
	}, [payload, selected, invokeRender]);

	const cancelRender = useCallback(() => {
		abortRef.current = true;
		setState({ status: "idle" });
	}, []);

	// No remotion files — hide export
	const hasRemotionFiles = changes.some((c) => c.content && /from\s+["']remotion["']/.test(c.content));
	if (!hasRemotionFiles || !payload) return null;

	const multiScene = payload.scenes.length > 1;

	/** Format frames as m:ss */
	const fmt = (frames: number) => {
		const sec = Math.floor(frames / payload!.fps);
		return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
	};

	const selectedDuration = payload.scenes
		.filter((s) => selected.has(s.filename))
		.reduce((sum, s) => sum + s.durationInFrames, 0);

	if (state.status === "idle") {
		// Single scene — direct export, no menu
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

	if (state.status === "invoking") {
		return (
			<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2">
				<Loader2 className="h-3 w-3 animate-spin" />
				<span>Rendering...</span>
			</div>
		);
	}

	if (state.status === "rendering") {
		const pct = Math.round(state.progress * 100);
		return (
			<div className="flex items-center gap-2 px-2">
				<div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
					<div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: "#6366f1" }} />
				</div>
				<span className="text-[11px] text-muted-foreground">{pct}%</span>
				<button onClick={cancelRender} className="text-muted-foreground hover:text-foreground transition-colors ml-0.5">
					<XCircle className="h-3 w-3" />
				</button>
			</div>
		);
	}

	if (state.status === "done") {
		const sizeMB = (state.size / 1024 / 1024).toFixed(1);
		return (
			<a href={state.url} download="animation.mp4" className="flex items-center gap-1.5 text-[11px] text-green-400 px-2 hover:underline">
				<CheckCircle className="h-3 w-3" />
				<span>{sizeMB} MB</span>
			</a>
		);
	}

	// error
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button onClick={() => setState({ status: "idle" })} className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 px-2">
					<XCircle className="h-3 w-3" />
					<span>Failed</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{state.message}</TooltipContent>
		</Tooltip>
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
