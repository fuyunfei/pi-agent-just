"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
	PromptInput,
	PromptInputTextarea,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputButton,
} from "@/components/ai-elements/prompt-input";
import {
	Attachments,
	Attachment,
	AttachmentPreview,
	AttachmentRemove,
} from "@/components/ai-elements/attachments";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";
import {
	ModelSelector,
	ModelSelectorTrigger,
	ModelSelectorContent,
	ModelSelectorInput,
	ModelSelectorList,
	ModelSelectorEmpty,
	ModelSelectorItem,
	ModelSelectorLogo,
	ModelSelectorName,
} from "@/components/ai-elements/model-selector";
import { cn } from "@/lib/utils";
import {
	CheckCircle2Icon,
	ChevronDownIcon,
	ChevronRightIcon,
	FileEditIcon,
	FileIcon,
	HistoryIcon,
	Loader2Icon,
	PaperclipIcon,
	SparklesIcon,
	TerminalIcon,
	XCircleIcon,
} from "lucide-react";
import { useChatAgent } from "./useChatAgent";
import type { ChatMessage, ModelInfo, ToolCall } from "./types";
import type { FileUIPart } from "@/components/ai-elements/ai-types";

/* ------------------------------------------------------------------ */
/*  Available models                                                    */
/* ------------------------------------------------------------------ */

