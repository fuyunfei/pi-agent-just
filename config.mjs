/** @type {import('@remotion/lambda').AwsRegion} */
export const REGION = process.env.REMOTION_AWS_REGION || "us-east-1";

export const SITE_NAME = "pi-agent-remotion";
export const COMP_NAME = "DynamicComp";
export const RAM = 3009;
export const DISK = 10240;
export const TIMEOUT = 240;
