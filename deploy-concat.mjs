/**
 * Deploy the pi-concat Lambda function.
 *
 * Usage: node deploy-concat.mjs
 *
 * Downloads a static ffmpeg binary for linux-arm64, packages it with the
 * handler, creates/updates the IAM role and Lambda function.
 */

import {
	LambdaClient,
	CreateFunctionCommand,
	UpdateFunctionCodeCommand,
	UpdateFunctionConfigurationCommand,
	GetFunctionCommand,
	waitUntilFunctionActiveV2,
	waitUntilFunctionUpdatedV2,
} from "@aws-sdk/client-lambda";
import {
	IAMClient,
	CreateRoleCommand,
	AttachRolePolicyCommand,
	GetRoleCommand,
	PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";

const REGION = process.env.REMOTION_AWS_REGION || process.env.AWS_REGION || "us-east-1";
const FUNCTION_NAME = "pi-concat";
const ROLE_NAME = "pi-concat-role";
const FFMPEG_URL =
	"https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-linux-arm64";

// ── Helpers ──────────────────────────────────────────────────────────

function checkCredentials() {
	const key = process.env.AWS_ACCESS_KEY_ID || process.env.REMOTION_AWS_ACCESS_KEY_ID;
	const secret = process.env.AWS_SECRET_ACCESS_KEY || process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
	if (!key || !secret) {
		console.error("Missing AWS credentials (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)");
		process.exit(1);
	}
	return {
		accessKeyId: key,
		secretAccessKey: secret,
	};
}

// ── IAM ──────────────────────────────────────────────────────────────

async function ensureRole(iam) {
	const assumeRolePolicy = JSON.stringify({
		Version: "2012-10-17",
		Statement: [
			{
				Effect: "Allow",
				Principal: { Service: "lambda.amazonaws.com" },
				Action: "sts:AssumeRole",
			},
		],
	});

	let roleArn;
	try {
		const { Role } = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
		roleArn = Role.Arn;
		console.log(`  IAM role: ${ROLE_NAME} (exists)`);
	} catch {
		const { Role } = await iam.send(
			new CreateRoleCommand({
				RoleName: ROLE_NAME,
				AssumeRolePolicyDocument: assumeRolePolicy,
				Description: "Role for pi-concat Lambda",
			}),
		);
		roleArn = Role.Arn;
		console.log(`  IAM role: ${ROLE_NAME} (created)`);

		// Wait a few seconds for IAM propagation
		await new Promise((r) => setTimeout(r, 8000));
	}

	// Attach CloudWatch logs
	await iam.send(
		new AttachRolePolicyCommand({
			RoleName: ROLE_NAME,
			PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
		}),
	);

	// Inline S3 policy
	await iam.send(
		new PutRolePolicyCommand({
			RoleName: ROLE_NAME,
			PolicyName: "S3Access",
			PolicyDocument: JSON.stringify({
				Version: "2012-10-17",
				Statement: [
					{
						Effect: "Allow",
						Action: ["s3:GetObject", "s3:PutObject"],
						Resource: "arn:aws:s3:::*",
					},
				],
			}),
		}),
	);

	return roleArn;
}

// ── ffmpeg binary ────────────────────────────────────────────────────

async function downloadFfmpeg(destDir) {
	const dest = join(destDir, "bin", "ffmpeg");
	if (existsSync(dest)) {
		console.log("  ffmpeg: cached");
		return;
	}
	mkdirSync(join(destDir, "bin"), { recursive: true });
	process.stdout.write("  ffmpeg: downloading... ");
	const res = await fetch(FFMPEG_URL);
	if (!res.ok) throw new Error(`Failed to download ffmpeg: ${res.status}`);
	await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
	chmodSync(dest, 0o755);
	console.log("done");
}

// ── Package & deploy ─────────────────────────────────────────────────

async function main() {
	const credentials = checkCredentials();
	const clientConfig = { region: REGION, credentials };
	const iam = new IAMClient(clientConfig);
	const lambda = new LambdaClient(clientConfig);

	console.log(`Deploying ${FUNCTION_NAME} to ${REGION}\n`);

	// 1. IAM role
	const roleArn = await ensureRole(iam);

	// 2. Build zip
	const buildDir = join(".", ".concat-build");
	rmSync(buildDir, { recursive: true, force: true });
	mkdirSync(buildDir, { recursive: true });

	// Copy handler
	const handlerSrc = readFileSync("lambda/concat.mjs");
	writeFileSync(join(buildDir, "index.mjs"), handlerSrc);

	// Download ffmpeg into layer dir
	const layerDir = join(buildDir, "opt");
	await downloadFfmpeg(layerDir);

	// Create zip
	process.stdout.write("  Packaging... ");
	execSync(`cd "${buildDir}" && zip -r9 ../concat-deploy.zip . -x '*.DS_Store'`, {
		stdio: "pipe",
	});
	console.log("done");

	const zipBuffer = readFileSync("concat-deploy.zip");
	const zipSizeMB = zipBuffer.length / 1024 / 1024;
	console.log(`  Zip size: ${zipSizeMB.toFixed(1)} MB\n`);

	// If zip > 50MB, upload to S3 first (Lambda direct upload limit)
	const DIRECT_LIMIT_MB = 50;
	let s3Code = undefined;
	if (zipSizeMB > DIRECT_LIMIT_MB) {
		const deployBucket = process.env.REMOTION_BUCKET_NAME;
		if (!deployBucket) {
			console.error("Zip exceeds 50MB — set REMOTION_BUCKET_NAME for S3-based deploy");
			process.exit(1);
		}
		const s3Key = `deploy/${FUNCTION_NAME}.zip`;
		process.stdout.write(`  Uploading zip to s3://${deployBucket}/${s3Key}... `);
		const s3 = new S3Client(clientConfig);
		await s3.send(new PutObjectCommand({
			Bucket: deployBucket,
			Key: s3Key,
			Body: zipBuffer,
		}));
		console.log("done");
		s3Code = { S3Bucket: deployBucket, S3Key: s3Key };
	}

	const lambdaConfig = {
		Runtime: "nodejs22.x",
		Handler: "index.handler",
		MemorySize: 256,
		EphemeralStorage: { Size: 512 },
		Timeout: 60,
		Architectures: ["arm64"],
		Environment: {
			Variables: {
				FFMPEG_PATH: "/var/task/opt/bin/ffmpeg",
			},
		},
	};

	// 3. Create or update Lambda
	let exists = false;
	try {
		await lambda.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
		exists = true;
	} catch { /* doesn't exist */ }

	if (exists) {
		process.stdout.write("Updating function code... ");
		await lambda.send(
			new UpdateFunctionCodeCommand({
				FunctionName: FUNCTION_NAME,
				...(s3Code || { ZipFile: zipBuffer }),
			}),
		);
		await waitUntilFunctionUpdatedV2(
			{ client: lambda, maxWaitTime: 60 },
			{ FunctionName: FUNCTION_NAME },
		);
		// Also update config (memory, timeout, env vars)
		await lambda.send(
			new UpdateFunctionConfigurationCommand({
				FunctionName: FUNCTION_NAME,
				...lambdaConfig,
			}),
		);
		await waitUntilFunctionUpdatedV2(
			{ client: lambda, maxWaitTime: 60 },
			{ FunctionName: FUNCTION_NAME },
		);
		console.log("done");
	} else {
		process.stdout.write("Creating function... ");
		await lambda.send(
			new CreateFunctionCommand({
				FunctionName: FUNCTION_NAME,
				Role: roleArn,
				Code: s3Code ? { S3Bucket: s3Code.S3Bucket, S3Key: s3Code.S3Key } : { ZipFile: zipBuffer },
				...lambdaConfig,
			}),
		);
		await waitUntilFunctionActiveV2(
			{ client: lambda, maxWaitTime: 60 },
			{ FunctionName: FUNCTION_NAME },
		);
		console.log("done");
	}

	// Cleanup
	rmSync(buildDir, { recursive: true, force: true });
	rmSync("concat-deploy.zip", { force: true });

	console.log(`\nDeployed: ${FUNCTION_NAME}`);
	console.log("Run: node deploy-concat.mjs  (to update)");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