const AVAILABLE_MODELS: ModelInfo[] = [
	{ provider: "anthropic", id: "claude-haiku-4.5", label: "Haiku 4.5", desc: "Fast & cheap" },
	{ provider: "anthropic", id: "claude-sonnet-4", label: "Sonnet 4", desc: "Balanced" },
	{ provider: "anthropic", id: "claude-opus-4", label: "Opus 4", desc: "Most capable" },
	{ provider: "openai", id: "gpt-4.1-mini", label: "GPT-4.1 Mini", desc: "Fast" },
	{ provider: "openai", id: "gpt-4.1", label: "GPT-4.1", desc: "Capable" },
	{ provider: "google", id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Google" },
	{ provider: "deepseek", id: "deepseek-chat", label: "DeepSeek V3", desc: "Cost effective" },
];

/* ------------------------------------------------------------------ */
/*  Tool call — compact inline card (V0-style)                        */
/* ------------------------------------------------------------------ */

function toolDisplayInfo(tool: ToolCall) {
	const name = tool.toolName;
	const args = tool.args;

	if (name === "bash" || name === "shell" || name === "execute") {
		const cmd = String(args.command || args.cmd || "").split("\n")[0];
		return {
			icon: <TerminalIcon className="size-3.5" />,
			label: cmd.length > 60 ? `${cmd.slice(0, 57)}...` : cmd,
		};
	}

	if (name === "write" || name === "writeFile" || name === "createFile") {
		const path = String(args.path || args.file_path || "");
		const short = path.split("/").pop() || path;
		return {
			icon: <FileEditIcon className="size-3.5" />,
			label: short,
		};
	}

	if (name === "edit" || name === "editFile") {
		const path = String(args.path || args.file_path || "");
		const short = path.split("/").pop() || path;
		return {
			icon: <FileEditIcon className="size-3.5" />,
			label: `edit ${short}`,
		};
	}

	if (name === "read" || name === "readFile") {
		const path = String(args.path || args.file_path || "");
		const short = path.split("/").pop() || path;
		return {
			icon: <FileIcon className="size-3.5" />,
			label: short,
		};
	}

	// Generic
	const argSummary = args.path || args.file_path || args.command || "";
	const label = argSummary
		? `${name} ${String(argSummary).split("/").pop()}`
		: name;
	return {
		icon: <TerminalIcon className="size-3.5" />,
		label: label.length > 60 ? `${label.slice(0, 57)}...` : label,
	};
}

const ToolCallCard = memo(function ToolCallCard({ tool }: { tool: ToolCall }) {
	const [expanded, setExpanded] = useState(false);
	const { icon, label } = useMemo(() => toolDisplayInfo(tool), [tool]);

	const stateIcon =
		tool.state === "running" ? (
			<Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
		) : tool.state === "error" ? (
			<XCircleIcon className="size-3.5 text-red-500" />
		) : (
			<CheckCircle2Icon className="size-3.5 text-emerald-500" />
		);

	const hasOutput = !!tool.output;

	return (
		<div className="my-1">
			<button
				type="button"
				onClick={() => hasOutput && setExpanded((v) => !v)}
				disabled={!hasOutput}
				className={cn(
					"flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
					"bg-muted/40 hover:bg-muted/70",
					!hasOutput && "cursor-default",
				)}
			>
				{stateIcon}
				<span className="text-muted-foreground">{icon}</span>
				<span className="min-w-0 flex-1 truncate font-mono text-foreground/80">
					{label}
				</span>
				{hasOutput && (
					<ChevronRightIcon
						className={cn(
							"size-3.5 text-muted-foreground transition-transform",
							expanded && "rotate-90",
						)}
					/>
				)}
			</button>
			{expanded && tool.output && (
				<div
					className={cn(
						"mt-1 max-h-48 overflow-auto rounded-lg border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground",
						tool.state === "error" && "border-red-500/20 text-red-400",
					)}
				>
					<pre className="whitespace-pre-wrap break-all">{tool.output}</pre>
				</div>
			)}
		</div>
	);
});

/* ------------------------------------------------------------------ */
/*  Checkpoint indicator between user messages                         */
/* ------------------------------------------------------------------ */

const CheckpointIndicator = memo(function CheckpointIndicator({
	index,
	onRollback,
}: {
	index: number;
	onRollback: () => void;
}) {
	const [confirming, setConfirming] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleClick = useCallback(() => {
		if (confirming) {
			if (timerRef.current) clearTimeout(timerRef.current);
			setConfirming(false);
			onRollback();
		} else {
			setConfirming(true);
			timerRef.current = setTimeout(() => setConfirming(false), 3000);
		}
	}, [confirming, onRollback]);

	useEffect(() => () => {
		if (timerRef.current) clearTimeout(timerRef.current);
	}, []);

	return (
		<div className="group flex items-center gap-2 px-10 py-0.5">
			<div className="h-px flex-1 bg-border/40" />
			<button
				type="button"
				onClick={handleClick}
				className={cn(
					"flex items-center gap-1 rounded-full px-2 py-0.5",
					"text-[10px] transition-all",
					confirming
						? "bg-destructive/10 text-destructive opacity-100"
						: "text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground opacity-0 group-hover:opacity-100",
				)}
			>
				<HistoryIcon className="size-2.5" />
				<span>{confirming ? "Revert?" : `v${index + 1}`}</span>
			</button>
			<div className="h-px flex-1 bg-border/40" />
		</div>
	);
});

/* ------------------------------------------------------------------ */
/*  Assistant message                                                  */
/* ------------------------------------------------------------------ */

const AssistantMessage = memo(function AssistantMessage({
	msg,
}: { msg: ChatMessage }) {
	const isStreamingEmpty =
		msg.isStreaming && !msg.parts?.length && !msg.content;

	return (
		<div className="flex gap-3">
			{/* Avatar */}
			<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/5 mt-0.5">
				<SparklesIcon className="size-3.5 text-foreground/60" />
			</div>

			<div className="min-w-0 flex-1 space-y-1">
				{/* Reasoning */}
				{msg.reasoning !== undefined && (
					<Reasoning
						isStreaming={msg.isReasoningStreaming}
						defaultOpen={msg.isReasoningStreaming}
					>
						<ReasoningTrigger />
						<ReasoningContent>{msg.reasoning}</ReasoningContent>
					</Reasoning>
				)}

				{/* Streaming placeholder — dots */}
				{isStreamingEmpty && (
					<div className="flex items-center gap-1 py-2">
						<span className="size-1.5 animate-pulse rounded-full bg-foreground/30 [animation-delay:0ms]" />
						<span className="size-1.5 animate-pulse rounded-full bg-foreground/30 [animation-delay:200ms]" />
						<span className="size-1.5 animate-pulse rounded-full bg-foreground/30 [animation-delay:400ms]" />
					</div>
				)}

				{/* Parts — interleaved text + tools */}
				{msg.parts?.map((part, i) =>
					part.type === "tool" ? (
						<ToolCallCard key={part.tool.id} tool={part.tool} />
					) : part.text ? (
						<Message key={`text-${i}`} from="assistant">
							<MessageContent>
								<MessageResponse>{part.text}</MessageResponse>
							</MessageContent>
						</Message>
					) : null,
				)}

				{/* Fallback for messages without parts */}
				{!msg.parts?.length && msg.content && (
					<Message from="assistant">
						<MessageContent>
							<MessageResponse>{msg.content}</MessageResponse>
						</MessageContent>
					</Message>
				)}
			</div>
		</div>
	);
});

/* ------------------------------------------------------------------ */
/*  Suggested prompts                                                  */
/* ------------------------------------------------------------------ */

const SUGGESTIONS = [
	"A landing page with hero and pricing",
	"A todo app with local storage",
	"A dashboard with charts",
	"An interactive form with validation",
];

/* ------------------------------------------------------------------ */
/*  Usage formatting helpers                                            */
/* ------------------------------------------------------------------ */

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

function formatCost(n: number): string {
	if (n < 0.005) return "<$0.01";
	return `$${n.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Attachment previews in input area                                   */
/* ------------------------------------------------------------------ */

function AttachmentPreviews() {
	const attachments = usePromptInputAttachments();
	if (!attachments.files.length) return null;

	return (
		<div className="px-3 pt-2">
			<Attachments variant="inline">
				{attachments.files.map((file) => (
					<Attachment
						key={file.id}
						data={file}
						onRemove={() => attachments.remove(file.id)}
					>
						<AttachmentPreview />
						<AttachmentRemove />
					</Attachment>
				))}
			</Attachments>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  ChatPanel                                                          */
/* ------------------------------------------------------------------ */

export function ChatPanel() {
	const { messages, status, send, stop, rollback, currentModel, switchModel, usage } = useChatAgent();
	const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

	const handleSubmit = useCallback(
		({ text, files }: { text: string; files?: FileUIPart[] }) => {
			if (!text.trim()) return;
			send(text.trim(), files?.length ? files : undefined);
		},
		[send],
	);

	const chatStatus =
		status === "streaming"
			? "streaming"
			: status === "error"
				? "error"
				: "ready";

	// Build checkpoint index: track which user messages have entryIds
	const checkpointUserIndices = useMemo(() => {
		const indices: Array<{ msgIndex: number; entryId: string; cpIndex: number }> = [];
		let cpIdx = 0;
		for (let i = 0; i < messages.length; i++) {
			const m = messages[i];
			if (m.role === "user" && m.entryId) {
				indices.push({ msgIndex: i, entryId: m.entryId, cpIndex: cpIdx });
				cpIdx++;
			}
		}
		return indices;
	}, [messages]);

	return (
		<div className="flex flex-col h-full bg-background">
			<Conversation className="flex-1">
				<ConversationContent className="gap-6 px-4 py-6">
					{/* Empty state */}
					{messages.length === 0 && (
						<div className="flex flex-col items-center justify-center h-full gap-5 text-center">
							<div className="flex size-10 items-center justify-center rounded-full bg-foreground/5">
								<SparklesIcon className="size-5 text-foreground/50" />
							</div>
							<div className="space-y-1.5">
								<p className="text-base font-medium text-foreground">
									What would you like to build?
								</p>
								<p className="text-sm text-muted-foreground">
									Describe your project and I&apos;ll create it for you.
								</p>
							</div>
							<div className="flex flex-wrap justify-center gap-2 max-w-sm">
								{SUGGESTIONS.map((prompt) => (
									<button
										key={prompt}
										type="button"
										onClick={() => send(prompt)}
										className="px-3 py-1.5 text-xs rounded-full border border-border/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
									>
										{prompt}
									</button>
								))}
							</div>
						</div>
					)}

					{/* Messages with checkpoint indicators */}
					{messages.map((msg, i) => {
						// Check if a checkpoint indicator should appear before this message
						const cp = checkpointUserIndices.find((c) => c.msgIndex === i);
						const showCheckpoint = msg.role === "user" && cp && i > 0;

						return (
							<div key={msg.id}>
								{showCheckpoint && (
									<CheckpointIndicator
										index={cp.cpIndex}
										onRollback={() => rollback(cp.entryId)}
									/>
								)}
								{msg.role === "user" ? (
									<Message from="user">
										<MessageContent>{msg.content}</MessageContent>
									</Message>
								) : (
									<AssistantMessage msg={msg} />
								)}
							</div>
						);
					})}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			{/* Input area */}
			<div className="border-t border-border/50 p-3">
				<PromptInput
					onSubmit={handleSubmit}
					className="max-w-full"
					accept="image/*,.txt,.md,.json,.html,.css,.js,.ts,.tsx,.jsx,.py,.sh,.yaml,.yml,.toml,.xml,.csv"
				>
					<AttachmentPreviews />
					<PromptInputTextarea
						placeholder="Describe what you want to build..."
						disabled={status === "streaming"}
					/>
					<PromptInputFooter>
						<div className="flex items-center gap-1">
							{/* Attachment button */}
							<PromptInputButton
								tooltip="Attach files"
								onClick={() => {
									// The PromptInput manages its own file input ref
									const input = document.querySelector<HTMLInputElement>(
										'input[type="file"][aria-label="Upload files"]',
									);
									input?.click();
								}}
							>
								<PaperclipIcon className="size-3.5" />
							</PromptInputButton>

							{/* Model selector */}
							<ModelSelector open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
								<ModelSelectorTrigger asChild>
									<button
										type="button"
										className={cn(
											"flex items-center gap-1.5 rounded-md px-2 py-1",
											"text-[11px] text-muted-foreground transition-colors",
											"hover:bg-muted hover:text-foreground",
										)}
									>
										{currentModel && (
											<ModelSelectorLogo
												provider={currentModel.provider as "anthropic"}
												className="size-3"
											/>
										)}
										<span>{currentModel?.label || "Model"}</span>
										<ChevronDownIcon className="size-3 opacity-50" />
									</button>
								</ModelSelectorTrigger>
								<ModelSelectorContent title="Select Model">
									<ModelSelectorInput placeholder="Search models..." />
									<ModelSelectorList>
										<ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
										{AVAILABLE_MODELS.map((m) => (
											<ModelSelectorItem
												key={`${m.provider}/${m.id}`}
												value={`${m.provider}/${m.id}`}
												onSelect={() => {
													switchModel(m.provider, m.id);
													setModelSelectorOpen(false);
												}}
												className="flex items-center gap-2 py-2"
											>
												<ModelSelectorLogo provider={m.provider as "anthropic"} />
												<ModelSelectorName>{m.label}</ModelSelectorName>
												<span className="text-xs text-muted-foreground">{m.desc}</span>
											</ModelSelectorItem>
										))}
									</ModelSelectorList>
								</ModelSelectorContent>
							</ModelSelector>
						</div>
						{usage && (
							<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
								<span>{formatTokens(usage.totalTokens)} tokens</span>
								<span className="opacity-40">·</span>
								<span>{formatCost(usage.cost)}</span>
								{usage.contextPercent != null && (
									<>
										<span className="opacity-40">·</span>
										<span
											className={cn(
												usage.contextPercent > 85
													? "text-red-500"
													: usage.contextPercent > 60
														? "text-yellow-500"
														: undefined,
											)}
										>
											ctx {Math.round(usage.contextPercent)}%
										</span>
									</>
								)}
							</div>
						)}
						<PromptInputSubmit status={chatStatus} onStop={stop} />
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	);
}
