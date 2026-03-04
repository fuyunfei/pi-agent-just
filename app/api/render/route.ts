/**
 * Render API — trigger Lambda render for a Remotion animation.
 *
 * POST /api/render
 *   Single scene: { code, durationInFrames, fps }
 *   Multi scene:  { scenes: [{ code, durationInFrames }], durationInFrames, fps }
 * Returns { renderId, bucketName }
 */

import {
	type AwsRegion,
	renderMediaOnLambda,
	speculateFunctionName,
} from "@remotion/lambda/client";
import { COMP_NAME, DISK, RAM, REGION, SITE_NAME, TIMEOUT } from "../../../config.mjs";

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const { durationInFrames, fps } = body;

		// Support both single code and scenes array
		const hasScenes = Array.isArray(body.scenes) && body.scenes.length > 0;
		const hasCode = typeof body.code === "string" && body.code.length > 0;

		if (!hasScenes && !hasCode) {
			return Response.json({ error: "Missing code or scenes" }, { status: 400 });
		}

		if (!process.env.AWS_ACCESS_KEY_ID && !process.env.REMOTION_AWS_ACCESS_KEY_ID) {
			return Response.json(
				{ error: "Lambda not configured. Set AWS credentials and run: node deploy.mjs" },
				{ status: 500 },
			);
		}

		// Build inputProps — pass scenes array or single code
		const inputProps = hasScenes
			? { scenes: body.scenes, durationInFrames: durationInFrames || 900, fps: fps || 30 }
			: { code: body.code, durationInFrames: durationInFrames || 900, fps: fps || 30 };

		const sceneCount = hasScenes ? body.scenes.length : 1;
		const totalFrames = durationInFrames || 900;
		// Target ~100 lambdas for best speed/cost balance, hard cap at 200
		const framesPerLambda = Math.max(20, Math.ceil(totalFrames / 100));
		console.log(`[render] start scenes=${sceneCount} duration=${totalFrames} fps=${fps} framesPerLambda=${framesPerLambda}`);

		const result = await renderMediaOnLambda({
			codec: "h264",
			functionName: speculateFunctionName({
				diskSizeInMb: DISK,
				memorySizeInMb: RAM,
				timeoutInSeconds: TIMEOUT,
			}),
			region: REGION as AwsRegion,
			serveUrl: SITE_NAME,
			composition: COMP_NAME,
			inputProps,
			framesPerLambda,
			downloadBehavior: {
				type: "download",
				fileName: "animation.mp4",
			},
		});

		console.log(`[render] invoked renderId=${result.renderId}`);
		return Response.json({
			renderId: result.renderId,
			bucketName: result.bucketName,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.log(`[render] error: ${msg}`);
		return Response.json({ error: msg }, { status: 500 });
	}
}
