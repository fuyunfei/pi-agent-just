/**
 * Concat API — merge rendered clip MP4s into a single video.
 *
 * POST /api/render/concat
 *   { urls: string[], filename?: string }
 * Returns { type: "success", data: { url, size } } or streams the file directly.
 */

import { execFileSync } from "child_process";
import { createReadStream, createWriteStream, writeFileSync, mkdirSync, rmSync, statSync } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { REGION } from "../../../../config.mjs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath = require("ffmpeg-static") as string;

interface ConcatRequest {
	urls: string[];
	filename?: string;
}

export async function POST(req: Request) {
	const body = (await req.json()) as ConcatRequest;
	const { urls, filename = "video.mp4" } = body;

	if (!urls || urls.length < 2) {
		return NextResponse.json({ type: "error", message: "Need at least 2 URLs" }, { status: 400 });
	}

	const id = randomUUID().slice(0, 8);
	const dir = join(tmpdir(), `concat-${id}`);
	const listFile = join(dir, "list.txt");
	const outputFile = join(dir, "output.mp4");

	try {
		mkdirSync(dir, { recursive: true });

		// Download all clips to /tmp
		const localPaths: string[] = [];
		for (let i = 0; i < urls.length; i++) {
			const localPath = join(dir, `clip-${i}.mp4`);
			const res = await fetch(urls[i]);
			if (!res.ok || !res.body) throw new Error(`Failed to download clip ${i}: ${res.status}`);
			const writer = createWriteStream(localPath);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await pipeline(Readable.fromWeb(res.body as any), writer);
			localPaths.push(localPath);
		}

		// Write ffmpeg concat list
		const listContent = localPaths.map((p) => `file '${p}'`).join("\n");
		writeFileSync(listFile, listContent);

		// Concat with -c copy (no re-encoding, very fast)
		execFileSync(ffmpegPath, [
			"-f", "concat", "-safe", "0",
			"-i", listFile,
			"-c", "copy",
			"-movflags", "+faststart",
			outputFile,
		], { timeout: 60_000 });

		const outputSize = statSync(outputFile).size;

		// Upload to S3 (same bucket Remotion uses)
		const bucketName = process.env.REMOTION_BUCKET_NAME;
		if (!bucketName) {
			// Fallback: read entire file into memory, then clean up
			const { readFileSync } = await import("fs");
			const buffer = readFileSync(outputFile);
			rmSync(dir, { recursive: true, force: true });
			return new NextResponse(buffer, {
				headers: {
					"Content-Type": "video/mp4",
					"Content-Disposition": `attachment; filename="${filename}"`,
					"Content-Length": outputSize.toString(),
				},
			});
		}

		const s3 = new S3Client({
			region: REGION,
			credentials: {
				accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
				secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
			},
		});

		const s3Key = `renders/concat-${id}.mp4`;
		await s3.send(new PutObjectCommand({
			Bucket: bucketName,
			Key: s3Key,
			Body: createReadStream(outputFile),
			ContentType: "video/mp4",
			ContentDisposition: `attachment; filename="${filename}"`,
		}));

		const url = `https://${bucketName}.s3.${REGION}.amazonaws.com/${s3Key}`;

		return NextResponse.json({
			type: "success",
			data: { url, size: outputSize },
		});
	} catch (err) {
		return NextResponse.json(
			{ type: "error", message: (err as Error).message },
			{ status: 500 },
		);
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch { /* ignore */ }
	}
}
