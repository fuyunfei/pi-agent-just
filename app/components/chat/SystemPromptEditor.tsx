"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, Save, FileText } from "lucide-react";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";

function EditorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const [value, setValue] = useState("");
	const [saved, setSaved] = useState("");
	const [isCustom, setIsCustom] = useState(false);
	const [loading, setLoading] = useState(false);

	const dirty = value !== saved;

	// Fetch prompt on open
	useEffect(() => {
		if (!open) return;
		setLoading(true);
		fetch("/api/agent/command", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ command: "get-system-prompt" }),
		})
			.then((r) => r.json())
			.then((data) => {
				if (data.ok) {
					setValue(data.prompt);
					setSaved(data.prompt);
					setIsCustom(data.isCustom);
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [open]);

	const handleSave = useCallback(() => {
		fetch("/api/agent/command", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ command: "set-system-prompt", systemPrompt: value }),
		})
			.then((r) => r.json())
			.then((data) => {
				if (data.ok) {
					setSaved(value);
					setIsCustom(true);
				}
			})
			.catch(() => {});
	}, [value]);

	const handleReset = useCallback(() => {
		fetch("/api/agent/command", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ command: "reset-system-prompt" }),
		})
			.then((r) => r.json())
			.then((data) => {
				if (data.ok) {
					setValue(data.prompt);
					setSaved(data.prompt);
					setIsCustom(false);
				}
			})
			.catch(() => {});
	}, []);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="!max-w-none !w-[60vw] !h-[calc(100vh-2rem)] !inset-y-0 !left-4 !right-auto !m-auto !mr-auto !border-0 !rounded-xl !shadow-2xl !p-0 !gap-0 flex flex-col overflow-hidden"
				showCloseButton={false}
			>
				<div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
					<div className="flex items-center gap-2 text-sm font-medium">
						System Prompt
						{isCustom && (
							<span className="text-[11px] font-normal text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">custom</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						{dirty && <span className="text-[11px] text-muted-foreground">unsaved</span>}
						<Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleReset} disabled={loading}>
							<RotateCcw className="h-3 w-3" />
							Reset
						</Button>
						<Button size="sm" className="h-7 gap-1.5 text-xs" onClick={handleSave} disabled={!dirty || loading}>
							<Save className="h-3 w-3" />
							Save
						</Button>
					</div>
				</div>

				<textarea
					className="flex-1 w-full resize-none bg-transparent px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none"
					value={loading ? "Loading..." : value}
					onChange={(e) => setValue(e.target.value)}
					disabled={loading}
					spellCheck={false}
				/>
			</DialogContent>
		</Dialog>
	);
}

export function SystemPromptButton() {
	const [open, setOpen] = useState(false);

	return (
		<>
			<PromptInputButton tooltip="System prompt" onClick={() => setOpen(true)}>
				<FileText className="size-3.5" />
			</PromptInputButton>
			<EditorDialog open={open} onOpenChange={setOpen} />
		</>
	);
}
