/**
 * Sandbox API — list in-memory files, clear session.
 *
 * GET  /api/sandbox → list all files in the sandbox
 * POST /api/sandbox → { action: "clear" }  — reset sandbox to empty
 */

import { getOrCreateSingleton, resetSingleton } from "../agent/singleton";

// System paths created by Bash constructor — not user project files
const SYSTEM_PREFIXES = ["/bin/", "/usr/bin/", "/dev/", "/proc/", "/etc/", "/tmp/"];

export async function GET() {
	try {
		const { overlayFs } = getOrCreateSingleton();
		const mountPoint = overlayFs.getMountPoint();
		const changes = overlayFs
			.getOverlayChanges()
			.filter((c) => !SYSTEM_PREFIXES.some((p) => c.path.startsWith(p)));
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
		const { action } = await req.json();

		if (action === "clear") {
			resetSingleton();
			return Response.json({ ok: true });
		}

		return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
	} catch (err) {
		return Response.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}
