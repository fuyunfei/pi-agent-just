/**
 * Sandbox API — overlay change inspection, apply, and reset.
 *
 * GET  /api/sandbox → list overlay changes
 * POST /api/sandbox → { action: "apply" | "reset" }
 */

import { getOrCreateSingleton } from "../agent/singleton";

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
		const { overlayFs } = getOrCreateSingleton();

		if (action === "apply") {
			const applied = await overlayFs.applyAllChanges();
			return Response.json({ ok: true, applied: applied.length });
		}

		if (action === "reset") {
			overlayFs.resetOverlay();
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
