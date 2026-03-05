/**
 * Sandbox API — list user project files, clear session, delete file.
 *
 * GET  /api/sandbox → list files under mountPoint
 * POST /api/sandbox → { action: "clear" | "delete" }
 */

import { getOrCreateSingleton, getSessionId, clearSingleton, getUserFiles } from "../agent/singleton";

export async function GET(req: Request) {
	try {
		const sid = getSessionId(req);
		// Ensure session exists (creates if needed), then read user files
		await getOrCreateSingleton(sid);
		const { changes, mountPoint } = getUserFiles(sid);
		console.log(`[sandbox] GET sid=${sid.slice(0, 8)} → ${changes.length} files`);
		return Response.json({ changes, mountPoint });
	} catch (err) {
		return Response.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}

export async function POST(req: Request) {
	try {
		const sid = getSessionId(req);
		const body = await req.json();
		const { action } = body;

		if (action === "clear") {
			await clearSingleton(sid);
			const { changes, mountPoint } = getUserFiles(sid);
			return Response.json({ ok: true, changes, mountPoint });
		}

		if (action === "delete") {
			const { path } = body;
			if (!path || typeof path !== "string") {
				return Response.json({ error: "Missing path" }, { status: 400 });
			}
			const { overlayFs } = await getOrCreateSingleton(sid);
			await overlayFs.rm(path);
			console.log(`[sandbox] delete ${path}`);
			const { changes, mountPoint } = getUserFiles(sid);
			return Response.json({ ok: true, changes, mountPoint });
		}

		return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
	} catch (err) {
		return Response.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}
