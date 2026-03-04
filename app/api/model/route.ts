/**
 * Model & thinking API — get/set current model and thinking level.
 *
 * GET  /api/model → { current, available, thinking }
 * POST /api/model → { provider, modelId } and/or { thinkingLevel }
 */

import { getModel } from "@mariozechner/pi-ai";
import { getOrCreateSingleton, getSessionId } from "../agent/singleton";
import { AVAILABLE_MODELS } from "@/app/lib/models";

function getThinkingState(session: ReturnType<typeof getOrCreateSingleton>["session"]) {
	return {
		level: session.thinkingLevel,
		available: session.getAvailableThinkingLevels(),
		supported: session.supportsThinking(),
	};
}

export async function GET(req: Request) {
	try {
		const sid = getSessionId(req);
		const { session } = getOrCreateSingleton(sid);
		const model = session.model;
		return Response.json({
			current: model
				? { provider: model.provider, id: model.id, name: model.name }
				: null,
			available: AVAILABLE_MODELS,
			thinking: getThinkingState(session),
		});
	} catch (err) {
		return Response.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const { provider, modelId, thinkingLevel } = body;

		const sid = getSessionId(req);
		const { session } = getOrCreateSingleton(sid);

		// Switch model if requested
		if (provider && modelId) {
			const isOpenRouter = !!process.env.OPENROUTER_API_KEY;
			const resolvedProvider = isOpenRouter ? "openrouter" : provider;
			const resolvedModelId = isOpenRouter && provider !== "openrouter"
				? `${provider}/${modelId}`
				: modelId;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const model = getModel(resolvedProvider as any, resolvedModelId as any);
			if (!model) {
				return Response.json(
					{ error: `Model "${resolvedProvider}/${resolvedModelId}" not found` },
					{ status: 404 },
				);
			}

			const prev = session.model;
			await session.setModel(model);
			console.log(`[model] switch ${prev?.provider}/${prev?.id} -> ${model.provider}/${model.id}`);
		}

		// Switch thinking level if requested
		if (thinkingLevel) {
			session.setThinkingLevel(thinkingLevel);
			console.log(`[model] thinking → ${session.thinkingLevel}`);
		}

		const model = session.model;
		return Response.json({
			ok: true,
			model: model ? { provider: model.provider, id: model.id, name: model.name } : null,
			thinking: getThinkingState(session),
		});
	} catch (err) {
		return Response.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}
