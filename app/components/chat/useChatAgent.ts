"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessage, MessagePart, ToolCall } from "./types";

type UIMessage = {
	id: string;
	role: "user" | "assistant";
	parts: Array<{ type: "text"; text: string }>;
};

let messageId = 0;
const nextId = () => `msg-${++messageId}`;

export function useChatAgent() {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<"ready" | "streaming" | "error">("ready");
	const historyRef = useRef<UIMessage[]>([]);
	const abortRef = useRef<AbortController | null>(null);

	const updateLastAssistant = useCallback(
		(updater: (msg: ChatMessage) => ChatMessage) => {
			setMessages((prev) => {
				const idx = prev.findLastIndex((m) => m.role === "assistant");
				if (idx === -1) return prev;
				const next = [...prev];
				next[idx] = updater(next[idx]);
				return next;
			});
		},
		[],
	);

	const send = useCallback(
		async (text: string) => {
			const userMsg: ChatMessage = { id: nextId(), role: "user", content: text };
			const assistantMsg: ChatMessage = {
				id: nextId(),
				role: "assistant",
				content: "",
				parts: [],
				isStreaming: true,
			};

			setMessages((prev) => [...prev, userMsg, assistantMsg]);
			setStatus("streaming");

			// Track for API
			historyRef.current.push({
				id: userMsg.id,
				role: "user",
				parts: [{ type: "text", text }],
			});

			const controller = new AbortController();
			abortRef.current = controller;

			// Local mutable parts tracker (avoids closure staleness)
			const partsTracker: MessagePart[] = [];
			let fullText = "";

			/** Append text delta — merge into last text part or create new one */
			const appendText = (delta: string) => {
				fullText += delta;
				const last = partsTracker[partsTracker.length - 1];
				if (last && last.type === "text") {
					last.text += delta;
				} else {
					partsTracker.push({ type: "text", text: delta });
				}
				const snapshot = partsTracker.map((p) =>
					p.type === "text" ? { ...p } : { type: "tool" as const, tool: { ...p.tool } },
				);
				updateLastAssistant((m) => ({ ...m, content: fullText, parts: snapshot }));
			};

			/** Add a tool part */
			const addTool = (tool: ToolCall) => {
				partsTracker.push({ type: "tool", tool });
				const snapshot = partsTracker.map((p) =>
					p.type === "text" ? { ...p } : { type: "tool" as const, tool: { ...p.tool } },
				);
				updateLastAssistant((m) => ({ ...m, parts: snapshot }));
			};

			/** Update a tool part in place */
			const updateTool = (toolCallId: string, updater: (t: ToolCall) => ToolCall) => {
				for (const part of partsTracker) {
					if (part.type === "tool" && part.tool.id === toolCallId) {
						part.tool = updater(part.tool);
						break;
					}
				}
				const snapshot = partsTracker.map((p) =>
					p.type === "text" ? { ...p } : { type: "tool" as const, tool: { ...p.tool } },
				);
				updateLastAssistant((m) => ({ ...m, parts: snapshot }));
			};

			try {
				const response = await fetch("/api/agent", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ messages: historyRef.current }),
					signal: controller.signal,
				});

				if (!response.ok) {
					historyRef.current.pop();
					updateLastAssistant((m) => ({
						...m,
						content: `Error: ${response.status}`,
						isStreaming: false,
					}));
					setStatus("error");
					return;
				}

				const reader = response.body?.getReader();
				if (!reader) {
					historyRef.current.pop();
					setStatus("error");
					return;
				}

				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() || "";

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed || !trimmed.startsWith("data:")) continue;
						const jsonStr = trimmed.slice(5).trim();
						if (jsonStr === "[DONE]") continue;

						try {
							const data = JSON.parse(jsonStr);

							if (data.type === "text-delta" && data.delta) {
								appendText(data.delta);
							} else if (data.type === "text-end") {
								// flush
							} else if (data.type === "reasoning-start") {
								updateLastAssistant((m) => ({
									...m,
									reasoning: "",
									isReasoningStreaming: true,
								}));
							} else if (data.type === "reasoning-delta" && data.delta) {
								updateLastAssistant((m) => ({
									...m,
									reasoning: (m.reasoning || "") + data.delta,
								}));
							} else if (data.type === "reasoning-end") {
								updateLastAssistant((m) => ({
									...m,
									isReasoningStreaming: false,
								}));
							} else if (data.type === "tool-input-available" && data.toolCallId) {
								const args = (data.input || {}) as Record<string, unknown>;
								const tool: ToolCall = {
									id: data.toolCallId,
									toolName: data.toolName,
									args,
									state: "running",
								};

								// Notify CodeStudio about file writes
								if (
									(data.toolName === "write" || data.toolName === "writeFile" || data.toolName === "edit") &&
									args.path
								) {
									window.dispatchEvent(
										new CustomEvent("studio:file-written", {
											detail: { path: String(args.path) },
										}),
									);
								}

								addTool(tool);
							} else if (data.type === "tool-output-available" && data.toolCallId) {
								const result = typeof data.output === "string" ? data.output : JSON.stringify(data.output, null, 2);
								updateTool(data.toolCallId, (t) => ({ ...t, state: "completed", output: result }));
							} else if (data.type === "tool-output-error" || data.type === "tool-input-error") {
								const errorMsg = data.error || "Tool error";
								updateTool(data.toolCallId, (t) => ({ ...t, state: "error", output: String(errorMsg) }));
							} else if (data.type === "error") {
								const errorMsg = data.error || data.message || "Unknown error";
								appendText(`\n\n**Error:** ${errorMsg}`);
							}
						} catch {
							// skip parse errors
						}
					}
				}

				// Finalize
				updateLastAssistant((m) => ({ ...m, isStreaming: false }));
				setStatus("ready");

				// Add assistant to history
				if (fullText) {
					historyRef.current.push({
						id: assistantMsg.id,
						role: "assistant",
						parts: [{ type: "text", text: fullText }],
					});
				}
			} catch (err) {
				if ((err as Error).name === "AbortError") {
					updateLastAssistant((m) => ({ ...m, isStreaming: false }));
					setStatus("ready");
					return;
				}
				historyRef.current.pop();
				updateLastAssistant((m) => ({
					...m,
					content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
					isStreaming: false,
				}));
				setStatus("error");
			} finally {
				abortRef.current = null;
			}
		},
		[updateLastAssistant],
	);

	const stop = useCallback(() => {
		abortRef.current?.abort();
	}, []);

	const clear = useCallback(() => {
		setMessages([]);
		historyRef.current = [];
		fetch("/api/sandbox", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "clear" }),
		}).catch(() => {
			// Server reset failed — UI is already cleared, will resync on next poll
		});
	}, []);

	return { messages, status, send, stop, clear };
}
