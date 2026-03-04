/**
 * Agent API route — streams SSE events from the AgentSession singleton.
 */

import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import { getOrCreateSingleton, getSessionId, getSessionStats, getUserFiles } from "./singleton";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseEvent(data: Record<string, unknown>): string {
	return `data: ${JSON.stringify(data)}\n\n`;
}

function trunc(s: unknown, n: number): string {
	const str = String(s ?? "");
	return str.length > n ? str.slice(0, n - 3) + "..." : str;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
	const { messages, images } = await req.json();
	const lastUserMessage = messages
		.filter((m: { role: string }) => m.role === "user")
		.pop();
	const promptText =
		lastUserMessage?.parts?.[0]?.text || lastUserMessage?.content || "";
	const promptPreview = promptText.length > 80 ? promptText.slice(0, 77) + "..." : promptText;
	console.log(`[route] prompt="${promptPreview}" images=${images?.length ?? 0}`);

	const sid = getSessionId(req);
	let ctx: ReturnType<typeof getOrCreateSingleton>;
	try {
		ctx = getOrCreateSingleton(sid);
	} catch (err) {
		return new Response(
			JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
			{ status: 500 },
		);
	}

	const { session, sessionManager } = ctx;

	// --- Stream SSE ---
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			const enqueue = (data: Record<string, unknown>) => {
				try {
					controller.enqueue(encoder.encode(sseEvent(data)));
				} catch {
					// Stream may be closed
				}
			};

			// Track tool call args for logging (toolcall_end has args, tool_execution_end does not)
			const toolArgs = new Map<string, Record<string, unknown>>();

			let unsubscribe: () => void;

			// Clean up subscription if client disconnects
			req.signal?.addEventListener("abort", () => {
				unsubscribe?.();
				try { controller.close(); } catch { /* already closed */ }
			});

			unsubscribe = session.subscribe((event: AgentSessionEvent) => {
				// Text streaming
				if (
					event.type === "message_update" &&
					event.assistantMessageEvent
				) {
					const inner = event.assistantMessageEvent;
					if (inner.type === "text_delta") {
						enqueue({ type: "text-delta", delta: inner.delta });
					} else if (inner.type === "text_end") {
						enqueue({ type: "text-end" });
					}
					// Thinking/reasoning
					else if (inner.type === "thinking_start") {
						enqueue({ type: "reasoning-start" });
					} else if (inner.type === "thinking_delta") {
						enqueue({ type: "reasoning-delta", delta: inner.delta });
					} else if (inner.type === "thinking_end") {
						enqueue({ type: "reasoning-end" });
					}
					// Tool call streaming — create card early when model starts generating
					else if (inner.type === "toolcall_start") {
						const partial = inner.partial;
						const tc = partial.content?.findLast(
							(c: { type: string }) => c.type === "toolCall",
						) as { id: string; name: string } | undefined;
						if (tc) {
							enqueue({
								type: "tool-call-started",
								toolCallId: tc.id,
								toolName: tc.name,
								input: {},
							});
						}
					}
					else if (inner.type === "toolcall_end") {
						const tc = inner.toolCall;
						toolArgs.set(tc.id, tc.arguments as Record<string, unknown>);
						enqueue({
							type: "tool-input-available",
							toolCallId: tc.id,
							toolName: tc.name,
							input: tc.arguments,
						});
					}
				}

				// Tool execution start — card with args before execution completes
				if (event.type === "tool_execution_start") {
					enqueue({
						type: "tool-call-started",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						input: event.args,
					});
				}

				// Tool execution results
				if (event.type === "tool_execution_end") {
					// Extract text content from pi's tool result format
					let output: unknown = event.result;
					let details: Record<string, unknown> | undefined;
					if (event.result?.content) {
						const textParts = event.result.content
							.filter((c: { type: string }) => c.type === "text")
							.map((c: { text: string }) => c.text);
						output = textParts.join("");
						if (event.result.details && typeof event.result.details === "object") {
							details = event.result.details as Record<string, unknown>;
						}
					}
					enqueue({
						type: "tool-output-available",
						toolCallId: event.toolCallId,
						output,
						...(details && { details }),
					});
					// Log tool execution
					const tn = event.toolName ?? "?";
					const args = toolArgs.get(event.toolCallId) ?? {};
					let detail = "";
					if (tn === "generate_image") detail = ` prompt="${trunc(args.prompt, 50)}"`;
					else if (tn === "write" || tn === "read" || tn === "edit") detail = ` path="${trunc(args.path ?? args.file_path, 60)}"`;
					else if (tn === "grep" || tn === "find") detail = ` pattern="${trunc(args.pattern, 40)}"`;
					console.log(`[route] tool:${tn}${detail}`);
				}

				// Compaction events
				if (event.type === "auto_compaction_start") {
					enqueue({ type: "compaction-start", reason: event.reason });
				}
				if (event.type === "auto_compaction_end") {
					enqueue({ type: "compaction-end", aborted: event.aborted });
				}

				// Agent finished
				if (event.type === "agent_end") {
					const usage = getSessionStats(sid);
					const { changes, mountPoint } = getUserFiles(sid);

					console.log(`[route] done tokens=${usage?.totalTokens ?? "?"} cost=$${usage?.cost?.toFixed(4) ?? "?"}`);
					enqueue({ type: "finish", reason: "stop", usage, changes, mountPoint });
					try {
						controller.enqueue(encoder.encode("data: [DONE]\n\n"));
						controller.close();
					} catch {
						// Already closed
					}
					unsubscribe();
				}
			});

			// Abort previous run if still streaming (e.g. client stopped mid-stream)
			const startPrompt = async () => {
				if (session.isStreaming) {
					await session.abort();
				}
				const promptOpts = images?.length ? { images } : undefined;
				return session.prompt(promptText, promptOpts);
			};

			// Fire the prompt (don't await — events stream via subscribe)
			startPrompt().catch((err) => {
				const msg = err instanceof Error ? err.message : String(err);
				console.log(`[route] error: ${msg}`);
				enqueue({
					type: "error",
					error: msg,
				});
				try {
					controller.close();
				} catch {
					// Already closed
				}
				unsubscribe();
			});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
