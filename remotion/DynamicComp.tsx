/**
 * DynamicComp — Remotion composition that compiles AI-generated code at render time.
 * Used by Lambda to render videos from code strings passed as inputProps.
 *
 * Supports two input modes:
 *   Single: { code } → compile and render one component
 *   Multi:  { scenes: [{ code, durationInFrames }] } → compile each, compose with Sequence
 */

import React, { useEffect, useState } from "react";
import {
	AbsoluteFill,
	Sequence,
	continueRender,
	delayRender,
	getInputProps,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { compileRemotionCode } from "../lib/remotion-compile";

const CROSSFADE_FRAMES = 15; // 0.5s crossfade at 30fps

// ---------------------------------------------------------------------------
// Inject Tailwind CDN + Google Fonts into <head> for Lambda render environment
// (client preview already has them via layout.tsx — deduplication checks skip if present)
// ---------------------------------------------------------------------------

const GOOGLE_FONTS_URL =
	"https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&family=Outfit:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap";
const TAILWIND_CDN_URL = "https://cdn.tailwindcss.com";

function injectHeadResources(): Promise<void> {
	return new Promise<void>((resolve) => {
		let pending = 2;
		const tick = () => {
			if (--pending === 0) {
				// Wait for font files to actually download (not just the CSS)
				document.fonts.ready.then(() => resolve());
			}
		};

		// Google Fonts
		if (!document.querySelector('link[href*="fonts.googleapis.com"]')) {
			for (const href of ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]) {
				const pc = document.createElement("link");
				pc.rel = "preconnect";
				pc.href = href;
				if (href.includes("gstatic")) pc.crossOrigin = "anonymous";
				document.head.appendChild(pc);
			}
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = GOOGLE_FONTS_URL;
			link.onload = tick;
			link.onerror = tick;
			document.head.appendChild(link);
		} else {
			tick();
		}

		// Tailwind CDN
		if (!document.querySelector('script[src*="tailwindcss"]')) {
			const script = document.createElement("script");
			script.src = TAILWIND_CDN_URL;
			script.onload = tick;
			script.onerror = tick;
			document.head.appendChild(script);
		} else {
			tick();
		}
	});
}

// ---------------------------------------------------------------------------

interface SceneInput {
	code: string;
	durationInFrames: number;
}

interface CompiledScene {
	Component: React.ComponentType;
	durationInFrames: number;
}

function ErrorScreen({ message }: { message: string }) {
	return (
		<AbsoluteFill style={{ backgroundColor: "#1a1a2e", justifyContent: "center", alignItems: "center", padding: 60 }}>
			<div style={{ color: "#ff6b6b", fontSize: 42, fontFamily: "system-ui", textAlign: "center" }}>
				Compilation Error
			</div>
			<div style={{ color: "#fff", fontSize: 24, fontFamily: "monospace", marginTop: 24, textAlign: "center", maxWidth: "80%", wordBreak: "break-word" }}>
				{message}
			</div>
		</AbsoluteFill>
	);
}

export const DynamicComp: React.FC = () => {
	const props = getInputProps() as { code?: string; scenes?: SceneInput[]; durationInFrames?: number };
	const [handle] = useState(() => delayRender("Compiling code..."));
	const [scenes, setScenes] = useState<CompiledScene[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			try {
				// Load Tailwind + fonts before rendering any component
				await injectHeadResources();

				const inputs: SceneInput[] = props.scenes
					? props.scenes
					: props.code
						? [{ code: props.code, durationInFrames: props.durationInFrames || 900 }]
						: [];

				if (inputs.length === 0) {
					setError("No code provided");
					return;
				}

				const compiled: CompiledScene[] = [];
				for (const input of inputs) {
					const result = compileRemotionCode(input.code);
					if (result.error || !result.Component) {
						setError(result.error || "Compilation failed");
						return;
					}
					compiled.push({
						Component: result.Component,
						durationInFrames: input.durationInFrames,
					});
				}
				setScenes(compiled);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Unknown error");
			} finally {
				continueRender(handle);
			}
		})();
	}, [handle]);

	if (error) return <ErrorScreen message={error} />;
	if (scenes.length === 0) return null;

	// Single scene — render directly
	if (scenes.length === 1) {
		const Scene = scenes[0].Component;
		return <Scene />;
	}

	// Multi scene — compose with crossfade transitions
	return (
		<TransitionSeries>
			{scenes.flatMap((scene, i) => {
				const Scene = scene.Component;
				const elements: React.ReactNode[] = [];
				if (i > 0) {
					elements.push(
						<TransitionSeries.Transition
							key={`t-${i}`}
							presentation={fade()}
							timing={linearTiming({ durationInFrames: CROSSFADE_FRAMES })}
						/>,
					);
				}
				elements.push(
					<TransitionSeries.Sequence key={`s-${i}`} durationInFrames={scene.durationInFrames}>
						<Scene />
					</TransitionSeries.Sequence>,
				);
				return elements;
			})}
		</TransitionSeries>
	);
};
