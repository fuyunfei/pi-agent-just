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
// Babel plugin: strip import/export at AST level (replaces fragile regex)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function createStripModuleSyntax(onDefault: (name: string) => void, onNamed: (name: string) => void) {
	return ({ types: t }: any) => ({
		visitor: {
			// Remove all imports — globals are injected via new Function() params
			ImportDeclaration(path: any) {
				path.remove();
			},
			// export default → plain declaration, track component name
			ExportDefaultDeclaration(path: any) {
				const decl = path.node.declaration;
				if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") {
					if (!decl.id) decl.id = t.identifier("_Comp");
					onDefault(decl.id.name);
					path.replaceWith(decl);
				} else if (decl.type === "Identifier") {
					onDefault(decl.name);
					path.remove();
				} else {
					// ArrowFunctionExpression, FunctionExpression, ClassDeclaration, etc.
					onDefault("_Comp");
					path.replaceWith(
						t.variableDeclaration("const", [
							t.variableDeclarator(t.identifier("_Comp"), decl),
						]),
					);
				}
			},
			// export const/function/class → strip export keyword, track name
			ExportNamedDeclaration(path: any) {
				if (path.node.declaration) {
					const decl = path.node.declaration;
					// Track the first exported name as potential component
					if (decl.type === "VariableDeclaration" && decl.declarations?.[0]?.id?.name) {
						onNamed(decl.declarations[0].id.name);
					} else if ((decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") && decl.id?.name) {
						onNamed(decl.id.name);
					}
					path.replaceWith(decl);
				} else {
					path.remove();
				}
			},
		},
	});
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
		let src = code;
		let defaultExportName: string | null = null;
		let namedExportName: string | null = null;

		// Fix invalid "export default const/let/var X" (common AI mistake)
		const edcMatch = src.match(/export\s+default\s+(?:const|let|var)\s+(\w+)/);
		if (edcMatch) {
			src = src.replace(/export\s+default\s+(const|let|var)\s+/, "$1 ");
			defaultExportName = edcMatch[1];
		}

		const plugin = createStripModuleSyntax(
			(name) => { defaultExportName = name; },
			(name) => { namedExportName = name; },
		);
		const babelOpts = { presets: ["react", "typescript"], plugins: [plugin], sourceType: "module" as const, filename: "dynamic-animation.tsx" };

		let transpiled: ReturnType<typeof Babel.transform>;
		try {
			transpiled = Babel.transform(src, babelOpts);
		} catch (babelErr: unknown) {
			// Bare component body (no function wrapper) → wrap and retry
			const msg = babelErr instanceof Error ? babelErr.message : "";
			if (msg.includes("'return' outside of function")) {
				const stripped = src.replace(/^\s*import\s+.*$/gm, "");
				defaultExportName = "_Comp";
				transpiled = Babel.transform(`function _Comp() {\n${stripped}\n}`, babelOpts);
			} else {
				throw babelErr;
			}
		}

		if (!transpiled.code) {
			return { Component: null, error: "Transpilation failed" };
		}

		// Use default export, or named export, or wrap as component body (backward compat).
		const exportName = defaultExportName || namedExportName;
		const finalCode = exportName
			? `${transpiled.code}\nreturn ${exportName};`
			: `var _Comp = function _Comp() {\n${transpiled.code}\n};\nreturn _Comp;`;

		const createComponent = new Function(...PARAM_NAMES, finalCode);
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
