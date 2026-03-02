import React from "react";
import { Composition } from "remotion";
import { DynamicComp } from "./DynamicComp";

const defaultCode = `import { AbsoluteFill } from "remotion";
export const MyAnimation = () => <AbsoluteFill style={{ backgroundColor: "#000" }} />;`;

export const RemotionRoot: React.FC = () => {
	return (
		<Composition
			id="DynamicComp"
			component={DynamicComp}
			durationInFrames={900}
			fps={30}
			width={1920}
			height={1080}
			defaultProps={{ code: defaultCode, scenes: undefined, durationInFrames: 900, fps: 30 }}
			calculateMetadata={({ props }) => ({
				durationInFrames: (props.durationInFrames as number) || 900,
				fps: (props.fps as number) || 30,
			})}
		/>
	);
};
