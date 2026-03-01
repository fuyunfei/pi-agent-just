import { compactSession, getFullSessionStats } from "../singleton";

export async function POST(req: Request) {
	const { command } = await req.json();

	if (command === "session") {
		const stats = getFullSessionStats();
		if (!stats) {
			return Response.json({ ok: false, error: "No active session" });
		}
		return Response.json({ ok: true, command: "session", stats });
	}

	if (command === "compact") {
		try {
			const result = await compactSession();
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
