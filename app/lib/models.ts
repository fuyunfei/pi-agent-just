export interface ModelDef {
	provider: string;
	id: string;
	label: string;
	desc: string;
}

export const AVAILABLE_MODELS: ModelDef[] = [
	{ provider: "google", id: "gemini-3-flash-preview", label: "Gemini 3 Flash", desc: "Fast" },
	{ provider: "google", id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", desc: "Capable" },
	{ provider: "google", id: "gemini-3.1-pro-preview-customtools", label: "Gemini 3.1 Pro CT", desc: "Custom tools" },
	{ provider: "google", id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite", desc: "Cheapest" },
	{ provider: "anthropic", id: "claude-haiku-4.5", label: "Haiku 4.5", desc: "Fast" },
	{ provider: "anthropic", id: "claude-opus-4.6", label: "Opus 4.6", desc: "Most capable" },
	{ provider: "deepseek", id: "deepseek-v3.2", label: "DeepSeek V3.2", desc: "Cost effective" },
	{ provider: "moonshotai", id: "kimi-k2.5", label: "Kimi K2.5", desc: "Moonshot" },
	{ provider: "minimax", id: "minimax-m2.5", label: "MiniMax M2.5", desc: "MiniMax" },
	{ provider: "openai", id: "gpt-5.3-chat", label: "GPT-5.3", desc: "OpenAI" },
	{ provider: "qwen", id: "qwen3.5-flash-02-23", label: "Qwen 3.5 Flash", desc: "Qwen" },
];

export const DEFAULT_MODEL = AVAILABLE_MODELS[0];
