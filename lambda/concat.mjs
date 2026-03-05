/**
 * Lambda handler: concat MP4 clips using ffmpeg -c copy.
 *
 * Input:  { bucket, keys: string[], outputKey?: string }
 * Output: { url, size }
 *
 * All S3 traffic stays within the same region (internal network).
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { execFileSync } from "child_process";
import { createWriteStream, createReadStream, writeFileSync, statSync, rmSync, mkdirSync } from "fs";
import { pipeline } from "stream/promises";
import { randomUUID } from "crypto";
import { join } from "path";

const REGION = process.env.AWS_REGION || "us-east-1";
const ffmpegPath = process.env.FFMPEG_PATH || "/opt/bin/ffmpeg";

const s3 = new S3Client({ region: REGION });

export async function handler(event) {
	const { bucket, keys, outputKey } = event;

	if (!bucket || !keys || keys.length < 2) {
		throw new Error("Need bucket and at least 2 keys");
	}

	const id = randomUUID().slice(0, 8);
	const dir = `/tmp/concat-${id}`;
	mkdirSync(dir, { recursive: true });

	try {
		// Download all clips in parallel
		const localPaths = await Promise.all(
			keys.map(async (key, i) => {
				const localPath = join(dir, `clip-${i}.mp4`);
				const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
				await pipeline(res.Body, createWriteStream(localPath));
				return localPath;
			}),
		);

		// Write ffmpeg concat list
		const listFile = join(dir, "list.txt");
		writeFileSync(listFile, localPaths.map((p) => `file '${p}'`).join("\n"));

		// Concat with copy (no re-encoding)
		const outputFile = join(dir, "output.mp4");
		execFileSync(ffmpegPath, [
			"-f", "concat",
			"-safe", "0",
			"-i", listFile,
			"-c", "copy",
			"-movflags", "+faststart",
			outputFile,
		], { timeout: 55_000 });

		const size = statSync(outputFile).size;

		// Upload result
		const finalKey = outputKey || `renders/concat-${id}.mp4`;
		await s3.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: finalKey,
				Body: createReadStream(outputFile),
				ContentType: "video/mp4",
			}),
		);

		const url = `https://${bucket}.s3.${REGION}.amazonaws.com/${finalKey}`;
		return { url, size };
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch { /* ignore */ }
	}
}
