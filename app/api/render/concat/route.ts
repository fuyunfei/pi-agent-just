/**
 * Concat API — merge rendered clip MP4s into a single video via Lambda.
 *
 * POST /api/render/concat
 *   { urls: string[], filename?: string }
 * Returns { type: "success", data: { url, size } }
 *
 * The actual concat runs in the pi-concat Lambda (same region, S3 internal).
 */

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { NextResponse } from "next/server";
import { REGION } from "../../../../config.mjs";

const FUNCTION_NAME = "pi-concat";

interface ConcatRequest {
	urls: string[];
	filename?: string;
}

/**
 * Parse an S3 URL into { bucket, key }.
 * Supports:
 *   https://bucket.s3.region.amazonaws.com/key
 *   https://s3.region.amazonaws.com/bucket/key
 */
function parseS3Url(url: string): { bucket: string; key: string } {
	const u = new URL(url);
	const host = u.hostname;

	// Virtual-hosted style: bucket.s3.region.amazonaws.com
	const vhost = host.match(/^(.+?)\.s3[.-].*\.amazonaws\.com$/);
	if (vhost) {
		return { bucket: vhost[1], key: decodeURIComponent(u.pathname.slice(1)) };
	}

	// Path style: s3.region.amazonaws.com/bucket/key
	const parts = u.pathname.slice(1).split("/");
	return { bucket: parts[0], key: decodeURIComponent(parts.slice(1).join("/")) };
}

export async function POST(req: Request) {
	const body = (await req.json()) as ConcatRequest;
	const { urls } = body;

	if (!urls || urls.length < 2) {
		return NextResponse.json({ type: "error", message: "Need at least 2 URLs" }, { status: 400 });
	}

	try {
		// All clips are in the same bucket — extract bucket + keys
		const parsed = urls.map(parseS3Url);
		const bucket = parsed[0].bucket;
		const keys = parsed.map((p) => p.key);

		const lambda = new LambdaClient({
			region: REGION,
			credentials: {
				accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
				secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
			},
		});

		const res = await lambda.send(
			new InvokeCommand({
				FunctionName: FUNCTION_NAME,
				Payload: Buffer.from(JSON.stringify({ bucket, keys })),
			}),
		);

		if (res.FunctionError) {
			const errPayload = JSON.parse(new TextDecoder().decode(res.Payload));
			throw new Error(errPayload.errorMessage || res.FunctionError);
		}

		const result = JSON.parse(new TextDecoder().decode(res.Payload));

		return NextResponse.json({
			type: "success",
			data: { url: result.url, size: result.size },
		});
	} catch (err) {
		return NextResponse.json(
			{ type: "error", message: (err as Error).message },
			{ status: 500 },
		);
	}
}
