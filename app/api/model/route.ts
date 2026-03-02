/**
 * Model API — get current model and switch models.
 *
 * GET  /api/model → { current, available }
 * POST /api/model → { provider, modelId }
 */

import { getModel } from "@mariozechner/pi-ai";
import { getOrCreateSingleton } from "../agent/singleton";

const AVAILABLE_MODELS = [
	{ provider: "google", id: "gemini-3-flash-preview", label: "Gemini 3 Flash", desc: "Fast" },
	{ provider: "google", id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", desc: "Capable" },
	{ provider: "google", id: "gemini-3.1-pro-preview-customtools", label: "Gemini 3.1 Pro CT", desc: "Custom tools" },
	{ provider: "google", id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", desc: "Cheapest" },
	{ provider: "anthropic", id: "claude-haiku-4.5", label: "Haiku 4.5", desc: "Fast" },
	{ provider: "anthropic", id: "claude-opus-4.6", label: "Opus 4.6", desc: "Most capable" },
	{ provider: "deepseek", id: "deepseek-v3.2", label: "DeepSeek V3.2", desc: "Cost effective" },
	{ provider: "moonshotai", id: "kimi-k2.5", label: "Kimi K2.5", desc: "Moonshot" },
	{ provider: "minimax", id: "minimax-m2.5", label: "MiniMax M2.5", desc: "MiniMax" },
] as const;

export async function GET() {
	try {
		const { session } = getOrCreateSingleton();
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

		const { session } = getOrCreateSingleton();

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
