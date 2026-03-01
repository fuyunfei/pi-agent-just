"use client";

import dynamic from "next/dynamic";
import { TerminalData } from "../components/TerminalData";
import { ReasoningOverlay } from "../components/ReasoningOverlay";

const Terminal = dynamic(() => import("../components/Terminal"), { ssr: false });

export default function DevPage() {
	return (
		<>
			<TerminalData />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					height: "100dvh",
					overflow: "hidden",
					background: "var(--background)",
				}}
			>
				<div
					style={{
						padding: "8px 16px",
						borderBottom: "1px solid var(--border)",
						fontSize: "12px",
						color: "var(--muted-foreground)",
						fontFamily: "monospace",
					}}
				>
					Developer Terminal — debug &amp; testing only
				</div>
				<ReasoningOverlay />
				<div style={{ flex: 1, overflow: "hidden" }}>
					<Terminal />
				</div>
			</div>
		</>
	);
}
