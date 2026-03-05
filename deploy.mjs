/**
 * Deploy Remotion Lambda function + site bundle to AWS.
 *
 * Usage: node deploy.mjs
 *
 * Required env vars:
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 */

import { deployFunction, deploySite, getOrCreateBucket } from "@remotion/lambda";
import path from "path";
import { DISK, RAM, REGION, SITE_NAME, TIMEOUT } from "./config.mjs";

console.log("Region:", REGION);

if (!process.env.AWS_ACCESS_KEY_ID) {
	console.error("Missing AWS_ACCESS_KEY_ID");
	console.error("See: https://www.remotion.dev/docs/lambda/setup");
	process.exit(1);
}
if (!process.env.AWS_SECRET_ACCESS_KEY) {
	console.error("Missing AWS_SECRET_ACCESS_KEY");
	process.exit(1);
}

process.stdout.write("Deploying Lambda function... ");
const { functionName, alreadyExisted: fnExisted } = await deployFunction({
	createCloudWatchLogGroup: true,
	memorySizeInMb: RAM,
	region: REGION,
	timeoutInSeconds: TIMEOUT,
	diskSizeInMb: DISK,
});
console.log(functionName, fnExisted ? "(already existed)" : "(created)");

process.stdout.write("Ensuring bucket... ");
const { bucketName, alreadyExisted: bucketExisted } = await getOrCreateBucket({ region: REGION });
console.log(bucketName, bucketExisted ? "(already existed)" : "(created)");

process.stdout.write("Deploying site... ");
const { siteName } = await deploySite({
	bucketName,
	entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
	siteName: SITE_NAME,
	region: REGION,
});
console.log(siteName);

console.log("\nLambda deployment complete!");
console.log("Re-run this when you change the Remotion bundle or upgrade Remotion.");
