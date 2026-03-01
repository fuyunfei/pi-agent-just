/**
 * Agent API route — streams SSE events from the AgentSession singleton.
 */

import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import { getOrCreateSingleton } from "./singleton";

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEvent(data: Record<string, unknown>): string {
	return `data: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
	const { messages } = await req.json();
	const lastUserMessage = messages
		.filter((m: { role: string }) => m.role === "user")
		.pop();
	const promptText =
		lastUserMessage?.parts?.[0]?.text || lastUserMessage?.content || "";
	console.log("Prompt:", promptText);

	let ctx: ReturnType<typeof getOrCreateSingleton>;
	try {
		ctx = getOrCreateSingleton();
	} catch (err) {
		return new Response(
			JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
			{ status: 500 },
		);
	}

	const { session } = ctx;

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

			const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
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
					// Tool call streaming
					else if (inner.type === "toolcall_start") {
						// Card appears immediately with spinner
						const item = (inner.partial as any).content?.[inner.contentIndex];
						if (item?.id && item?.name) {
							enqueue({
								type: "tool-call-started",
								toolCallId: item.id,
								toolName: item.name,
							});
						}
					} else if (inner.type === "toolcall_end") {
						const tc = inner.toolCall;
						enqueue({
							type: "tool-input-available",
							toolCallId: tc.id,
							toolName: tc.name,
							input: tc.arguments,
						});
					}
				}

				// Tool execution results
				if (event.type === "tool_execution_end") {
					// Extract text content from pi's tool result format
					let output: unknown = event.result;
					if (event.result?.content) {
						const textParts = event.result.content
							.filter((c: { type: string }) => c.type === "text")
							.map((c: { text: string }) => c.text);
						output = textParts.join("");
					}
					enqueue({
						type: "tool-output-available",
						toolCallId: event.toolCallId,
						output,
					});
				}

				// Agent finished
				if (event.type === "agent_end") {
					enqueue({ type: "finish", reason: "stop" });
					try {
						controller.enqueue(encoder.encode("data: [DONE]\n\n"));
						controller.close();
					} catch {
						// Already closed
					}
					unsubscribe();
				}
			});

			// Fire the prompt (don't await — events stream via subscribe)
			session.prompt(promptText).catch((err) => {
				enqueue({
					type: "error",
					error: err instanceof Error ? err.message : String(err),
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
