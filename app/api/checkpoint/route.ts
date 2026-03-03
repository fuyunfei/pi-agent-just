/**
 * Checkpoint API — list user-message checkpoints and rollback to earlier points.
 *
 * GET  /api/checkpoint → list checkpoints (entryId + text + index)
 * POST /api/checkpoint → { action: "rollback", entryId: string }
 */

import { getOrCreateSingleton, getSessionId } from "../agent/singleton";

export async function GET(req: Request) {
	try {
		const sid = getSessionId(req);
		const { session } = getOrCreateSingleton(sid);
		const entries = session.getUserMessagesForForking();
		const checkpoints = entries.map((e, i) => ({
			entryId: e.entryId,
			text: e.text,
			index: i,
		}));
		return Response.json({ checkpoints });
	} catch (err) {
		return Response.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}

export async function POST(req: Request) {
	try {
		const { action, entryId } = await req.json();
		if (action !== "rollback" || !entryId) {
			return Response.json(
				{ error: 'Expected { action: "rollback", entryId: string }' },
				{ status: 400 },
			);
		}

		const sid = getSessionId(req);
		const { session, overlayFs, fsCheckpoints } = getOrCreateSingleton(sid);

		// SDK handles conversation rollback (creates a branch in the session tree)
		await session.navigateTree(entryId);

		// Restore FS snapshot if available
		const snap = fsCheckpoints.get(entryId);
		if (snap) {
			overlayFs.restore(snap);
		} else {
			console.warn(`[checkpoint] No FS snapshot for entryId=${entryId}`);
		}

		return Response.json({
			ok: true,
			model: session.model ? { provider: session.model.provider, id: session.model.id } : null,
		});
	} catch (err) {
		return Response.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}
