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
	role: "user" | "assistant" | "system";
	content: string;
	parts?: MessagePart[];
	reasoning?: string;
	isStreaming?: boolean;
	isReasoningStreaming?: boolean;
}

export interface ModelInfo {
	provider: string;
	id: string;
	label: string;
	desc: string;
}

export interface SessionUsage {
	totalTokens: number;
	cost: number;
	contextPercent: number | null;
}
