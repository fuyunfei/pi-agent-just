/**
 * Local type definitions to avoid depending on the `ai` package.
 * Only the types actually used by our components are defined here.
 */

export type ChatStatus = "submitted" | "streaming" | "ready" | "error";

export interface UIMessage {
	role: "user" | "assistant" | "system" | "data" | "tool";
	content: string;
}

export interface FileUIPart {
	type: "file";
	filename: string;
	mediaType: string;
	url: string;
}

export interface SourceDocumentUIPart {
	type: "source-document";
	title?: string;
	url?: string;
}

export interface ToolUIPart {
	type: string;
	state:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error"
		| "output-denied"
		| "approval-requested"
		| "approval-responded";
	input: unknown;
	output?: unknown;
	errorText?: string;
}

export interface DynamicToolUIPart extends ToolUIPart {
	type: "dynamic-tool";
	toolName: string;
}
