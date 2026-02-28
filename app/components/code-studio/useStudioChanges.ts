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
		async (action: "download" | "clear") => {
			if (action === "download") {
				await downloadFiles();
				return;
			}
			// clear — reset server session
			setLoading(true);
			try {
				await fetch("/api/sandbox", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "clear" }),
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

/** Bundle all in-memory files into a zip and trigger download. */
async function downloadFiles() {
	const res = await fetch("/api/sandbox");
	const { changes, mountPoint } = await res.json();
	if (!changes || changes.length === 0) return;

	// Simple zip-like download: for single file, just download it.
	// For multiple files, create a tar-like concatenation or individual downloads.
	// Use a simple approach: create a zip in the browser.
	const files: { name: string; content: string }[] = changes
		.filter((c: OverlayChange) => c.type !== "deleted" && c.content)
		.map((c: OverlayChange) => {
			let name = c.path;
			if (mountPoint && name.startsWith(mountPoint)) {
				name = name.slice(mountPoint.length);
			}
			if (name.startsWith("/")) name = name.slice(1);
			return { name, content: c.content! };
		});

	if (files.length === 0) return;

	if (files.length === 1) {
		// Single file — direct download
		const file = files[0];
		const blob = new Blob([file.content], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = file.name;
		a.click();
		URL.revokeObjectURL(url);
		return;
	}

	// Multiple files — create a simple zip using the browser
	// Minimal ZIP implementation (store-only, no compression)
	const zip = createZip(files);
	const blob = new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "project.zip";
	a.click();
	URL.revokeObjectURL(url);
}

/** Minimal ZIP file creator (store method, no compression). */
function createZip(files: { name: string; content: string }[]): Uint8Array {
	const encoder = new TextEncoder();
	const entries: { header: Uint8Array; data: Uint8Array; name: Uint8Array; offset: number }[] = [];
	let offset = 0;

	for (const file of files) {
		const name = encoder.encode(file.name);
		const data = encoder.encode(file.content);
		const crc = crc32(data);

		// Local file header (30 bytes + name + data)
		const header = new Uint8Array(30 + name.length);
		const hv = new DataView(header.buffer);
		hv.setUint32(0, 0x04034b50, true);  // signature
		hv.setUint16(4, 20, true);           // version needed
		hv.setUint16(6, 0, true);            // flags
		hv.setUint16(8, 0, true);            // compression: store
		hv.setUint16(10, 0, true);           // mod time
		hv.setUint16(12, 0, true);           // mod date
		hv.setUint32(14, crc, true);         // crc-32
		hv.setUint32(18, data.length, true); // compressed size
		hv.setUint32(22, data.length, true); // uncompressed size
		hv.setUint16(26, name.length, true); // filename length
		hv.setUint16(28, 0, true);           // extra field length
		header.set(name, 30);

		entries.push({ header, data, name, offset });
		offset += header.length + data.length;
	}

	// Central directory
	const cdStart = offset;
	const cdParts: Uint8Array[] = [];
	for (const entry of entries) {
		const cd = new Uint8Array(46 + entry.name.length);
		const cv = new DataView(cd.buffer);
		cv.setUint32(0, 0x02014b50, true);  // signature
		cv.setUint16(4, 20, true);           // version made by
		cv.setUint16(6, 20, true);           // version needed
		cv.setUint16(8, 0, true);            // flags
		cv.setUint16(10, 0, true);           // compression
		cv.setUint16(12, 0, true);           // mod time
		cv.setUint16(14, 0, true);           // mod date
		// Copy CRC and sizes from local header
		const hv = new DataView(entry.header.buffer);
		cv.setUint32(16, hv.getUint32(14, true), true); // crc
		cv.setUint32(20, hv.getUint32(18, true), true); // compressed
		cv.setUint32(24, hv.getUint32(22, true), true); // uncompressed
		cv.setUint16(28, entry.name.length, true);
		cv.setUint16(30, 0, true);  // extra length
		cv.setUint16(32, 0, true);  // comment length
		cv.setUint16(34, 0, true);  // disk start
		cv.setUint16(36, 0, true);  // internal attrs
		cv.setUint32(38, 0, true);  // external attrs
		cv.setUint32(42, entry.offset, true); // local header offset
		cd.set(entry.name, 46);
		cdParts.push(cd);
	}

	const cdSize = cdParts.reduce((s, p) => s + p.length, 0);

	// End of central directory (22 bytes)
	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(4, 0, true);
	ev.setUint16(6, 0, true);
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(12, cdSize, true);
	ev.setUint32(16, cdStart, true);
	ev.setUint16(20, 0, true);

	// Concatenate all parts
	const totalSize = offset + cdSize + 22;
	const result = new Uint8Array(totalSize);
	let pos = 0;
	for (const entry of entries) {
		result.set(entry.header, pos); pos += entry.header.length;
		result.set(entry.data, pos); pos += entry.data.length;
	}
	for (const part of cdParts) {
		result.set(part, pos); pos += part.length;
	}
	result.set(eocd, pos);

	return result;
}

/** CRC-32 (used by ZIP format). */
function crc32(data: Uint8Array): number {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < data.length; i++) {
		crc ^= data[i];
		for (let j = 0; j < 8; j++) {
			crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
		}
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}
