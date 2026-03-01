"use client";

import { useCallback, useEffect, useState } from "react";
import {
	Reasoning,
	ReasoningTrigger,
	ReasoningContent,
} from "@/components/ai-elements/reasoning";

export function ReasoningOverlay() {
	const [isStreaming, setIsStreaming] = useState(false);
	const [text, setText] = useState("");
	const [visible, setVisible] = useState(false);

	const handleReasoning = useCallback((e: Event) => {
		const { type, delta } = (e as CustomEvent).detail;
		if (type === "start") {
			setText("");
			setIsStreaming(true);
			setVisible(true);
		} else if (type === "delta") {
			setText((prev) => prev + delta);
		} else if (type === "end") {
			setIsStreaming(false);
		}
	}, []);

	useEffect(() => {
		window.addEventListener("agent:reasoning", handleReasoning);
		return () => window.removeEventListener("agent:reasoning", handleReasoning);
	}, [handleReasoning]);

	if (!visible) return null;

	return (
		<div className="px-4 py-2 border-b border-border bg-muted/50">
			<Reasoning
				isStreaming={isStreaming}
				onOpenChange={(open) => {
					if (!open && !isStreaming) {
						setVisible(false);
					}
				}}
			>
				<ReasoningTrigger />
				<ReasoningContent>{text}</ReasoningContent>
			</Reasoning>
		</div>
	);
}
