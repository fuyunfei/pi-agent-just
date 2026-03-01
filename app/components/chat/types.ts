export interface ToolCall {
	id: string;
	toolName: string;
	args: Record<string, unknown>;
	state: "running" | "completed" | "error";
	output?: string;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	reasoning?: string;
	tools?: ToolCall[];
	isStreaming?: boolean;
	isReasoningStreaming?: boolean;
}
