import { compactSession, getFullSessionStats, getSessionId } from "../singleton";

export async function POST(req: Request) {
	const sid = getSessionId(req);
	const { command } = await req.json();

	if (command === "session") {
		const stats = getFullSessionStats(sid);
		if (!stats) {
			return Response.json({ ok: false, error: "No active session" });
		}
		return Response.json({ ok: true, command: "session", stats });
	}

	if (command === "compact") {
		try {
			const result = await compactSession(sid);
			return Response.json({ ok: true, command: "compact", result });
		} catch (err) {
			return Response.json({
				ok: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return Response.json({ ok: false, error: `Unknown command: ${command}` }, { status: 400 });
}
