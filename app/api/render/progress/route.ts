/**
 * Render Progress API — poll Lambda render status.
 *
 * POST /api/render/progress → { renderId, bucketName }
 * Returns { type: "progress", progress } | { type: "done", url, size } | { type: "error", message }
 */

import {
	type AwsRegion,
	getRenderProgress,
	speculateFunctionName,
} from "@remotion/lambda/client";
import { DISK, RAM, REGION, TIMEOUT } from "../../../../config.mjs";

export async function POST(req: Request) {
	try {
		const { renderId, bucketName } = await req.json();

		if (!renderId || !bucketName) {
			return Response.json({ error: "Missing renderId or bucketName" }, { status: 400 });
		}

		const progress = await getRenderProgress({
			bucketName,
			functionName: speculateFunctionName({
				diskSizeInMb: DISK,
				memorySizeInMb: RAM,
				timeoutInSeconds: TIMEOUT,
			}),
			region: REGION as AwsRegion,
			renderId,
		});

		if (progress.fatalErrorEncountered) {
			console.log(`[render] failed renderId=${renderId} error=${progress.errors[0]?.message}`);
			return Response.json({
				type: "error",
				message: progress.errors[0]?.message || "Render failed",
			});
		}

		if (progress.done) {
			console.log(`[render] done renderId=${renderId} size=${progress.outputSizeInBytes}`);
			return Response.json({
				type: "done",
				url: progress.outputFile as string,
				size: progress.outputSizeInBytes as number,
			});
		}

		return Response.json({
			type: "progress",
			progress: Math.max(0.03, progress.overallProgress),
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return Response.json({ error: msg }, { status: 500 });
	}
}
