/**
 * Shared Remotion compiler — used by both client preview and Lambda render.
 *
 * Transpiles AI-generated TSX via @babel/standalone and creates a React
 * component with pre-injected Remotion globals via `new Function()`.
 */

import * as Babel from "@babel/standalone";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AbsoluteFill,
	Audio,
	Easing,
	Img,
	Sequence,
	Video,
	interpolate,
	interpolateColors,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import * as RemotionShapes from "@remotion/shapes";
import { Lottie } from "@remotion/lottie";
import { ThreeCanvas } from "@remotion/three";
import {
	TransitionSeries,
	linearTiming,
	springTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompilationResult {
	Component: React.ComponentType | null;
	error: string | null;
}

// ---------------------------------------------------------------------------
// Import stripping & component extraction
// ---------------------------------------------------------------------------

function stripImports(code: string): string {
	let cleaned = code;
	// Type imports
	cleaned = cleaned.replace(/import\s+type\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, "");
	// Combined default + named imports
	cleaned = cleaned.replace(/import\s+\w+\s*,\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, "");
	// Named imports
	cleaned = cleaned.replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, "");
	// Namespace imports
	cleaned = cleaned.replace(/import\s+\*\s+as\s+\w+\s+from\s*["'][^"']+["'];?/g, "");
	// Default imports
	cleaned = cleaned.replace(/import\s+\w+\s+from\s*["'][^"']+["'];?/g, "");
	// Side-effect imports
	cleaned = cleaned.replace(/import\s*["'][^"']+["'];?/g, "");
	return cleaned.trim();
}

function extractComponentBody(code: string): string {
	const cleaned = stripImports(code);

	// Each pattern captures (helpers)(body). Tried in order of likelihood.
	const patterns: { re: RegExp; jsxReturn?: boolean }[] = [
		// export [default] const X [: Type] = () => { BODY }
		{ re: /^([\s\S]*?)export\s+(?:default\s+)?const\s+\w+\s*(?::[^=]+)?\s*=\s*\(\s*\)\s*=>\s*\{([\s\S]*)\};?\s*$/ },
		// export [default] const X [: Type] = () => ( JSX )
		{ re: /^([\s\S]*?)export\s+(?:default\s+)?const\s+\w+\s*(?::[^=]+)?\s*=\s*\(\s*\)\s*=>\s*\(([\s\S]*)\);?\s*$/, jsxReturn: true },
		// export [default] function X() { BODY }
		{ re: /^([\s\S]*?)export\s+(?:default\s+)?function\s+\w+\s*\(\s*\)\s*\{([\s\S]*)\}\s*$/ },
		// export default () => { BODY }
		{ re: /^([\s\S]*?)export\s+default\s+\(\s*\)\s*=>\s*\{([\s\S]*)\};?\s*$/ },
		// export default () => ( JSX )
		{ re: /^([\s\S]*?)export\s+default\s+\(\s*\)\s*=>\s*\(([\s\S]*)\);?\s*$/, jsxReturn: true },
	];

	for (const { re, jsxReturn } of patterns) {
		const m = cleaned.match(re);
		if (m) {
			const helpers = m[1].trim();
			const rawBody = m[2].trim();
			const body = jsxReturn ? `return (\n${rawBody}\n);` : rawBody;
			return helpers ? `${helpers}\n\n${body}` : body;
		}
	}

	return cleaned;
}

// ---------------------------------------------------------------------------
// Injected globals — parameter names & values for `new Function()`
// ---------------------------------------------------------------------------

const PARAM_NAMES: string[] = [];
const PARAM_VALUES: unknown[] = [];

function inject(name: string, value: unknown) {
	PARAM_NAMES.push(name);
	PARAM_VALUES.push(value);
}

// React
inject("React", React);
inject("useState", useState);
inject("useEffect", useEffect);
inject("useMemo", useMemo);
inject("useRef", useRef);
inject("useCallback", useCallback);

// Remotion core
inject("AbsoluteFill", AbsoluteFill);
inject("interpolate", interpolate);
inject("interpolateColors", interpolateColors);
inject("spring", spring);
inject("Easing", Easing);
inject("useCurrentFrame", useCurrentFrame);
inject("useVideoConfig", useVideoConfig);

