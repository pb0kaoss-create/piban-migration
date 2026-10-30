import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BASE_URL = "https://ai-gateway.kilo.ai/api/v1";

export default async function (pi: ExtensionAPI) {
  const res = await fetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${process.env.KILO_API_KEY}` },
  });
  if (!res.ok) return; // Kilo injoignable : Pi démarre quand même

  const { data } = (await res.json()) as { data: any[] };

  pi.registerProvider("kilo", {
    name: "Kilo Gateway",
    baseUrl: BASE_URL,
    apiKey: "$KILO_API_KEY",
    api: "openai-completions",
    models: data.map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      reasoning: (m.supported_parameters ?? []).includes("reasoning"),
      input: (m.architecture?.input_modalities ?? ["text"]).includes("image")
        ? ["text", "image"]
        : ["text"],
      // Kilo donne un prix par token, Pi attend un prix par million de tokens
      cost: {
        input: Number(m.pricing?.prompt ?? 0) * 1e6,
        output: Number(m.pricing?.completion ?? 0) * 1e6,
        cacheRead: Number(m.pricing?.input_cache_read ?? 0) * 1e6,
        cacheWrite: Number(m.pricing?.input_cache_write ?? 0) * 1e6,
      },
      contextWindow: m.context_length ?? 128000,
      maxTokens: m.top_provider?.max_completion_tokens ?? 16384,
    })),
  });
}
