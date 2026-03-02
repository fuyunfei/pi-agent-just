"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileUIPart } from "@/components/ai-elements/ai-types";
import type { ChatMessage, Checkpoint, MessagePart, ModelInfo, SessionUsage, ToolCall } from "./types";

type UIMessage = {
	id: string;
	role: "user" | "assistant";
	parts: Array<{ type: "text"; text: string }>;
};

let messageId = 0;
const nextId = () => `msg-${++messageId}`;

const STORAGE_KEY = "pi-agent-chat";

export function useChatAgent() {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<"ready" | "streaming" | "error">("ready");
	const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null);
	const [usage, setUsage] = useState<SessionUsage | null>(null);
	const historyRef = useRef<UIMessage[]>([]);
	const abortRef = useRef<AbortController | null>(null);

	// Clear server session on mount (fresh start)
	useEffect(() => {
		localStorage.removeItem(STORAGE_KEY);
		fetch("/api/sandbox", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "clear" }),
		}).then(() => {
			// Trigger file list refresh after clear completes
			window.dispatchEvent(new CustomEvent("studio:rollback"));
		}).catch(() => {});
	}, []);

	// Fetch current model on mount
	useEffect(() => {
		fetch("/api/model")
			.then((r) => r.json())
			.then((data) => {
				if (data.current) {
					setCurrentModel({
						provider: data.current.provider,
						id: data.current.id,
						label: data.current.name || data.current.id,
						desc: "",
					});
				}
			})
			.catch(() => {});
	}, []);

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

	// ---------------------------------------------------------------------------
	// Slash commands
	// ---------------------------------------------------------------------------

	const addSystemMessage = useCallback((content: string) => {
		setMessages((prev) => [...prev, { id: nextId(), role: "system" as const, content }]);
	}, []);

	const runCommand = useCallback(
		async (input: string): Promise<boolean> => {
			const match = input.match(/^\/(\w+)\s*(.*)?$/);
			if (!match) return false;
			const [, cmd] = match;

			if (cmd === "new") {
				setMessages([]);
				setUsage(null);
				localStorage.removeItem(STORAGE_KEY);
				historyRef.current = [];
				fetch("/api/sandbox", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "clear" }),
				}).catch(() => {});
				window.dispatchEvent(new CustomEvent("studio:rollback"));
				return true;
			}

			if (cmd === "compact") {
				addSystemMessage("Compacting context...");
				try {
					const res = await fetch("/api/agent/command", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ command: "compact" }),
					});
					const data = await res.json();
					if (data.ok) {
						const kb = (data.result.tokensBefore / 1000).toFixed(1);
						addSystemMessage(`Context compacted (was ${kb}k tokens). Summary preserved.`);
					} else {
						addSystemMessage(`Compaction failed: ${data.error}`);
					}
				} catch {
					addSystemMessage("Compaction failed: network error");
				}
				return true;
			}

			if (cmd === "session") {
				try {
					const res = await fetch("/api/agent/command", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ command: "session" }),
					});
					const data = await res.json();
					if (data.ok) {
						const s = data.stats;
						const lines = [
							`Model: ${s.model}`,
							`Messages: ${s.messages} (${s.userMessages} user, ${s.assistantMessages} assistant)`,
							`Tool calls: ${s.toolCalls}`,
							`Tokens: ${s.tokens.total.toLocaleString()} (in: ${s.tokens.input.toLocaleString()}, out: ${s.tokens.output.toLocaleString()}, cache read: ${s.tokens.cacheRead.toLocaleString()})`,
							`Cost: $${s.cost.toFixed(4)}`,
						];
						if (s.context) {
							const pct = s.context.percent != null ? `${Math.round(s.context.percent)}%` : "n/a";
							lines.push(`Context: ${pct} of ${(s.context.contextWindow / 1000).toFixed(0)}k window`);
						}
						addSystemMessage(lines.join("\n"));
					} else {
						addSystemMessage("No active session");
					}
				} catch {
					addSystemMessage("Failed to fetch session info");
				}
				return true;
			}

			// Unknown command
			addSystemMessage(`Unknown command: /${cmd}\nAvailable: /new, /compact, /session`);
			return true;
		},
		[addSystemMessage],
	);

	// ---------------------------------------------------------------------------
	// Send message
	// ---------------------------------------------------------------------------

	const send = useCallback(
		async (text: string, files?: FileUIPart[], displayText?: string) => {
			// Intercept slash commands
			if (text.startsWith("/") && !files?.length) {
				await runCommand(text);
				return;
			}

			const userMsg: ChatMessage = { id: nextId(), role: "user", content: displayText || text };
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

			// Convert image files to base64 ImageContent for API
			const images = files
				?.filter((f) => f.mediaType.startsWith("image/"))
				.map((f) => ({
					type: "image" as const,
					data: f.url.replace(/^data:[^;]+;base64,/, ""),
					mimeType: f.mediaType,
				}));

			// For non-image files, append content as text
			const textFiles = files?.filter((f) => !f.mediaType.startsWith("image/"));
			let fullPrompt = text;
			if (textFiles?.length) {
				const fileContents = textFiles.map((f) => {
					try {
						const base64 = f.url.replace(/^data:[^;]+;base64,/, "");
						return `--- ${f.filename} ---\n${atob(base64)}`;
					} catch {
						return `--- ${f.filename} ---\n(binary file)`;
					}
				});
				fullPrompt += "\n\n" + fileContents.join("\n\n");
			}

			// Update the history entry with the full prompt (including text file contents)
			if (fullPrompt !== text) {
				historyRef.current[historyRef.current.length - 1] = {
					id: userMsg.id,
					role: "user",
					parts: [{ type: "text", text: fullPrompt }],
				};
			}

			// Local mutable parts tracker (avoids closure staleness)
			const partsTracker: MessagePart[] = [];
			const toolNameById = new Map<string, string>();
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
					body: JSON.stringify({
						messages: historyRef.current,
						images: images?.length ? images : undefined,
					}),
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
							} else if (data.type === "tool-call-started" && data.toolCallId) {
								toolNameById.set(data.toolCallId, data.toolName || "tool");
								const args = (data.input || {}) as Record<string, unknown>;
								// Create card or update if already created by tool-input-available
								const existing = partsTracker.find(
									(p) => p.type === "tool" && p.tool.id === data.toolCallId,
								);
								if (existing) {
									updateTool(data.toolCallId, (t) => ({ ...t, args: { ...t.args, ...args } }));
								} else {
									addTool({
										id: data.toolCallId,
										toolName: data.toolName || "tool",
										args,
										state: "running",
									});
								}
							} else if (data.type === "tool-input-available" && data.toolCallId) {
								const args = (data.input || {}) as Record<string, unknown>;
								// Update existing card or create if tool-call-started hasn't arrived yet
								const existing = partsTracker.find(
									(p) => p.type === "tool" && p.tool.id === data.toolCallId,
								);
								if (existing) {
									updateTool(data.toolCallId, (t) => ({ ...t, args }));
								} else {
									toolNameById.set(data.toolCallId, data.toolName || "tool");
									addTool({
										id: data.toolCallId,
										toolName: data.toolName || "tool",
										args,
										state: "running",
									});
								}
							} else if (data.type === "tool-output-available" && data.toolCallId) {
								const result = typeof data.output === "string" ? data.output : JSON.stringify(data.output, null, 2);
								updateTool(data.toolCallId, (t) => ({ ...t, state: "completed", output: result }));
								// Refresh file list after file-changing tools complete
								const tn = toolNameById.get(data.toolCallId);
								if (tn === "write" || tn === "writeFile" || tn === "edit" || tn === "bash") {
									window.dispatchEvent(new CustomEvent("studio:file-written", { detail: { path: "" } }));
								}
							} else if (data.type === "tool-output-error" || data.type === "tool-input-error") {
								const errorMsg = data.error || "Tool error";
								updateTool(data.toolCallId, (t) => ({ ...t, state: "error", output: String(errorMsg) }));
							} else if (data.type === "error") {
								const errorMsg = data.error || data.message || "Unknown error";
								appendText(`\n\n**Error:** ${errorMsg}`);
							} else if (data.type === "finish") {
								if (data.entryId) {
									// Tag the user message with its entryId for checkpoint rollback
									setMessages((prev) => {
										const userIdx = prev.findLastIndex(
											(m) => m.role === "user" && m.id === userMsg.id,
										);
										if (userIdx === -1) return prev;
										const next = [...prev];
										next[userIdx] = { ...next[userIdx], entryId: data.entryId };
										return next;
									});
								}
								if (data.usage) {
									setUsage(data.usage as SessionUsage);
								}
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
				if (controller.signal.aborted) {
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
		[updateLastAssistant, runCommand],
	);

	const stop = useCallback(() => {
		abortRef.current?.abort();
	}, []);

	const clearChat = useCallback(() => {
		setMessages([]);
		setUsage(null);
		historyRef.current = [];
		localStorage.removeItem(STORAGE_KEY);
	}, []);

	const clear = useCallback(() => {
		clearChat();
		fetch("/api/sandbox", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "clear" }),
		}).then(() => {
			// Tell code-studio to refetch changes
			window.dispatchEvent(new CustomEvent("studio:rollback"));
		}).catch(() => {
			// Server reset failed — UI is already cleared, will resync on next poll
		});
	}, [clearChat]);

	const rollback = useCallback(async (entryId: string) => {
		try {
			const res = await fetch("/api/checkpoint", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "rollback", entryId }),
			});
			if (!res.ok) return;

			// Truncate messages — keep up to and including the rollback user message, drop everything after
			setMessages((prev) => {
				const idx = prev.findIndex(
					(m) => m.role === "user" && m.entryId === entryId,
				);
				if (idx === -1) return prev;
				return prev.slice(0, idx + 1);
			});

			// Truncate history ref to match (keep up to the matching user message)
			const histIdx = historyRef.current.findIndex(
				(m) => m.role === "user" && messages.find(
					(cm) => cm.id === m.id && cm.entryId === entryId,
				),
			);
			if (histIdx !== -1) {
				historyRef.current = historyRef.current.slice(0, histIdx + 1);
			}

			// Notify CodeStudio to refresh files
			window.dispatchEvent(new CustomEvent("studio:rollback"));
		} catch {
			// Rollback failed
		}
	}, [messages]);

	const switchModel = useCallback(async (provider: string, modelId: string) => {
		try {
			const res = await fetch("/api/model", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider, modelId }),
			});
			const data = await res.json();
			if (data.ok && data.model) {
				setCurrentModel({
					provider: data.model.provider,
					id: data.model.id,
					label: data.model.name || data.model.id,
					desc: "",
				});
			}
		} catch {
			// Model switch failed
		}
	}, []);

	return { messages, status, send, stop, clear, rollback, currentModel, switchModel, usage };
}
