/**
 * Model API — get current model and switch models.
 *
 * GET  /api/model → { current, available }
 * POST /api/model → { provider, modelId }
 */

import { getModel } from "@mariozechner/pi-ai";
import { getOrCreateSingleton, getSessionId } from "../agent/singleton";
import { AVAILABLE_MODELS } from "@/app/lib/models";

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
		const { provider, modelId } = await req.json();
		if (!provider || !modelId) {
			return Response.json(
				{ error: "Expected { provider, modelId }" },
				{ status: 400 },
			);
		}

		const sid = getSessionId(req);
		const { session } = getOrCreateSingleton(sid);

		// For non-openrouter providers, use openrouter as the actual provider
		// with the format "provider/modelId" as the model ID
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
		return Response.json({
			ok: true,
			model: { provider: model.provider, id: model.id, name: model.name },
		});
	} catch (err) {
		return Response.json(
			{ error: err instanceof Error ? err.message : String(err) },
			{ status: 500 },
		);
	}
}
