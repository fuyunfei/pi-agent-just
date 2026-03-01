"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
	const [password, setPassword] = useState("");
	const [error, setError] = useState(false);
	const [loading, setLoading] = useState(false);
	const router = useRouter();

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(false);

		const res = await fetch("/api/auth", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password }),
		});

		if (res.ok) {
			router.push("/");
		} else {
			setError(true);
			setLoading(false);
		}
	}

	return (
		<div className="flex items-center justify-center min-h-dvh bg-background">
			<form
				onSubmit={handleSubmit}
				className="flex flex-col gap-4 w-full max-w-xs"
			>
				<h1 className="text-lg font-medium text-center text-foreground">
					pi-agent-just
				</h1>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder="Password"
					autoFocus
					className="w-full px-3 py-2 rounded-md border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
				/>
				{error && (
					<p className="text-xs text-red-500 text-center">Wrong password</p>
				)}
				<button
					type="submit"
					disabled={loading || !password}
					className="px-3 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
				>
					{loading ? "..." : "Enter"}
				</button>
			</form>
		</div>
	);
}
