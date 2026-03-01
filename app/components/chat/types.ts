export interface ToolCall {
	id: string;
	toolName: string;
	args: Record<string, unknown>;
	state: "running" | "completed" | "error";
	output?: string;
}

export type MessagePart =
	| { type: "text"; text: string }
	| { type: "tool"; tool: ToolCall };

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	parts?: MessagePart[];
	reasoning?: string;
	isStreaming?: boolean;
	isReasoningStreaming?: boolean;
}
