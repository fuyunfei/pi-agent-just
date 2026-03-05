import { compactSession, getFullSessionStats, getAvailableSkills, getOrCreateSingleton, getSessionId, toggleSkills, isSkillsEnabled } from "../singleton";

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

	if (command === "skills") {
		await getOrCreateSingleton(sid); // ensure session exists so skills are loaded
		const skills = getAvailableSkills(sid);
		const enabled = isSkillsEnabled(sid);
		return Response.json({ ok: true, command: "skills", skills, enabled });
	}

	if (command === "toggle-skills") {
		await getOrCreateSingleton(sid);
		const enabled = toggleSkills(sid);
		return Response.json({ ok: true, command: "toggle-skills", enabled });
	}

	return Response.json({ ok: false, error: `Unknown command: ${command}` }, { status: 400 });
}
