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
import { compileRemotionCode } from "../lib/remotion-compile";

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
		try {
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
	}, [handle]);

	if (error) return <ErrorScreen message={error} />;
	if (scenes.length === 0) return null;

	// Single scene — render directly
	if (scenes.length === 1) {
		const Scene = scenes[0].Component;
		return <Scene />;
	}

	// Multi scene — compose with Sequence
	let offset = 0;
	return (
		<AbsoluteFill>
			{scenes.map((scene, i) => {
				const from = offset;
				offset += scene.durationInFrames;
				const Scene = scene.Component;
				return (
					<Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
						<Scene />
					</Sequence>
				);
			})}
		</AbsoluteFill>
	);
};
