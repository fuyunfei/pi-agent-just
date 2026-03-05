"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── Types ── */

export type ClipRenderState =
	| { status: "idle" }
	| { status: "queued" }
	| { status: "rendering"; progress: number }
	| { status: "done"; url: string; size: number }
	| { status: "error"; message: string };

export interface RenderJob {
	clipId: string;       // filename as ID
	clipName: string;     // display label
	code: string;
	durationInFrames: number;
	fps: number;
}

/* ── Helpers ── */

const LAMBDA_BUDGET = 200;

function estimateLambdas(durationInFrames: number): number {
	const fpl = Math.max(Math.ceil(durationInFrames / 200), 20);
	return Math.ceil(durationInFrames / fpl);
}

function downloadUrl(url: string, filename: string) {
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.target = "_blank";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function notifyDone(clipName: string) {
	const original = document.title;
	document.title = `✅ ${clipName} rendered`;
	setTimeout(() => { document.title = original; }, 5000);

	if (typeof Notification !== "undefined" && Notification.permission === "granted") {
		new Notification("Render complete", { body: `${clipName}.mp4 is ready` });
	}
}

/* ── Hook ── */

export function useRenderQueue() {
	const [states, setStates] = useState<Map<string, ClipRenderState>>(new Map());
	const [isConcatting, setIsConcatting] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const isRunningRef = useRef(false);

	// Per-clip abort controllers for individual cancellation
	const clipAbortMap = useRef<Map<string, AbortController>>(new Map());
	// Clips cancelled while queued — skip when their turn comes
	const skippedIds = useRef<Set<string>>(new Set());
	// Collect render URLs for auto-concat
	const resultUrls = useRef<Map<string, string>>(new Map());

	// Request notification permission on mount
	useEffect(() => {
		if (typeof Notification !== "undefined" && Notification.permission === "default") {
			Notification.requestPermission();
		}
	}, []);

	const updateState = useCallback((clipId: string, state: ClipRenderState) => {
		setStates((prev) => {
			const next = new Map(prev);
			next.set(clipId, state);
			return next;
		});
	}, []);

	/** Render a single clip via Lambda: POST /api/render + poll /api/render/progress */
	const renderOne = useCallback(
		async (job: RenderJob, abort: AbortController, opts: { autoDownload?: boolean } = {}): Promise<boolean> => {
			clipAbortMap.current.set(job.clipId, abort);
			updateState(job.clipId, { status: "rendering", progress: 0 });

			try {
				const res = await fetch("/api/render", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						code: job.code,
						durationInFrames: job.durationInFrames,
						fps: job.fps,
					}),
					signal: abort.signal,
				});
				const data = await res.json();

				if (!res.ok || data.error) {
					updateState(job.clipId, { status: "error", message: data.error || "Render failed" });
					return false;
				}

				const { renderId, bucketName } = data;

				// Poll for progress
				while (!abort.signal.aborted) {
					await wait(1200);
					if (abort.signal.aborted) break;

					const progRes = await fetch("/api/render/progress", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ renderId, bucketName }),
						signal: abort.signal,
					});
					const progData = await progRes.json();

					if (progData.type === "error") {
						updateState(job.clipId, { status: "error", message: progData.message });
						return false;
					}

					if (progData.type === "done") {
						updateState(job.clipId, { status: "done", url: progData.url, size: progData.size ?? 0 });
						resultUrls.current.set(job.clipId, progData.url);
						if (opts.autoDownload !== false) {
							downloadUrl(progData.url, `${job.clipName}.mp4`);
						}
						notifyDone(job.clipName);
						return true;
					}

					if (progData.type === "progress") {
						updateState(job.clipId, {
							status: "rendering",
							progress: Math.max(0.03, progData.progress),
						});
					}
				}

				// Aborted
				updateState(job.clipId, { status: "idle" });
				return false;
			} catch (err) {
				if ((err as Error).name === "AbortError") {
					updateState(job.clipId, { status: "idle" });
					return false;
				}
				updateState(job.clipId, { status: "error", message: (err as Error).message });
				return false;
			} finally {
				clipAbortMap.current.delete(job.clipId);
			}
		},
		[updateState],
	);

	/** Budget-scheduled rendering. Limits concurrent Lambdas to LAMBDA_BUDGET. */
	const runBudgetScheduler = useCallback(
		(jobs: RenderJob[], abort: AbortController): Promise<void> => {
			return new Promise<void>((resolve) => {
				const queue = [...jobs];
				let usedLambdas = 0;
				let inFlight = 0;

				const scheduleNext = () => {
					if (inFlight === 0 && queue.length === 0) {
						resolve();
						return;
					}

					while (queue.length > 0) {
						if (abort.signal.aborted) break;

						const next = queue[0];
						const cost = estimateLambdas(next.durationInFrames);

						// Skip cancelled clips
						if (skippedIds.current.has(next.clipId)) {
							queue.shift();
							updateState(next.clipId, { status: "idle" });
							continue;
						}

						// Check budget: allow if fits, OR if nothing else is running
						if (usedLambdas + cost <= LAMBDA_BUDGET || inFlight === 0) {
							queue.shift();
							usedLambdas += cost;
							inFlight++;

							const clipAbort = new AbortController();
							const onGlobalAbort = () => clipAbort.abort();
							abort.signal.addEventListener("abort", onGlobalAbort);

							renderOne(next, clipAbort, { autoDownload: false }).finally(() => {
								abort.signal.removeEventListener("abort", onGlobalAbort);
								usedLambdas -= cost;
								inFlight--;
								scheduleNext();
							});
						} else {
							break;
						}
					}

					if (abort.signal.aborted && inFlight === 0) {
						resolve();
					}
				};

				scheduleNext();
			});
		},
		[renderOne, updateState],
	);

	/** Auto-concat helper: merge all done clips into one video. */
	const autoConcat = useCallback(
		async (jobs: RenderJob[], abort: AbortController) => {
			if (abort.signal.aborted || jobs.length < 2) return;

			const urls: string[] = [];
			for (const job of jobs) {
				const url = resultUrls.current.get(job.clipId);
				if (url) urls.push(url);
			}
			if (urls.length !== jobs.length) return;

			setIsConcatting(true);
			try {
				const res = await fetch("/api/render/concat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ urls, filename: "video.mp4" }),
				});

				const contentType = res.headers.get("Content-Type") ?? "";
				if (contentType.includes("video/")) {
					// No S3 bucket — response is the raw file
					const blob = await res.blob();
					const blobUrl = URL.createObjectURL(blob);
					downloadUrl(blobUrl, "video.mp4");
					setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
				} else {
					const data = await res.json();
					if (data.type === "success") {
						downloadUrl(data.data.url, "video.mp4");
					} else {
						console.error("[auto-concat]", data.message);
					}
				}
			} catch (err) {
				console.error("[auto-concat]", err);
			} finally {
				setIsConcatting(false);
			}
		},
		[],
	);

	/** Export all clips with budget scheduling. */
	const exportAll = useCallback(
		async (jobs: RenderJob[]) => {
			if (isRunningRef.current || jobs.length === 0) return;
			isRunningRef.current = true;
			skippedIds.current.clear();
			resultUrls.current.clear();

			const abort = new AbortController();
			abortRef.current = abort;

			// Mark all as queued
			setStates(() => {
				const m = new Map<string, ClipRenderState>();
				for (const job of jobs) {
					m.set(job.clipId, { status: "queued" });
				}
				return m;
			});

			// Single clip — direct render with auto-download
			if (jobs.length === 1) {
				const clipAbort = new AbortController();
				const onGlobalAbort = () => clipAbort.abort();
				abort.signal.addEventListener("abort", onGlobalAbort);
				await renderOne(jobs[0], clipAbort);
				abort.signal.removeEventListener("abort", onGlobalAbort);
			} else {
				await runBudgetScheduler(jobs, abort);
				await autoConcat(jobs, abort);
			}

			resultUrls.current.clear();
			isRunningRef.current = false;
			abortRef.current = null;
		},
		[renderOne, runBudgetScheduler, autoConcat],
	);

	/** Retry only failed clips. */
	const retryFailed = useCallback(
		async (jobs: RenderJob[]) => {
			const failedJobs = jobs.filter((j) => {
				const s = states.get(j.clipId);
				return s?.status === "error";
			});
			if (failedJobs.length === 0 || isRunningRef.current) return;
			isRunningRef.current = true;
			skippedIds.current.clear();

			const abort = new AbortController();
			abortRef.current = abort;

			// Reset failed clips to queued
			setStates((prev) => {
				const next = new Map(prev);
				for (const job of failedJobs) {
					next.set(job.clipId, { status: "queued" });
				}
				return next;
			});

			// Seed already-done URLs for auto-concat
			resultUrls.current.clear();
			for (const job of jobs) {
				const s = states.get(job.clipId);
				if (s?.status === "done" && s.url) {
					resultUrls.current.set(job.clipId, s.url);
				}
			}

			await runBudgetScheduler(failedJobs, abort);
			await autoConcat(jobs, abort);

			resultUrls.current.clear();
			isRunningRef.current = false;
			abortRef.current = null;
		},
		[states, runBudgetScheduler, autoConcat],
	);

	/** Cancel a single clip. */
	const cancelOne = useCallback((clipId: string) => {
		const controller = clipAbortMap.current.get(clipId);
		if (controller) {
			controller.abort();
			return;
		}
		// If queued, mark as skipped
		setStates((prev) => {
			const s = prev.get(clipId);
			if (s?.status === "queued") {
				skippedIds.current.add(clipId);
				const next = new Map(prev);
				next.set(clipId, { status: "idle" });
				return next;
			}
			return prev;
		});
	}, []);

	/** Cancel all rendering. */
	const cancel = useCallback(() => {
		abortRef.current?.abort();
	}, []);

	/** Reset all states. */
	const reset = useCallback(() => {
		abortRef.current?.abort();
		setStates(new Map());
	}, []);

	/** Get render state for a specific clip. */
	const getClipState = useCallback(
		(clipId: string): ClipRenderState => states.get(clipId) ?? { status: "idle" },
		[states],
	);

	const isRunning = Array.from(states.values()).some(
		(s) => s.status === "rendering" || s.status === "queued",
	);

	return {
		exportAll, cancelOne, cancel, retryFailed, reset,
		getClipState, states, isRunning, isConcatting,
	};
}
