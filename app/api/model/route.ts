/**
 * Model API — get current model and switch models.
 *
 * GET  /api/model → { current, available }
 * POST /api/model → { provider, modelId }
 */

import { getModel } from "@mariozechner/pi-ai";
import { getOrCreateSingleton } from "../agent/singleton";

const AVAILABLE_MODELS = [
	{ provider: "anthropic", id: "claude-haiku-4.5", label: "Haiku 4.5", desc: "Fast & cheap" },
	{ provider: "anthropic", id: "claude-sonnet-4", label: "Sonnet 4", desc: "Balanced" },
	{ provider: "anthropic", id: "claude-opus-4", label: "Opus 4", desc: "Most capable" },
	{ provider: "openai", id: "gpt-4.1-mini", label: "GPT-4.1 Mini", desc: "Fast" },
	{ provider: "openai", id: "gpt-4.1", label: "GPT-4.1", desc: "Capable" },
	{ provider: "google", id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Google" },
	{ provider: "deepseek", id: "deepseek-chat", label: "DeepSeek V3", desc: "Cost effective" },
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

		await session.setModel(model);
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
