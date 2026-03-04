"use client";

export function EmptyState() {
	return (
		<div
			className="flex flex-col items-center justify-center h-full px-8 text-center"
			style={{ background: "#FAFAF8" }}
		>
			<div className="flex flex-col items-center gap-6">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src="/logo-horizontal-clay.svg" alt="PageOn" style={{ height: 96 }} />

				<p style={{ fontFamily: "'Noto Serif', serif", color: "#9B8E7E", fontSize: 14, fontStyle: "italic", letterSpacing: "0.02em" }}>
					Render what you envision
				</p>
			</div>
		</div>
	);
}