// Sequence: default layout="none" so it only controls timing, doesn't wrap in AbsoluteFill
const SequenceNoLayout = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof Sequence>>(
	(props, ref) => React.createElement(Sequence, { layout: "none", ...props, ref }),
);
SequenceNoLayout.displayName = "Sequence";
inject("Sequence", SequenceNoLayout);
inject("Img", Img);
inject("Audio", Audio);
inject("Video", Video);

// Shapes
inject("Rect", RemotionShapes.Rect);
inject("Circle", RemotionShapes.Circle);
inject("Triangle", RemotionShapes.Triangle);
inject("Star", RemotionShapes.Star);
inject("Polygon", RemotionShapes.Polygon);
inject("Ellipse", RemotionShapes.Ellipse);
inject("Heart", RemotionShapes.Heart);
inject("Pie", RemotionShapes.Pie);
inject("makeRect", RemotionShapes.makeRect);
inject("makeCircle", RemotionShapes.makeCircle);
inject("makeTriangle", RemotionShapes.makeTriangle);
inject("makeStar", RemotionShapes.makeStar);
inject("makePolygon", RemotionShapes.makePolygon);
inject("makeEllipse", RemotionShapes.makeEllipse);
inject("makeHeart", RemotionShapes.makeHeart);
inject("makePie", RemotionShapes.makePie);

// Transitions
inject("TransitionSeries", TransitionSeries);
inject("linearTiming", linearTiming);
inject("springTiming", springTiming);
inject("fade", fade);
inject("slide", slide);
inject("wipe", wipe);
inject("flip", flip);
inject("clockWipe", clockWipe);

// Lottie
inject("Lottie", Lottie);

// 3D
inject("ThreeCanvas", ThreeCanvas);
inject("THREE", THREE);

// ---------------------------------------------------------------------------
// Core compile function
// ---------------------------------------------------------------------------

export function compileRemotionCode(code: string): CompilationResult {
	if (!code?.trim()) {
		return { Component: null, error: "No code provided" };
	}

	try {
		const componentBody = extractComponentBody(code);
		const wrappedSource = `const DynamicAnimation = () => {\n${componentBody}\n};`;

		const transpiled = Babel.transform(wrappedSource, {
			presets: ["react", "typescript"],
			filename: "dynamic-animation.tsx",
		});

		if (!transpiled.code) {
			return { Component: null, error: "Transpilation failed" };
		}

		const wrappedCode = `${transpiled.code}\nreturn DynamicAnimation;`;
		const createComponent = new Function(...PARAM_NAMES, wrappedCode);
		const Component = createComponent(...PARAM_VALUES);

		if (typeof Component !== "function") {
			return { Component: null, error: "Code must export a component function" };
		}

		return { Component, error: null };
	} catch (error) {
		let msg = error instanceof Error ? error.message : "Compilation error";

		// Enhance "X is not defined" errors with suggestions
		const notDefined = msg.match(/(\w+) is not defined/);
		if (notDefined) {
			const name = notDefined[1];
			const similar = PARAM_NAMES.filter((p) =>
				p.toLowerCase().includes(name.toLowerCase()) ||
				name.toLowerCase().includes(p.toLowerCase()),
			);
			if (similar.length > 0) {
				msg += `\n\nDid you mean: ${similar.join(", ")}?`;
			} else {
				msg += `\n\nAvailable APIs: ${PARAM_NAMES.filter((p) => p !== "React").join(", ")}`;
			}
		}

		return { Component: null, error: msg };
	}
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Check if code uses Remotion imports */
export function isRemotionCode(code: string): boolean {
	return /from\s+["']remotion["']/.test(code) ||
		/from\s+["']@remotion\//.test(code);
}

/** Parse `// @remotion fps:30 duration:1800` from code */
export function parseRemotionConfig(code: string): { fps: number; durationInFrames: number } {
	const defaults = { fps: 30, durationInFrames: 900 };
	const match = code.match(/\/\/\s*@remotion\b(.+)/);
	if (!match) return defaults;

	const line = match[1];
	const fpsMatch = line.match(/fps:\s*(\d+)/);
	const durMatch = line.match(/duration:\s*(\d+)/);

	return {
		fps: fpsMatch ? parseInt(fpsMatch[1], 10) : defaults.fps,
		durationInFrames: durMatch ? parseInt(durMatch[1], 10) : defaults.durationInFrames,
	};
}
