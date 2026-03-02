"use client";

import { Film } from "lucide-react";

export function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
			<div className="flex size-12 items-center justify-center rounded-2xl bg-foreground/[0.03]">
				<Film className="size-5 text-muted-foreground/40" />
			</div>
			<div className="space-y-1">
				<p className="text-[13px] text-muted-foreground">
					Your video preview will appear here
				</p>
				<p className="text-xs text-muted-foreground/50">
					Describe what you want in the chat →
				</p>
			</div>
		</div>
	);
}
