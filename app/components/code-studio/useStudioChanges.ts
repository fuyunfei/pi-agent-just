"use client";

import { useCallback, useEffect, useState } from "react";
import type { OverlayChange } from "./types";

export function useStudioChanges() {
	const [changes, setChanges] = useState<OverlayChange[]>([]);
	const [mountPoint, setMountPoint] = useState("");
	const [loading, setLoading] = useState(false);

	const fetchChanges = useCallback(async () => {
		try {
			const res = await fetch("/api/sandbox");
			const data = await res.json();
			if (data.changes) setChanges(data.changes);
			if (data.mountPoint) setMountPoint(data.mountPoint);
		} catch {
			// ignore
		}
	}, []);

	useEffect(() => {
		fetchChanges();
		const id = setInterval(fetchChanges, 2000);
		return () => clearInterval(id);
	}, [fetchChanges]);

	const handleAction = useCallback(
		async (action: "apply" | "reset") => {
			setLoading(true);
			try {
				await fetch("/api/sandbox", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action }),
				});
				await fetchChanges();
			} catch {
				// ignore
			} finally {
				setLoading(false);
			}
		},
		[fetchChanges],
	);

	return { changes, mountPoint, loading, handleAction, refetch: fetchChanges };
}
