"use client";

import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	Reasoning,
	ReasoningTrigger,
	ReasoningContent,
} from "@/components/ai-elements/reasoning";
import {
	Tool,
	ToolHeader,
	ToolContent,
	ToolOutput,
} from "@/components/ai-elements/tool";
import {
	PromptInput,
	PromptInputTextarea,
	PromptInputFooter,
	PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { useChatAgent } from "./useChatAgent";
import type { ChatMessage, ToolCall } from "./types";

function ToolCallCard({ tool }: { tool: ToolCall }) {
	const title =
		tool.toolName === "bash"
			? `$ ${String(tool.args.command || tool.args.cmd || "").split("\n")[0]}`
			: `[${tool.toolName}] ${tool.args.path || ""}`;

	const state =
		tool.state === "running"
			? "input-available"
			: tool.state === "error"
				? "output-error"
				: "output-available";

	return (
		<Tool>
			<ToolHeader title={title} type="tool-call" state={state as never} />
			<ToolContent>
				{tool.output && (
					<ToolOutput
						output={tool.output}
						errorText={tool.state === "error" ? tool.output : undefined}
					/>
				)}
			</ToolContent>
		</Tool>
	);
}

function AssistantMessage({ msg }: { msg: ChatMessage }) {
	return (
		<Message from="assistant">
			{msg.reasoning !== undefined && (
				<Reasoning
					isStreaming={msg.isReasoningStreaming}
					defaultOpen={msg.isReasoningStreaming}
				>
					<ReasoningTrigger />
					<ReasoningContent>{msg.reasoning}</ReasoningContent>
				</Reasoning>
			)}

			{msg.tools?.map((tool) => <ToolCallCard key={tool.id} tool={tool} />)}

			{msg.content && (
				<MessageContent>
					<MessageResponse>{msg.content}</MessageResponse>
				</MessageContent>
			)}
		</Message>
	);
}

export function ChatPanel() {
	const { messages, status, send, stop } = useChatAgent();

	const handleSubmit = ({ text }: { text: string }) => {
		if (!text.trim()) return;
		send(text.trim());
	};

	const chatStatus =
		status === "streaming" ? "streaming" : status === "error" ? "error" : "ready";

	return (
		<div className="flex flex-col h-full">
			<Conversation className="flex-1">
				<ConversationContent>
					{messages.length === 0 && (
						<div className="flex flex-col items-center justify-center h-full gap-4 text-center text-muted-foreground">
							<div className="space-y-1">
								<p className="text-lg font-medium text-foreground">
									What would you like to build?
								</p>
								<p className="text-sm">
									Describe your project and I&apos;ll create it for you.
								</p>
							</div>
							<div className="flex flex-wrap justify-center gap-2 max-w-md">
								{[
									"A landing page with hero and pricing",
									"A todo app with local storage",
									"A dashboard with charts",
									"An interactive form with validation",
								].map((prompt) => (
									<button
										key={prompt}
										type="button"
										onClick={() => send(prompt)}
										className="px-3 py-1.5 text-xs rounded-full border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
									>
										{prompt}
									</button>
								))}
							</div>
						</div>
					)}
					{messages.map((msg) =>
						msg.role === "user" ? (
							<Message key={msg.id} from="user">
								<MessageContent>{msg.content}</MessageContent>
							</Message>
						) : (
							<AssistantMessage key={msg.id} msg={msg} />
						),
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<div className="border-t p-4">
				<PromptInput
					onSubmit={handleSubmit}
					className="max-w-full"
				>
					<PromptInputTextarea
						placeholder="Describe what you want to build..."
						disabled={status === "streaming"}
					/>
					<PromptInputFooter>
						<div />
						<PromptInputSubmit
							status={chatStatus}
							onStop={stop}
						/>
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	);
}
